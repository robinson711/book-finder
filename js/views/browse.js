import { h, $, setMain, setTitle, bookGrid, statusChip, errorBox, searchHref, wireCoverFallbacks } from '../ui.js';
import * as openlibrary from '../sources/openlibrary.js';
import * as wikidata from '../sources/wikidata.js';
import * as freecatalogs from '../sources/freecatalogs.js';
import { readFilters, filterForm, wireFilters, applyRecordFilters, applyAvailabilityFilters, chipsFor, needsCheck } from './filters.js';
import { lightCheckMany, statusFor } from '../availability.js';
import { formatDuration } from '../text.js';

// Genres and subgenres map to Open Library subject tags.
export const GENRES = [
  ['Science fiction', 'science fiction', ['Space opera', 'Cyberpunk', 'Time travel', 'Dystopias', 'Hard science fiction', 'Artificial intelligence']],
  ['Fantasy', 'fantasy', ['Epic fantasy', 'Urban fantasy', 'Dragons', 'Magic', 'Fairy tales']],
  ['Mystery', 'mystery and detective stories', ['Detective and mystery stories', 'Police procedural', 'Private investigators', 'Cozy mystery']],
  ['Thriller and suspense', 'thrillers', ['Suspense', 'Espionage', 'Psychological fiction', 'Legal stories']],
  ['Romance', 'romance', ['Historical romance', 'Romantic suspense', 'Love stories']],
  ['Historical fiction', 'historical fiction', ['World War, 1939-1945', 'Regency', 'Medieval']],
  ['Horror', 'horror', ['Ghost stories', 'Vampires', 'Haunted houses']],
  ['Literary fiction', 'literary fiction', ['Domestic fiction', 'Family life', 'Coming of age']],
  ['Classics', 'classic literature', ['Adventure stories', 'Sea stories', 'Gothic fiction']],
  ['Westerns', 'western stories', []],
  ['Humor', 'humor', ['Humorous fiction', 'Satire']],
  ['Biography and memoir', 'biography', ['Autobiography', 'Memoirs']],
  ['History', 'history', ['United States history', 'Military history', 'Ancient history']],
  ['Science', 'science', ['Astronomy', 'Physics', 'Biology', 'Popular works']],
  ['True crime', 'true crime', []],
  ['Self-help', 'self-help', ['Personal development', 'Success']],
  ['Business and money', 'business', ['Economics', 'Personal finance', 'Leadership']],
  ['Poetry', 'poetry', []],
];

// Moods have no dedicated data source; they use Open Library subject tags and say so.
export const MOODS = [
  ['Funny', 'humorous fiction'],
  ['Suspenseful', 'suspense'],
  ['Dark', 'gothic fiction'],
  ['Heartwarming', 'friendship'],
  ['Adventurous', 'adventure stories'],
  ['Thought-provoking', 'philosophy'],
  ['Romantic', 'love stories'],
  ['Spooky', 'ghost stories'],
];

const LENGTH_QUERIES = {
  short: ['Short reads (under 200 pages)', 'number_of_pages_median:[1 TO 199]'],
  medium: ['Medium length (200 to 400 pages)', 'number_of_pages_median:[200 TO 400]'],
  long: ['Long reads (over 400 pages)', 'number_of_pages_median:[401 TO 5000]'],
};

export async function render({ match, params, isCurrent }) {
  const rest = (match[1] || '').split('/').map(decodeURIComponent);
  const [kind, value] = rest;
  if (!kind) return renderIndex();
  if (kind === 'subject') return renderSubject(value, params, isCurrent, `Subject: ${value}`);
  if (kind === 'genre') return renderSubject(value, params, isCurrent, value, true);
  if (kind === 'mood') return renderSubject(value, params, isCurrent, `Mood: ${MOODS.find((m) => m[1] === value)?.[0] || value}`, false, 'Mood is based on Open Library subject tags, not reviews.');
  if (kind === 'new') return renderQuery('New releases', `first_publish_year:[${new Date().getFullYear() - 1} TO ${new Date().getFullYear()}]`, params, isCurrent, 'new');
  if (kind === 'length' && LENGTH_QUERIES[value]) return renderQuery(LENGTH_QUERIES[value][0], LENGTH_QUERIES[value][1], params, isCurrent, 'rating');
  if (kind === 'classics') return renderQuery('Public-domain classics', 'public_scan_b:true subject:"classic literature"', params, isCurrent, 'rating', true);
  if (kind === 'available') return renderQuery('Available now: free ebooks', 'public_scan_b:true', params, isCurrent, 'rating', true);
  if (kind === 'audiobooks') return renderFreeAudio(params);
  if (kind === 'awards') return value ? renderAward(value, isCurrent) : renderAwardList();
  if (kind === 'starters') return renderStarters(isCurrent);
  if (kind === 'bestsellers') return renderBestsellers();
  return renderIndex();
}

