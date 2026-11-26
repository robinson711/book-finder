import { h, $, setMain, setTitle, bookGrid, statusChip, errorBox, seriesHref, authorHref, searchHref, wireCoverFallbacks } from '../ui.js';
import { searchBox, wireSearchBox } from './searchbox.js';
import { readFilters, filterForm, wireFilters, applyRecordFilters, applyAvailabilityFilters, chipsFor, needsCheck } from './filters.js';
import * as openlibrary from '../sources/openlibrary.js';
import * as wikidata from '../sources/wikidata.js';
import * as freecatalogs from '../sources/freecatalogs.js';
import { fetchJson } from '../net.js';
import { cleanIsbn, isValidIsbn, formatDuration, prefixQuery, coversQuery } from '../text.js';

const PER_PAGE = 24;

export async function render({ params, isCurrent }) {
  const q = (params.get('q') || '').trim();
  const type = params.get('type') || 'all';
  const page = Math.max(1, Number(params.get('page') || 1));
  const f = readFilters(params);
  setTitle(q ? `Search: ${q}` : 'Search');
  const main = setMain(`<h1>Search</h1>${searchBox(q, type)}
    ${['all', 'title', 'author', 'isbn'].includes(type) ? filterForm(f) : ''}
    <div id="results" aria-live="polite"><p class="loading">Searching…</p></div>`);
  wireSearchBox(main);
  wireFilters(main, params);
  const out = $('#results');
  if (!q) {
    out.innerHTML = '<p class="muted">Type something to search.</p>';
    return;
  }
  try {
    if (type === 'series') return await seriesSearch(q, out);
    if (type === 'narrator') return await narratorSearch(q, out);
    if (type === 'author') await authorList(q, out);
    let query = {};
    if (type === 'isbn') {
      const isbn = cleanIsbn(q);
      if (!isValidIsbn(isbn)) {
        out.innerHTML = errorBox('That is not a valid ISBN. An ISBN has 10 or 13 digits; check for a typing mistake.');
        return;
      }
      query = { isbn };
    } else if (type === 'title') query = { title: q };
    else if (type === 'author') query = { author: q };
    else query = { q };
    // Partial last word ("project hail mar"): if the plain search finds nothing that
    // matches every word, search again with the last word as the start of a word.
    const field = type === 'title' ? 'title' : type === 'author' ? 'author' : type === 'isbn' ? null : 'q';
    const prefixed = field ? prefixQuery(q) : null;
    let usedPrefix = false;
    let res;
    if (prefixed && params.get('prefix') === '1') {
      res = await openlibrary.search({ ...query, [field]: prefixed, page, limit: PER_PAGE });
      usedPrefix = true;
    } else {
      res = await openlibrary.search({ ...query, page, limit: PER_PAGE });
      if (prefixed && page === 1 && !coversQuery(res.works, q)) {
        const alt = await openlibrary.search({ ...query, [field]: prefixed, page, limit: PER_PAGE }).catch(() => null);
        if (alt && coversQuery(alt.works, q, { lastIsPrefix: true })) {
          res = alt;
          usedPrefix = true;
          params.set('prefix', '1');
        }
      }
    }
    if (!isCurrent()) return;
    let works = applyRecordFilters(res.works, f);
    if (needsCheck(f)) {
      out.innerHTML = '<p class="loading">Checking confirmed availability for these results…</p>';
      works = await applyAvailabilityFilters(works, f, (i, n) => {
        if (isCurrent()) out.innerHTML = `<p class="loading">Checking ${i} of ${n}…</p>`;
      });
      if (!isCurrent()) return;
    }
    const pages = Math.ceil(res.total / PER_PAGE);
    const listHtml = works.length
      ? bookGrid(works, chipsFor(works, statusChip))
      : `<p class="empty">No books matched${needsCheck(f) ? ' with confirmed availability on this page of results' : ''}.${type === 'isbn' ? ' Open Library has no record of this ISBN.' : ''}</p>`;
    const extra = type === 'author' ? out.innerHTML : '';
    out.innerHTML = `${extra}<h2>Books</h2><p class="small muted">${res.total.toLocaleString()} results from Open Library${pages > 1 ? `, page ${page} of ${pages.toLocaleString()}` : ''}.${usedPrefix ? ` Including words that start with “${h(q.trim().split(/\s+/).pop())}”.` : ''}</p>${listHtml}${pager(params, page, pages)}`;
    wireCoverFallbacks(out);
  } catch (err) {
    out.innerHTML = errorBox(`Couldn't search right now. ${err.message || ''}`, { url: `https://openlibrary.org/search?q=${encodeURIComponent(q)}`, text: 'Search Open Library directly' });
  }
}

