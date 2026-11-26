import * as store from '../store.js';
import { h, $, setMain, setTitle, bookGrid, statusChip, errorBox, announce, wireCoverFallbacks, authorHref } from '../ui.js';
import * as openlibrary from '../sources/openlibrary.js';
import * as wikidata from '../sources/wikidata.js';
import * as apple from '../sources/apple.js';
import { chipsFor } from './filters.js';
import { formatCheckedAt } from '../text.js';

export async function render({ match, isCurrent }) {
  const key = match[1];
  setMain('<p class="loading">Loading author…</p>');
  let a;
  try {
    a = await openlibrary.getAuthor(key);
  } catch {
    setMain(`<h1>Author</h1>${errorBox("Couldn't load this author from Open Library.", { url: `https://openlibrary.org/authors/${key}`, text: 'Open on Open Library' })}`);
    return;
  }
  if (!isCurrent()) return;
  setTitle(a.name);
  const photo = a.photoId ? `<div class="cover"><img src="${h(openlibrary.authorPhotoUrl(a.photoId, 'M'))}" alt="Photo of ${h(a.name)}" loading="lazy" data-fallback="1"><template><div class="cover-placeholder"><strong>${h(a.name)}</strong><span class="small">No photo available</span></div></template></div>` : `<div class="cover"><div class="cover-placeholder"><strong>${h(a.name)}</strong><span class="small">No photo available</span></div></div>`;
  const main = setMain(`
    <div class="book-hero">
      ${photo}
      <div>
        <h1>${h(a.name)}</h1>
        ${a.birthDate || a.deathDate ? `<p class="muted">${h([a.birthDate, a.deathDate].filter(Boolean).join(' to '))}</p>` : ''}
        <p id="pen-names" class="small muted"></p>
        <button type="button" id="follow">${followed(key) ? 'Following author' : 'Follow author'}</button>
      </div>
    </div>
    <h2>Biography</h2>
    ${a.bio ? `<p class="description">${h(a.bio)}</p>` : '<p class="muted">Biography not available.</p>'}
    <div id="wiki-link"></div>
    <section><h2>Upcoming releases</h2><div id="upcoming"><p class="loading">Checking Apple Books pre-orders…</p></div></section>
    <section><h2>All works</h2><div id="works"><p class="loading">Loading works…</p></div></section>
    <section><h2>Co-written works</h2><div id="cowritten"></div></section>
    <p class="credits">Author information: <a href="https://openlibrary.org/authors/${h(key)}" target="_blank" rel="noopener noreferrer">Open Library</a>, pen names: Wikidata, upcoming releases: Apple Books.</p>`);
  wireCoverFallbacks(main);
  $('#follow').addEventListener('click', () => {
    store.update((p) => {
      const i = p.alerts.authors.findIndex((x) => x.key === key);
      if (i >= 0) p.alerts.authors.splice(i, 1);
      else p.alerts.authors.push({ key, name: a.name });
    });
    $('#follow').textContent = followed(key) ? 'Following author' : 'Follow author';
    announce(followed(key) ? 'Following this author.' : 'Stopped following.');
  });

  wikidata
    .authorExtras(key, a.wikidataId)
    .then((x) => {
      const names = [...new Set([...(x?.penNames || []), ...a.alternateNames.filter((n) => n !== a.name)])].slice(0, 12);
      $('#pen-names').textContent = names.length ? `Also known as: ${names.join(', ')}` : '';
      if (x?.wikipedia && /^https:\/\/en\.wikipedia\.org\//.test(x.wikipedia)) {
        $('#wiki-link').innerHTML = `<p><a href="${h(x.wikipedia)}" target="_blank" rel="noopener noreferrer">Read more on Wikipedia<span class="visually-hidden"> (opens in a new tab)</span></a></p>`;
      }
    })
    .catch(() => {
      const names = a.alternateNames.filter((n) => n !== a.name).slice(0, 12);
      $('#pen-names').textContent = names.length ? `Also known as: ${names.join(', ')}` : '';
    });

  apple
    .upcomingByAuthor(a.name)
    .then(({ items, fetchedAt }) => {
      $('#upcoming').innerHTML = items.length
        ? `<ul class="list-rows">${items.map((u) => `<li><span></span><div><strong>${h(u.title)}</strong><div class="small muted">Release date ${h(new Date(u.releaseDate).toLocaleDateString(undefined, { dateStyle: 'medium' }))}</div></div>${u.url ? `<a class="button" href="${h(u.url)}" target="_blank" rel="noopener noreferrer">Apple Books<span class="visually-hidden"> (opens in a new tab)</span></a>` : ''}</li>`).join('')}</ul><p class="small muted">${h(formatCheckedAt(fetchedAt))} (ebook pre-orders on Apple Books).</p>`
        : '<p class="muted">No upcoming releases found on Apple Books.</p>';
    })
    .catch(() => {
      $('#upcoming').innerHTML = '<p class="muted">Couldn\'t check upcoming releases right now.</p>';
    });

  try {
    const res = await openlibrary.authorWorks(key, { limit: 100, sort: 'new' });
    if (!isCurrent()) return;
    const solo = res.works.filter((w) => w.authors.length <= 1);
    const co = res.works.filter((w) => w.authors.length > 1);
    $('#works').innerHTML = `<p class="small muted">${res.total} works on Open Library, newest first${res.total > 100 ? '; showing 100' : ''}.</p>${bookGrid(solo, chipsFor(solo, statusChip))}`;
    $('#cowritten').innerHTML = co.length
      ? `${bookGrid(co, chipsFor(co, statusChip))}<p class="small muted">With ${[...new Map(co.flatMap((w) => w.authors).filter((x) => x.key !== key).map((x) => [x.key || x.name, x])).values()].slice(0, 8).map((x) => (x.key ? `<a href="${authorHref(x.key)}">${h(x.name)}</a>` : h(x.name))).join(', ')}</p>`
      : '<p class="muted">None recorded.</p>';
    wireCoverFallbacks(main);
  } catch {
    $('#works').innerHTML = errorBox("Couldn't load works.", { url: `https://openlibrary.org/authors/${key}`, text: 'See them on Open Library' });
  }
}

function followed(key) {
  return store.profile().alerts.authors.some((x) => x.key === key);
}
