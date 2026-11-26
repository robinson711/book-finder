import * as store from '../store.js';
import {
  h, $, $$, setMain, setTitle, cover, availabilityRow, authorHref, seriesHref, bookGrid, statusChip, errorBox, announce, wireCoverFallbacks,
} from '../ui.js';
import * as openlibrary from '../sources/openlibrary.js';
import * as wikidata from '../sources/wikidata.js';
import { checkAll } from '../sources/index.js';
import { physicalCopyLink } from '../sources/library.js';
import { groupAvailability } from '../results.js';
import { recordStatus } from '../availability.js';
import { formatCheckedAt } from '../text.js';
import { comparePrice } from '../alerts.js';
import { SERVICES } from '../services.js';
import { chipsFor } from './filters.js';

const FORMAT_TITLES = { ebook: 'Ebook', audiobook: 'Audiobook' };

export async function render({ match, isCurrent }) {
  const workKey = match[1];
  setMain('<p class="loading">Loading book…</p>');
  let work;
  try {
    work = await openlibrary.getWork(workKey);
  } catch (err) {
    setMain(`<h1>Book not found</h1>${errorBox("Couldn't load this book from Open Library.", { url: openlibrary.workUrl(workKey), text: 'Open it on Open Library' })}`);
    return;
  }
  if (!isCurrent()) return;
  setTitle(work.title);
  const p = store.profile();
  const authorLinks = work.authors.length
    ? work.authors.map((a) => (a.key ? `<a href="${authorHref(a.key)}">${h(a.name)}</a>` : h(a.name))).join(', ')
    : '<span class="muted">Author not available</span>';
  const subjects = (work.subjects || []).filter((s) => s.length < 40).slice(0, 10);
  const rating = work.ratingsAverage ? `${work.ratingsAverage.toFixed(1)} out of 5 (${work.ratingsCount} ratings on Open Library)` : null;

  const main = setMain(`
    <article>
      <div class="book-hero">
        ${cover({ ...work, author: work.authors[0]?.name }, 'L')}
        <div>
          <h1>${h(work.title)}${work.subtitle ? `<span class="muted small"><br>${h(work.subtitle)}</span>` : ''}</h1>
          <p>by ${authorLinks}</p>
          <p id="series-line" class="small muted">Looking up series…</p>
          <dl class="meta-list">
            <dt>First published</dt><dd>${work.firstPublishYear ? h(work.firstPublishYear) : '<span class="muted">Not available</span>'}</dd>
            <dt>Length</dt><dd>${work.pages ? `About ${h(work.pages)} pages (print editions)` : '<span class="muted">Not available</span>'}</dd>
            <dt>Rating</dt><dd>${rating ? h(rating) : '<span class="muted">Not available</span>'}</dd>
            <dt>Reviews</dt><dd><span class="muted">Not available (no free, permitted source of reviews)</span></dd>
            <dt>Awards</dt><dd id="awards"><span class="muted">Checking…</span></dd>
          </dl>
          <div class="row" id="list-buttons"></div>
        </div>
      </div>
      <section aria-labelledby="where-h">
        <div class="section-head"><h2 id="where-h">Where to get it</h2><button type="button" id="recheck">Check again</button></div>
        <p class="small muted" id="checked-line" aria-live="polite">Checking availability…</p>
        <div class="format-columns" id="formats"><p class="loading">Checking sources…</p></div>
        <div id="physical"></div>
      </section>
      <section aria-labelledby="about-h">
        <h2 id="about-h">About this book</h2>
        ${work.description ? `<p class="description">${h(work.description)}</p>` : '<p class="muted">Description not available.</p>'}
        ${subjects.length ? `<p class="row">${subjects.map((s) => `<a class="chip plain" href="#/browse/subject/${encodeURIComponent(s)}">${h(s)}</a>`).join(' ')}</p>` : ''}
        <details id="editions"><summary>Editions and narrators</summary><div id="editions-body"><p class="loading">Loading…</p></div></details>
      </section>
      <section aria-labelledby="owned-h">
        <h2 id="owned-h">Mark as owned</h2>
        <form id="owned-form" class="row">
          <label for="owned-format" class="visually-hidden">Format</label>
          <select id="owned-format" class="search-select"><option value="ebook">Ebook</option><option value="audiobook">Audiobook</option></select>
          <label for="owned-service" class="visually-hidden">Where you own it</label>
          <select id="owned-service" class="search-select">
            ${['Kindle', 'Audible', 'Apple Books', 'Google Play Books', 'Kobo', 'Nook', 'Libro.fm', 'Chirp', 'Other'].map((s) => `<option>${h(s)}</option>`).join('')}
          </select>
          <button type="submit">Mark as owned</button>
        </form>
        <div id="owned-list"></div>
      </section>
      <section aria-labelledby="similar-h"><h2 id="similar-h">Similar books</h2><div id="similar"><p class="loading">Finding similar books…</p></div></section>
      <p class="credits" id="credits">Book information: <a href="${h(openlibrary.workUrl(work.workKey))}" target="_blank" rel="noopener noreferrer">Open Library</a>.</p>
    </article>`);

  renderListButtons(work);
  renderOwned(work);
  wireOwnedForm(work);
  loadSeriesAndAwards(work);
  loadEditions(work);
  loadSimilar(work, isCurrent);
  const physical = p.library ? physicalCopyLink(work, p.library) : null;
  $('#physical').innerHTML = physical
    ? `<h3>Physical copies</h3><p><a class="button" href="${h(physical.url)}" target="_blank" rel="noopener noreferrer">${h(physical.label)}<span class="visually-hidden"> (opens in a new tab)</span></a> <span class="chip plain">Not checked</span></p>`
    : '';
  await runCheck(work, isCurrent);
  $('#recheck').addEventListener('click', () => runCheck(work, isCurrent, true));
  wireCoverFallbacks(main);
}

