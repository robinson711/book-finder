#!/usr/bin/env node
// Builds the free-catalog files in data/ that the site reads.
// Run by GitHub Actions when the site is published (weekly, and on every update).
// Each source is used the way its owner asks:
//  - Project Gutenberg: its offline catalog file, "instead of crawling or roboting the website".
//  - LibriVox: its public API, with a pause between requests.
//  - Standard Ebooks: its free New Releases feed (the full catalog feeds are members-only).
//  - Baen Free Library: its public Free Library list, only if baen.com/robots.txt allows it,
//    honoring its Crawl-delay.
// A source that fails is recorded in data/meta.json; the site then says "Couldn't check".

import { writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../js/importers.js';

const OUT = new URL('../data/', import.meta.url);
const UA = 'BookFinderCatalogBuilder/1.0 (non-commercial personal book site; weekly catalog refresh)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { binary = false, tries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) {
        const err = new Error(`${res.status} ${res.statusText} for ${url}`);
        err.status = res.status;
        throw err;
      }
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) {
      lastErr = e;
      // A 4xx answer (other than 429) will not change on retry.
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) break;
      await sleep(5000 * (i + 1));
    }
  }
  throw lastErr;
}

const now = new Date().toISOString();
const meta = { builtAt: now, sources: {} };

