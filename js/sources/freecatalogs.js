// Free, legal sources confirmed from catalog files that a weekly GitHub Action
// downloads with each source's permission and publishes with this site:
//   Project Gutenberg  offline catalog (gutenberg.org/ebooks/offline_catalogs)
//   LibriVox           official API (librivox.org/api/info)
//   Standard Ebooks    free New Releases feed, plus Open Library's link records
//   Baen Free Library  baen.com/library (only if its robots rules allow; see scripts/build-data.mjs)
// The browser only downloads these files from this site, never from the sources.

import { fetchLocal } from '../net.js';
import { DATA_BASE } from '../config.js';
import { detectAbridgment, isDramatized, titlesMatch, authorsMatch, normalizeTitle } from '../text.js';

export const info = {
  id: 'freecatalogs',
  name: 'Free catalogs (Project Gutenberg, LibriVox, Standard Ebooks, Baen)',
  credit: 'Project Gutenberg, LibriVox, Standard Ebooks, Baen Free Library',
  contacts: [], // files are served by this site (GitHub Pages)
};

export async function meta() {
  try {
    return await fetchLocal(`${DATA_BASE}meta.json`);
  } catch {
    return null;
  }
}

async function load(name) {
  try {
    return await fetchLocal(`${DATA_BASE}${name}`);
  } catch {
    return null;
  }
}

let gutenbergSet = null;
async function gutenberg() {
  if (gutenbergSet) return gutenbergSet;
  const data = await load('gutenberg.json'); // { fetchedAt, books: { id: [title, author] } }
  if (!data) return null;
  // Index by normalized title once, so lookups stay fast on phones.
  data.byTitle = new Map();
  for (const [id, v] of Object.entries(data.books)) {
    const k = normalizeTitle(v[0]);
    if (!data.byTitle.has(k)) data.byTitle.set(k, []);
    data.byTitle.get(k).push(id);
  }
  gutenbergSet = data;
  return data;
}

let librivoxData = null;
export async function librivoxIndex() {
  if (librivoxData) return librivoxData;
  const data = await load('librivox.json'); // { fetchedAt, books: [{ id, t, a, s, r, u, d, ab }] }
  if (!data) return null;
  data.byTitle = new Map();
  data.byId = new Map();
  for (const b of data.books) {
    const k = normalizeTitle(b.t);
    if (!data.byTitle.has(k)) data.byTitle.set(k, []);
    data.byTitle.get(k).push(b);
    data.byId.set(String(b.id), b);
  }
  librivoxData = data;
  return data;
}

async function standardEbooks() {
  return load('standard-ebooks.json'); // { fetchedAt, books: [{ url, t, a }] }
}

async function baen() {
  return load('baen.json'); // { fetchedAt, books: [{ url, t, a }] }
}

export async function availability(work) {
  const out = [];
  const authorNames = (work.authors || []).map((a) => a.name);

  // Project Gutenberg
  const g = await gutenberg();
  if (g) {
    let ids = (work.gutenbergIds || []).filter((id) => g.books[id]);
    if (!ids.length) {
      ids = (g.byTitle.get(normalizeTitle(work.title)) || [])
        .filter((id) => authorsMatch(g.books[id][1].split(';'), authorNames))
        .slice(0, 3);
    }
    for (const id of ids.slice(0, 3)) {
      const [title] = g.books[id];
      out.push({
        sourceId: 'gutenberg', credit: 'Project Gutenberg', service: 'Project Gutenberg', format: 'ebook',
        status: 'free', kind: 'free', confirmed: true,
        url: `https://www.gutenberg.org/ebooks/${encodeURIComponent(id)}`,
        checkedAt: g.fetchedAt, abridged: detectAbridgment(title), editionTitle: title,
        note: 'Public domain in the United States.',
      });
    }
  } else {
    out.push(unavailableIndex('gutenberg', 'Project Gutenberg', 'ebook', `https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(work.title)}`));
  }

  // Standard Ebooks: Open Library's link record, or the free New Releases feed.
  const seIds = new Set((work.standardEbooksIds || []).filter((id) => /^[a-z0-9-]+\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(id)));
  const se = await standardEbooks();
  if (se) {
    for (const b of se.books) {
      if (titlesMatch(b.t, work.title) && authorsMatch([b.a], authorNames)) {
        seIds.add(b.url.replace('https://standardebooks.org/ebooks/', ''));
      }
    }
  }
  for (const id of [...seIds].slice(0, 2)) {
    out.push({
      sourceId: 'standardebooks', credit: work.standardEbooksIds?.includes(id) ? 'Open Library record of Standard Ebooks' : 'Standard Ebooks',
      service: 'Standard Ebooks', format: 'ebook', status: 'free', kind: 'free', confirmed: true,
      url: `https://standardebooks.org/ebooks/${id}`, checkedAt: se?.fetchedAt || null, abridged: null,
      note: 'Public domain in the United States.',
    });
  }

  // Baen Free Library
  const bn = await baen();
  if (bn) {
    for (const b of bn.books) {
      if (titlesMatch(b.t, work.title) && (!b.a || authorsMatch([b.a], authorNames))) {
        out.push({
          sourceId: 'baen', credit: 'Baen Free Library', service: 'Baen Free Library', format: 'ebook',
          status: 'free', kind: 'free', confirmed: true, url: b.url, checkedAt: bn.fetchedAt, abridged: null,
          note: 'Given away free by the publisher.',
        });
      }
    }
  }

  // LibriVox
  const lv = await librivoxIndex();
  if (lv) {
    const wanted = new Set((work.librivoxIds || []).map(String));
    let hits = [...wanted].map((id) => lv.byId.get(id)).filter(Boolean);
    if (!hits.length) hits = (lv.byTitle.get(normalizeTitle(work.title)) || []).filter((b) => authorsMatch(b.a, authorNames));
    for (const b of hits.slice(0, 6)) {
      out.push({
        sourceId: 'librivox', credit: 'LibriVox', service: 'LibriVox', format: 'audiobook', status: 'free', kind: 'free',
        confirmed: true, url: b.u, checkedAt: lv.fetchedAt,
        abridged: b.ab === true ? true : detectAbridgment(b.t),
        dramatized: Boolean(b.d) || isDramatized(b.t),
        narrators: b.r || [], durationSecs: b.s || null, editionTitle: b.t,
        note: 'Public-domain recording.',
      });
    }
  } else {
    out.push(unavailableIndex('librivox', 'LibriVox', 'audiobook', `https://librivox.org/search?q=${encodeURIComponent(work.title)}&search_form=advanced`));
  }
  return out;
}

function unavailableIndex(sourceId, name, format, url) {
  return {
    sourceId, credit: name, service: name, format, status: 'error', kind: 'free', confirmed: false, url,
    note: "Couldn't check: the free catalog file has not been downloaded yet.",
  };
}

// Narrator search over the LibriVox index (the only permitted source of narrator names).
export async function searchNarrator(name) {
  const lv = await librivoxIndex();
  if (!lv) return null;
  const needle = name.toLowerCase().trim();
  if (needle.length < 2) return [];
  return lv.books.filter((b) => b.ab !== true && (b.r || []).some((r) => r.toLowerCase().includes(needle))).slice(0, 60);
}