function link(href, text) {
  return `<a class="button" href="${href}">${h(text)}</a>`;
}

function renderIndex() {
  setTitle('Browse');
  const p = (x) => encodeURIComponent(x);
  setMain(`<h1>Browse</h1>
    <h2>Available now</h2><div class="row">${link('#/browse/available', 'Free ebooks')}${link('#/browse/audiobooks', 'Free audiobooks')}${link('#/browse/classics', 'Public-domain classics')}</div>
    <h2>Genres</h2>
    <ul class="list-rows">${GENRES.map(([name, subj, subs]) => `<li><span></span><div><a href="#/browse/genre/${p(subj)}"><strong>${h(name)}</strong></a>
      ${subs.length ? `<div class="row small">${subs.map((s) => `<a href="#/browse/genre/${p(s.toLowerCase())}">${h(s)}</a>`).join(' · ')}</div>` : ''}</div><span></span></li>`).join('')}</ul>
    <h2>New and notable</h2><div class="row">${link('#/browse/new', 'New releases')}${link('#/browse/awards', 'Award winners')}${link('#/browse/starters', 'Series starters')}${link('#/browse/bestsellers', 'Bestsellers')}</div>
    <h2>Length</h2><div class="row">${link('#/browse/length/short', 'Short reads')}${link('#/browse/length/medium', 'Medium')}${link('#/browse/length/long', 'Long reads')}</div>
    <h2>Mood</h2><p class="small muted">Based on Open Library subject tags.</p><div class="row">${MOODS.map(([n, s]) => link(`#/browse/mood/${p(s)}`, n)).join('')}</div>`);
}

async function renderSubject(subject, params, isCurrent, title, isGenre = false, note = '') {
  return renderQuery(title, `subject:"${subject.replace(/"/g, '')}"`, params, isCurrent, params.get('sort') || 'rating', false, note);
}

async function renderQuery(title, extra, params, isCurrent, sort = 'rating', freeOnly = false, note = '') {
  setTitle(title);
  const page = Math.max(1, Number(params.get('page') || 1));
  const f = readFilters(params);
  const main = setMain(`<h1>${h(title)}</h1>${note ? `<p class="small muted">${h(note)}</p>` : ''}${filterForm(f)}<div id="results"><p class="loading">Loading…</p></div>`);
  wireFilters(main, params);
  const out = $('#results');
  try {
    const res = await openlibrary.search({ extra, sort, page, limit: 24 });
    if (!isCurrent()) return;
    let works = applyRecordFilters(res.works, f);
    if (freeOnly) {
      out.innerHTML = '<p class="loading">Confirming free copies…</p>';
      await lightCheckMany(works, (i, n) => isCurrent() && (out.innerHTML = `<p class="loading">Confirming ${i} of ${n}…</p>`));
      works = works.filter((w) => statusFor(w.workKey)?.free);
    }
    if (needsCheck(f)) works = await applyAvailabilityFilters(works, f, (i, n) => isCurrent() && (out.innerHTML = `<p class="loading">Checking ${i} of ${n}…</p>`));
    if (!isCurrent()) return;
    const next = new URLSearchParams(params);
    next.set('page', String(page + 1));
    const prev = new URLSearchParams(params);
    prev.set('page', String(page - 1));
    const base = location.hash.split('?')[0];
    out.innerHTML = `${freeOnly ? '<p class="small muted">Only books confirmed free to read in the United States are shown.</p>' : ''}
      ${works.length ? bookGrid(works, chipsFor(works, statusChip)) : '<p class="empty">No books on this page matched.</p>'}
      <nav class="pager" aria-label="Pages">${page > 1 ? `<a class="button" href="${base}?${prev}">Previous page</a>` : '<span></span>'}${res.total > page * 24 ? `<a class="button" href="${base}?${next}">Next page</a>` : ''}</nav>
      <p class="credits">Books: Open Library.</p>`;
    wireCoverFallbacks(out);
  } catch {
    out.innerHTML = errorBox("Couldn't load books right now.", { url: 'https://openlibrary.org/subjects', text: 'Browse on Open Library' });
  }
}

async function renderFreeAudio(params) {
  setTitle('Free audiobooks');
  const main = setMain('<h1>Free audiobooks</h1><div id="results"><p class="loading">Loading…</p></div>');
  const lv = await freecatalogs.librivoxIndex();
  const out = $('#results', main);
  if (!lv) {
    out.innerHTML = '<p class="notice">The free LibriVox catalog file has not been downloaded yet.</p>';
    return;
  }
  const page = Math.max(1, Number(params.get('page') || 1));
  const list = lv.books.filter((b) => b.ab !== true).slice((page - 1) * 50, page * 50);
  out.innerHTML = `<p class="small muted">Public-domain recordings from LibriVox, newest first. Catalog downloaded ${h(new Date(lv.fetchedAt).toLocaleDateString())}.</p>
    <ul class="list-rows">${list.map((b) => `<li><span></span><div><a href="${searchHref(`${b.t} ${(b.a || [])[0] || ''}`, 'all')}"><strong>${h(b.t)}</strong></a>
      <div class="small muted">${h((b.a || []).join(', '))}${b.s ? ` · ${h(formatDuration(b.s))}` : ''}${b.r?.length ? ` · Read by ${h(b.r.slice(0, 3).join(', '))}${b.r.length > 3 ? ' and others' : ''}` : ''}</div>
      ${b.d ? '<span class="chip warn">Dramatized</span>' : ''}</div>
      <a class="button" href="${h(b.u)}" target="_blank" rel="noopener noreferrer">LibriVox<span class="visually-hidden"> (opens in a new tab)</span></a></li>`).join('')}</ul>
    <nav class="pager">${page > 1 ? `<a class="button" href="#/browse/audiobooks?page=${page - 1}">Previous</a>` : '<span></span>'}${lv.books.length > page * 50 ? `<a class="button" href="#/browse/audiobooks?page=${page + 1}">Next</a>` : ''}</nav>`;
}

function renderAwardList() {
  setTitle('Award winners');
  setMain(`<h1>Award winners</h1><ul class="list-rows">${wikidata.AWARDS.map((a) => `<li><span></span><a href="#/browse/awards/${encodeURIComponent(a)}"><strong>${h(a)}</strong></a><span></span></li>`).join('')}</ul><p class="credits">Award data: Wikidata.</p>`);
}

async function renderAward(name, isCurrent) {
  setTitle(name);
  const main = setMain(`<h1>${h(name)}</h1><div id="results"><p class="loading">Loading winners…</p></div>`);
  const out = $('#results', main);
  try {
    const { books } = await wikidata.awardWinners(name);
    if (!isCurrent()) return;
    const known = books.filter((b) => b.workKey);
    let works = [];
    try {
      works = await openlibrary.worksByKeys(known.map((b) => b.workKey));
    } catch {
      /* titles still show */
    }
    const byKey = new Map(works.map((w) => [w.workKey, w]));
    out.innerHTML = books.length
      ? `<ul class="list-rows">${books.map((b) => {
          const w = b.workKey && byKey.get(b.workKey);
          const href = w ? `#/book/${w.workKey}` : searchHref(`${b.title} ${b.author || ''}`, 'all');
          return `<li><span><strong>${h(b.year || '')}</strong></span><div><a href="${href}"><strong>${h(b.title)}</strong></a><div class="small muted">${h(b.author || '')}</div></div><span></span></li>`;
        }).join('')}</ul><p class="credits">Award data: Wikidata. Book details: Open Library.</p>`
      : '<p class="empty">No winners recorded on Wikidata.</p>';
  } catch {
    out.innerHTML = errorBox("Couldn't load award winners.", { url: 'https://www.wikidata.org', text: 'Wikidata' });
  }
}

async function renderStarters(isCurrent) {
  setTitle('Series starters');
  const main = setMain('<h1>Series starters</h1><p class="small muted">First books of series since 1990, newest first, from Wikidata.</p><div id="results"><p class="loading">Loading…</p></div>');
  const out = $('#results', main);
  try {
    const { books } = await wikidata.seriesStarters();
    const works = await openlibrary.worksByKeys(books.slice(0, 60).map((b) => b.workKey));
    if (!isCurrent()) return;
    out.innerHTML = bookGrid(works, chipsFor(works, statusChip));
    wireCoverFallbacks(out);
  } catch {
    out.innerHTML = errorBox("Couldn't load series starters.", null);
  }
}

function renderBestsellers() {
  setTitle('Bestsellers');
  setMain(`<h1>Bestsellers</h1><p class="notice">Unavailable. The New York Times Books API needs a key, and its terms could not be confirmed, so this site does not show bestseller lists. It can be added later if its terms allow it.</p>`);
}
