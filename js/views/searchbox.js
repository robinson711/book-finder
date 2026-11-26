import { h, $ } from '../ui.js';

export const SEARCH_TYPES = [
  ['all', 'Everything'],
  ['title', 'Title'],
  ['author', 'Author'],
  ['series', 'Series'],
  ['narrator', 'Narrator'],
  ['isbn', 'ISBN'],
];

export function searchBox(q = '', type = 'all') {
  return `<form class="stack" id="search-box" role="search" aria-label="Search books">
    <div class="search-form">
      <label for="q" class="visually-hidden">Search books</label>
      <input type="search" id="q" name="q" value="${h(q)}" placeholder="Title, author, series, narrator or ISBN" autocomplete="off" enterkeyhint="search">
      <button class="primary" type="submit">Search</button>
    </div>
    <div class="row">
      <label for="qtype" class="visually-hidden">Search in</label>
      <select id="qtype" name="type" class="search-select">
        ${SEARCH_TYPES.map(([v, label]) => `<option value="${v}" ${v === type ? 'selected' : ''}>Search: ${label}</option>`).join('')}
      </select>
      <a class="button" href="#/scan">Scan a barcode</a>
    </div>
  </form>`;
}

export function wireSearchBox(root) {
  $('#search-box', root)?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = $('#q', root).value.trim();
    if (!q) return;
    const type = $('#qtype', root).value;
    location.hash = `#/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`;
  });
}