async function runCheck(work, isCurrent) {
  const p = store.profile();
  const target = $('#formats');
  const line = $('#checked-line');
  line.textContent = 'Checking availability…';
  const entries = await checkAll(work, p, (partial, state) => {
    if (!isCurrent()) return;
    drawAvailability(partial);
    if (state.done) {
      line.textContent = `${formatCheckedAt(state.checkedAt)}. Only availability confirmed by a permitted source is shown as available.`;
    }
  });
  if (!isCurrent()) return;
  recordStatus(work.workKey, entries);
  rememberPrices(work, entries);
  announce('Availability check finished.');
  target.setAttribute('aria-busy', 'false');
}

function rememberPrices(work, entries) {
  store.update((p) => comparePrice(p, work, entries));
}

function drawAvailability(entries) {
  const grouped = groupAvailability(entries);
  const html = grouped
    .map((g) => {
      const confirmedHtml = g.groups
        .filter((gr) => gr.items.length)
        .map((gr) => `<div class="avail-group"><h3>${h(gr.title)}${gr.id === 'purchase' && g.highlightPurchase ? ' <span class="chip warn">Library wait is over 4 weeks</span>' : ''}</h3>
          <ul class="avail-list">${gr.items.map((e) => availabilityRow(e, { highlight: gr.id === 'purchase' && g.highlightPurchase })).join('')}</ul></div>`)
        .join('');
      return `<section class="format-block panel" aria-labelledby="fmt-${g.format}">
        <h2 id="fmt-${g.format}">${FORMAT_TITLES[g.format]}</h2>
        ${confirmedHtml || '<p class="muted">No confirmed options yet.</p>'}
        ${g.unconfirmed.length ? `<div class="unconfirmed"><h3>Not checked: open to look</h3><p class="small muted">These links open a search in each service. This site could not confirm whether the book is there.</p>
          <ul class="avail-list">${g.unconfirmed.map((e) => availabilityRow(e)).join('')}</ul></div>` : ''}
      </section>`;
    })
    .join('');
  $('#formats').innerHTML = html;
}

function renderListButtons(work) {
  const p = store.profile();
  const inTo = p.toRead.some((b) => b.workKey === work.workKey);
  const inFin = p.finished.some((b) => b.workKey === work.workKey);
  const watched = p.alerts.books.some((b) => b.workKey === work.workKey);
  $('#list-buttons').innerHTML = `
    <button type="button" data-list="toRead" aria-pressed="${inTo}">${inTo ? 'On To Read' : 'Add to To Read'}</button>
    <button type="button" data-list="finished" aria-pressed="${inFin}">${inFin ? 'Finished' : 'Mark finished'}</button>
    <button type="button" id="watch" aria-pressed="${watched}">${watched ? 'Watching price' : 'Watch for price drops'}</button>`;
  for (const b of $$('[data-list]')) {
    b.addEventListener('click', () => {
      store.toggleList(b.dataset.list, { ...work, author: work.authors[0]?.name });
      renderListButtons(work);
      announce('List updated.');
    });
  }
  $('#watch').addEventListener('click', () => {
    store.update((pr) => {
      const i = pr.alerts.books.findIndex((b) => b.workKey === work.workKey);
      if (i >= 0) pr.alerts.books.splice(i, 1);
      else pr.alerts.books.push(store.bookRef({ ...work, author: work.authors[0]?.name }));
    });
    renderListButtons(work);
    const pr = store.profile();
    announce(pr.alerts.types.priceDrop ? 'Updated.' : 'Saved. Turn on price-drop alerts in Alerts to get notices.');
  });
}

