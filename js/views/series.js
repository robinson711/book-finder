import * as store from '../store.js';
import { h, $, $$, setMain, setTitle, cover, bookHref, searchHref, statusChip, errorBox, announce, wireCoverFallbacks } from '../ui.js';
import * as wikidata from '../sources/wikidata.js';
import * as openlibrary from '../sources/openlibrary.js';
import { lightCheckMany, statusFor } from '../availability.js';

export async function render({ match, params, isCurrent }) {
  const id = match[1];
  const order = params.get('order') === 'story' ? 'story' : 'publication';
  setMain('<p class="loading">Loading series…</p>');
  let s;
  try {
    s = await wikidata.seriesDetails(id);
  } catch {
    setMain(`<h1>Series</h1>${errorBox("Couldn't load this series from Wikidata.", { url: `https://www.wikidata.org/wiki/${id}`, text: 'Open it on Wikidata' })}`);
    return;
  }
  if (!isCurrent()) return;
  setTitle(s.name);
  const books = wikidata.sortSeries(s.books, order);
  const hasOrdinals = s.books.some((b) => b.ordNum !== null);
  const main = setMain(`
    <h1>${h(s.name)}</h1>
    ${s.parentName ? `<p class="muted">Part of ${h(s.parentName)}</p>` : ''}
    <div class="row">
      <div class="tab-row" role="group" aria-label="Order">
        <a class="button" href="#/series/${id}?order=publication" aria-current="${order === 'publication' ? 'true' : 'false'}">Publication order</a>
        <a class="button" href="#/series/${id}?order=story" aria-current="${order === 'story' ? 'true' : 'false'}">Story order</a>
      </div>
      <button type="button" id="follow">${followed(id) ? 'Following series' : 'Follow series'}</button>
      <button type="button" id="check">Check availability</button>
    </div>
    ${order === 'story' && !hasOrdinals ? '<p class="notice">Wikidata has no series numbers for these books, so story order matches publication order.</p>' : ''}
    <p class="small muted">${books.length} books. Story order uses the series number recorded on Wikidata. Novellas, short stories, collections and box sets are labeled.</p>
    <ol class="list-rows" id="series-list">${books.map(row).join('')}</ol>
    <p class="credits">Series information: <a href="https://www.wikidata.org/wiki/${h(id)}" target="_blank" rel="noopener noreferrer">Wikidata</a>. Covers: Open Library.</p>`);
  // Fill in covers for books that have an Open Library record.
  const keys = books.map((b) => b.workKey).filter(Boolean);
  let works = [];
  try {
    works = await openlibrary.worksByKeys(keys);
  } catch {
    /* covers stay as placeholders */
  }
  if (!isCurrent()) return;
  for (const w of works) {
    const slot = main.querySelector(`[data-cover="${w.workKey}"]`);
    if (slot) slot.innerHTML = cover({ ...w, author: w.authors[0]?.name }, 'S', { alt: false });
  }
  wireCoverFallbacks(main);
  $('#follow').addEventListener('click', () => {
    store.update((p) => {
      const i = p.alerts.series.findIndex((x) => x.id === id);
      if (i >= 0) p.alerts.series.splice(i, 1);
      else p.alerts.series.push({ id, name: s.name, known: s.books.map((b) => b.qid) });
    });
    $('#follow').textContent = followed(id) ? 'Following series' : 'Follow series';
    announce(followed(id) ? 'Following this series.' : 'Stopped following this series.');
  });
  $('#check').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    await lightCheckMany(works, (i, n) => (btn.textContent = `Checking ${i} of ${n}…`));
    for (const b of books) {
      const el = main.querySelector(`[data-status="${b.workKey}"]`);
      if (el) el.innerHTML = statusHtml(b);
    }
    btn.textContent = 'Checked';
    announce('Series checked.');
  });
}

function followed(id) {
  return store.profile().alerts.series.some((x) => x.id === id);
}

function statusHtml(b) {
  if (!b.workKey) return '<span class="chip plain">Not checked</span>';
  const s = statusFor(b.workKey);
  if (!s) return '<span class="chip plain">Not checked</span>';
  return s.best ? statusChip({ status: s.best }) : '<span class="chip plain">No confirmed option</span>';
}

function row(b) {
  const link = b.workKey ? bookHref(b.workKey) : searchHref(`${b.title} ${b.authors[0] || ''}`, 'all');
  return `<li>
    <div data-cover="${h(b.workKey || '')}">${cover({ title: b.title, author: b.authors[0] }, 'S', { alt: false })}</div>
    <div><a href="${link}"><strong>${h(b.title)}</strong></a>
      <div class="small muted">${b.ord ? `Book ${h(b.ord)}` : 'No series number'}${b.year ? ` · ${h(b.year)}` : ''}${b.authors.length ? ` · ${h(b.authors.join(', '))}` : ''}</div>
      ${b.kind ? `<span class="chip warn">${h(b.kind)}</span>` : ''}</div>
    <div data-status="${h(b.workKey || '')}">${statusHtml(b)}</div>
  </li>`;
}

export { $$ };