function pager(params, page, pages) {
  if (pages <= 1) return '';
  const link = (p, text) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    return `<a class="button" href="#/search?${next.toString()}">${text}</a>`;
  };
  return `<nav class="pager" aria-label="Result pages">${page > 1 ? link(page - 1, 'Previous page') : '<span></span>'}${page < pages ? link(page + 1, 'Next page') : ''}</nav>`;
}

async function authorList(q, out) {
  try {
    const u = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(q)}&limit=8`;
    const { data } = await fetchJson(u, { ttlMinutes: 60 * 6 });
    const docs = (data.docs || []).filter((d) => /^OL\d+A$/.test(d.key));
    out.innerHTML = docs.length
      ? `<h2>Authors</h2><ul class="list-rows">${docs.map((d) => `<li><span></span><div><a href="${authorHref(d.key)}"><strong>${h(d.name)}</strong></a><div class="small muted">${d.work_count ? `${d.work_count} works` : ''}${d.top_work ? ` · Best known for ${h(d.top_work)}` : ''}</div></div><span></span></li>`).join('')}</ul>`
      : '';
  } catch {
    out.innerHTML = '';
  }
}

async function seriesSearch(q, out) {
  try {
    const list = await wikidata.searchSeries(q);
    out.innerHTML = list.length
      ? `<h2>Series</h2><ul class="list-rows">${list.map((s) => `<li><span></span><div><a href="${seriesHref(s.id)}"><strong>${h(s.name)}</strong></a><div class="small muted">${h(s.description || '')}</div></div><span></span></li>`).join('')}</ul><p class="small muted">Series information from Wikidata.</p>`
      : `<p class="empty">No series found with that name on Wikidata. <a href="${searchHref(q, 'all')}">Search everything for "${h(q)}"</a>.</p>`;
  } catch (err) {
    out.innerHTML = errorBox("Couldn't search series right now.", { url: `https://www.wikidata.org/w/index.php?search=${encodeURIComponent(q)}`, text: 'Search Wikidata directly' });
  }
}

async function narratorSearch(q, out) {
  const list = await freecatalogs.searchNarrator(q);
  if (list === null) {
    out.innerHTML = '<p class="notice">Narrator search uses the free LibriVox catalog file, which has not been downloaded yet.</p>';
    return;
  }
  out.innerHTML = `<p class="notice">Narrator names come only from LibriVox (free public-domain recordings). Other audiobook services do not offer narrator data through a permitted source.</p>
    ${list.length ? `<ul class="list-rows">${list.map((b) => `<li><span></span><div><a href="${searchHref(`${b.t} ${(b.a || [])[0] || ''}`, 'all')}"><strong>${h(b.t)}</strong></a><div class="small muted">${h((b.a || []).join(', '))} · Read by ${h((b.r || []).slice(0, 5).join(', '))}${(b.r || []).length > 5 ? ' and others' : ''}${b.s ? ` · ${h(formatDuration(b.s))}` : ''}</div></div><span></span></li>`).join('')}</ul>` : '<p class="empty">No LibriVox recordings by that narrator.</p>'}`;
}