// ---------- Project Gutenberg ----------
export function gutenbergFromCsv(text) {
  const rows = parseCsv(text);
  const header = rows[0].map((x) => x.trim());
  const col = (n) => header.indexOf(n);
  const [ci, ct, cti, cl, ca, cs, cb] = ['Text#', 'Type', 'Title', 'Language', 'Authors', 'Subjects', 'Bookshelves'].map(col);
  const books = {};
  for (const r of rows.slice(1)) {
    if ((r[ct] || '').trim() !== 'Text') continue;
    const langs = (r[cl] || '').split(/[;,]\s*/).map((x) => x.trim());
    if (!langs.includes('en')) continue;
    const tags = `${r[cs] || ''} ${r[cb] || ''}`.toLowerCase();
    if (/juvenile|children's|comic|periodicals|magazine/.test(tags)) continue;
    const title = (r[cti] || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const authors = (r[ca] || '')
      .split(';')
      .map((a) => a.replace(/\[[^\]]*\]/g, '').replace(/,?\s*-?\d{3,4}\??-?(\d{3,4})?\??\s*(BCE|CE|AD|BC)?$/i, '').trim())
      .filter(Boolean)
      .map((a) => {
        const parts = a.split(',').map((x) => x.trim());
        return parts.length >= 2 ? `${parts[1].replace(/\s*\(.*\)$/, '')} ${parts[0]}` : a;
      });
    books[(r[ci] || '').trim()] = [title, authors.join(';')];
  }
  return books;
}

async function gutenberg() {
  const name = 'Project Gutenberg';
  try {
    // Gutenberg asks bulk users to prefer its mirrors; the main site is the last resort.
    const tries = [
      ['https://gutenberg.pglaf.org/cache/epub/feeds/pg_catalog.csv.gz', true],
      ['https://aleph.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz', true],
      ['https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz', true],
      ['https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv', false],
    ];
    let text;
    const errors = [];
    for (const [url, gz] of tries) {
      try {
        const body = await get(url, { binary: gz });
        text = (gz ? gunzipSync(body).toString('utf8') : body).replace(/^\uFEFF/, '');
        if (text.startsWith('Text#')) break;
        errors.push(`Unexpected content from ${url}`);
        text = undefined;
      } catch (e) {
        errors.push(String(e.message || e));
      }
    }
    if (!text) throw new Error(errors.join(' | '));
    const books = gutenbergFromCsv(text);
    const count = Object.keys(books).length;
    if (count < 1000) throw new Error(`Only ${count} books found; the catalog format may have changed.`);
    await writeFile(new URL('gutenberg.json', OUT), JSON.stringify({ fetchedAt: now, books }));
    meta.sources.gutenberg = { name, ok: true, count, fetchedAt: now };
  } catch (e) {
    meta.sources.gutenberg = { name, ok: false, error: String(e.message || e).slice(0, 600) };
  }
}

// ---------- LibriVox ----------
export function librivoxItem(b) {
  const t = String(b.title || '').trim();
  const readers = new Set();
  for (const s of b.sections || []) for (const r of s.readers || []) if (r.display_name) readers.add(r.display_name.trim());
  const lower = t.toLowerCase();
  return {
    id: Number(b.id),
    t,
    a: (b.authors || []).map((a) => `${a.first_name || ''} ${a.last_name || ''}`.trim()).filter(Boolean),
    s: Number(b.totaltimesecs) || null,
    r: [...readers].slice(0, 30),
    u: String(b.url_librivox || '').replace(/^http:/, 'https:'),
    d: /dramatic reading|dramati[sz]ed|radio play/.test(lower) || undefined,
    ab: (/\babridged\b/.test(lower) && !/\bunabridged\b/.test(lower)) || undefined,
  };
}

async function librivox() {
  const name = 'LibriVox';
  try {
    const books = [];
    for (let offset = 0; offset < 60000; offset += 500) {
      const url = `https://librivox.org/api/feed/audiobooks?format=json&extended=1&limit=500&offset=${offset}`;
      let text;
      try {
        text = await get(url);
      } catch (e) {
        // The API answers 404 once the offset passes the last record.
        if (e.status === 404 && offset > 0) break;
        throw e;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        break; // the API answers with a non-JSON "no results" page after the last record
      }
      const list = data.books || [];
      if (!list.length) break;
      for (const b of list) {
        if (String(b.language || '').toLowerCase() !== 'english') continue;
        if (!/^https?:\/\/librivox\.org\//.test(b.url_librivox || '')) continue;
        books.push(librivoxItem(b));
      }
      await sleep(3000); // be considerate, as LibriVox asks
    }
    if (books.length < 500) throw new Error(`Only ${books.length} recordings found.`);
    books.sort((x, y) => y.id - x.id);
    await writeFile(new URL('librivox.json', OUT), JSON.stringify({ fetchedAt: now, books }));
    meta.sources.librivox = { name, ok: true, count: books.length, fetchedAt: now };
  } catch (e) {
    meta.sources.librivox = { name, ok: false, error: String(e.message || e).slice(0, 200) };
  }
}

// ---------- Standard Ebooks (free New Releases feed) ----------
export function standardEbooksFromAtom(xml) {
  const books = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const title = (e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1];
    const author = (e.match(/<author>\s*<name>([\s\S]*?)<\/name>/) || [])[1];
    const link = (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || e.match(/<id>([^<]+)<\/id>/) || [])[1];
    if (title && link && /^https:\/\/standardebooks\.org\/ebooks\//.test(link)) {
      books.push({ url: link, t: decode(title.trim()), a: decode((author || '').trim()) });
    }
  }
  return books;
}
function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

async function standardEbooks() {
  const name = 'Standard Ebooks (new releases)';
  try {
    const books = standardEbooksFromAtom(await get('https://standardebooks.org/feeds/atom/new-releases'));
    if (!books.length) throw new Error('No entries in the feed.');
    await writeFile(new URL('standard-ebooks.json', OUT), JSON.stringify({ fetchedAt: now, books }));
    meta.sources.standardEbooks = { name, ok: true, count: books.length, fetchedAt: now };
  } catch (e) {
    meta.sources.standardEbooks = { name, ok: false, error: String(e.message || e).slice(0, 200) };
  }
}

// ---------- Baen Free Library ----------
export function robotsAllows(robotsTxt, path) {
  // Minimal robots.txt reader for the "*" group: Disallow rules with * wildcards.
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim());
  let inStar = false;
  let sawRuleInGroup = false;
  const rules = [];
  let delay = 0;
  for (const l of lines) {
    const [k, ...rest] = l.split(':');
    const v = rest.join(':').trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (key === 'user-agent') {
      if (sawRuleInGroup) {
        inStar = false;
        sawRuleInGroup = false;
      }
      if (v === '*') inStar = true;
    } else {
      sawRuleInGroup = true;
      if (!inStar) continue;
      if (key === 'disallow' && v) rules.push(new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')));
      if (key === 'crawl-delay') delay = Number(v) || 0;
    }
  }
  return { allowed: !rules.some((re) => re.test(path)), delaySeconds: delay };
}

export function baenFromHtml(html) {
  const books = [];
  const re = /<a href="(https:\/\/www\.baen\.com\/[a-z0-9-]+\.html)" class="slider-book-name">([^<]+)<\/a>[\s\S]{0,300}?class="slider-book-description">([^<]*)</g;
  for (const m of html.matchAll(re)) {
    const by = decode(m[3].trim());
    books.push({ url: m[1], t: decode(m[2].trim()), a: /^by /i.test(by) ? by.slice(3).trim() : '' });
  }
  return books;
}

async function baen() {
  const name = 'Baen Free Library';
  try {
    const robots = await get('https://www.baen.com/robots.txt');
    const books = new Map();
    for (let page = 1; page <= 10; page++) {
      const path = `/allbooks/category/index/id/2012?page=${page}`;
      const rule = robotsAllows(robots, path);
      if (!rule.allowed) throw new Error('baen.com robots.txt does not allow reading the Free Library list.');
      if (page > 1) await sleep(Math.max(5, rule.delaySeconds) * 1000);
      const found = baenFromHtml(await get(`https://www.baen.com${path}`));
      const before = books.size;
      for (const b of found) books.set(b.url, b);
      if (!found.length || books.size === before) break;
    }
    if (!books.size) throw new Error('No books found; the page layout may have changed.');
    await writeFile(new URL('baen.json', OUT), JSON.stringify({ fetchedAt: now, books: [...books.values()] }));
    meta.sources.baen = { name, ok: true, count: books.size, fetchedAt: now };
  } catch (e) {
    meta.sources.baen = { name, ok: false, error: String(e.message || e).slice(0, 200) };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(OUT, { recursive: true });
  await Promise.all([gutenberg(), librivox(), standardEbooks(), baen()]);
  await writeFile(new URL('meta.json', OUT), JSON.stringify(meta, null, 2));
  console.log(JSON.stringify(meta, null, 2));
}