function renderOwned(work) {
  const p = store.profile();
  const mine = p.owned.filter((o) => o.workKey === work.workKey);
  $('#owned-list').innerHTML = mine.length
    ? `<ul class="list-rows">${mine.map((o) => `<li><span></span><div>${h(o.format === 'audiobook' ? 'Audiobook' : 'Ebook')} on ${h(o.service)}</div><button type="button" class="link" data-remove-owned="${h(o.id)}">Remove</button></li>`).join('')}</ul>`
    : '';
  for (const b of $$('[data-remove-owned]')) {
    b.addEventListener('click', () => {
      store.removeOwned(b.dataset.removeOwned);
      renderOwned(work);
    });
  }
}

function wireOwnedForm(work) {
  $('#owned-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    store.addOwned({ workKey: work.workKey, title: work.title, author: work.authors[0]?.name || '', format: $('#owned-format').value, service: $('#owned-service').value });
    renderOwned(work);
    announce('Marked as owned. Check again to update where to get it.');
  });
}

async function loadSeriesAndAwards(work) {
  try {
    const series = await wikidata.seriesForWork(work);
    $('#series-line').innerHTML = series.length ? `Series: ${series.map((s) => `<a href="${seriesHref(s.id)}">${h(s.name)}</a>`).join(', ')}` : '';
  } catch {
    $('#series-line').innerHTML = '<span class="muted">Couldn\'t check series information.</span>';
  }
  try {
    const awards = await wikidata.awardsForWork(work);
    $('#awards').innerHTML = awards.length ? awards.map((a) => h(`${a.name}${a.year ? ` (${a.year})` : ''}`)).join('<br>') : '<span class="muted">None recorded</span>';
    if (awards.length) $('#credits').insertAdjacentHTML('beforeend', ' Series and awards: <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a>.');
  } catch {
    $('#awards').innerHTML = '<span class="muted">Not available</span>';
  }
}

async function loadEditions(work) {
  const body = $('#editions-body');
  try {
    const eds = (await openlibrary.getEditions(work.workKey)).filter((e) => e.abridged !== true && (!e.languages.length || e.languages.includes('eng')));
    body.innerHTML = eds.length
      ? `<p class="small muted">Abridged editions are never shown. Narrators for paid audiobooks are not available from a permitted source; free LibriVox recordings list their readers above.</p>
        <table><thead><tr><th>Edition</th><th>Format</th><th>Published</th><th>Abridgment</th></tr></thead><tbody>
        ${eds.slice(0, 40).map((e) => `<tr><td>${h(e.title)}${e.dramatized ? ' <span class="chip warn">Dramatized</span>' : ''}<div class="small muted">${h(e.publishers.slice(0, 2).join(', '))}${e.isbn13[0] ? ` · ISBN ${h(e.isbn13[0])}` : ''}</div></td><td>${h(e.format || 'Not available')}</td><td>${h(e.publishDate || 'Not available')}</td><td>${e.abridged === false ? 'Unabridged' : 'Abridgment not confirmed'}</td></tr>`).join('')}
        </tbody></table>`
      : '<p class="muted">No English editions listed.</p>';
  } catch {
    body.innerHTML = '<p class="muted">Couldn\'t load editions.</p>';
  }
}

async function loadSimilar(work, isCurrent) {
  const box = $('#similar');
  try {
    const picks = new Map();
    const subj = (work.subjects || []).filter((s) => !/fiction$|^fiction|accessible book|protected daisy|in library|large type|nyt|bestseller|reviewed/i.test(s)).slice(0, 2);
    const jobs = [];
    if (subj.length) jobs.push(openlibrary.search({ subject: subj[0], limit: 12, sort: 'rating' }));
    if (work.authors[0]?.key) jobs.push(openlibrary.search({ extra: `author_key:${work.authors[0].key}`, limit: 8, sort: 'rating' }));
    const results = await Promise.allSettled(jobs);
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const w of r.value.works) if (w.workKey !== work.workKey && !picks.has(w.workKey)) picks.set(w.workKey, w);
    }
    if (!isCurrent()) return;
    const list = [...picks.values()].slice(0, 12);
    box.innerHTML = list.length
      ? `<p class="small muted">Based on ${subj.length ? `the subject "${h(subj[0])}"` : 'the same author'}${subj.length && work.authors[0] ? ' and the same author' : ''}. Series books are on the series page.</p>${bookGrid(list, chipsFor(list, statusChip))}`
      : '<p class="muted">No similar books found.</p>';
    wireCoverFallbacks(box);
  } catch {
    box.innerHTML = '<p class="muted">Couldn\'t load similar books.</p>';
  }
}

export { SERVICES };
