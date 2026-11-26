// Shared bits of interface: HTML helpers, covers, book cards, availability rows.

import { escapeHtml as h, formatCheckedAt, formatPrice, formatDuration } from './text.js';
import { coverUrl } from './sources/openlibrary.js';
import { abridgmentLabel } from './results.js';

export { h };

export function $(sel, root = document) {
  return root.querySelector(sel);
}
export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function announce(text) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => (live.textContent = text), 50);
}

export function setTitle(title) {
  document.title = title ? `${title} · ${window.APP_NAME}` : window.APP_NAME;
}

export function bookHref(workKey) {
  return `#/book/${encodeURIComponent(workKey)}`;
}
export function authorHref(authorKey) {
  return `#/author/${encodeURIComponent(authorKey)}`;
}
export function seriesHref(id) {
  return `#/series/${encodeURIComponent(id)}`;
}
export function searchHref(q, type = 'all') {
  return `#/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`;
}

// Cover with a plain placeholder when no cover exists or the image fails.
export function cover(book, size = 'M', { alt = true } = {}) {
  const url = book.coverId ? coverUrl(book.coverId, size) : null;
  const title = h(book.title || 'Untitled');
  const author = h(book.author || book.authors?.[0]?.name || '');
  const placeholder = `<div class="cover-placeholder"><strong>${title}</strong>${author ? `<span>${author}</span>` : ''}<span class="small">No cover available</span></div>`;
  if (!url) return `<div class="cover">${placeholder}</div>`;
  return `<div class="cover"><img src="${h(url)}" alt="${alt ? `Cover of ${title}` : ''}" loading="lazy" decoding="async" data-fallback="1"><template>${placeholder}</template></div>`;
}

// Replaces broken cover images with the placeholder (no inline event handlers under the CSP).
export function wireCoverFallbacks(root) {
  for (const img of $$('img[data-fallback]', root)) {
    const swap = () => {
      const tpl = img.nextElementSibling;
      if (tpl && tpl.tagName === 'TEMPLATE') img.replaceWith(tpl.content.cloneNode(true));
    };
    if (img.complete && img.naturalWidth === 0) swap();
    else img.addEventListener('error', swap, { once: true });
  }
}

export function statusChip(entry) {
  if (!entry) return '';
  const map = {
    owned: ['ok', 'Owned'],
    free: ['ok', 'Free now'],
    included: ['ok', 'Included'],
    library: ['info', 'At library'],
    purchase: ['plain', 'Buy'],
  };
  const [cls, text] = map[entry.status] || [];
  return cls ? `<span class="chip ${cls}">${text}</span>` : '';
}

export function bookCard(book, { chip = '' } = {}) {
  const author = book.author || book.authors?.[0]?.name || '';
  return `<li class="book-card"><a href="${bookHref(book.workKey)}">${cover(book, 'M', { alt: false })}
    <div class="t">${h(book.title)}</div>${author ? `<div class="a">${h(author)}</div>` : ''}</a>${chip ? `<div>${chip}</div>` : ''}</li>`;
}

export function bookGrid(books, chips = {}) {
  if (!books.length) return '<p class="empty">No books to show.</p>';
  return `<ul class="book-grid">${books.map((b) => bookCard(b, { chip: chips[b.workKey] || '' })).join('')}</ul>`;
}

export function shelf(books, chips = {}) {
  return `<ul class="shelf">${books.map((b) => bookCard(b, { chip: chips[b.workKey] || '' })).join('')}</ul>`;
}

function externalLink(url, text, extra = '') {
  return `<a class="button ${extra}" href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(text)}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
}

// One availability row on the book page.
export function availabilityRow(e, { highlight = false } = {}) {
  const bits = [];
  if (e.status === 'purchase' || (e.price && e.status === 'free')) bits.push(`<strong>${h(formatPrice(e.price?.amount, e.price?.currency))}</strong>`);
  if (e.wait) {
    if (e.wait.days === 0) bits.push('Available now');
    else if (typeof e.wait.days === 'number') bits.push(`About ${e.wait.days} days wait`);
    if (typeof e.wait.copies === 'number') bits.push(`${e.wait.copies} copies`);
    if (typeof e.wait.holds === 'number') bits.push(`${e.wait.holds} holds`);
  }
  if (e.narrators?.length) bits.push(`Narrated by ${h(e.narrators.slice(0, 4).join(', '))}${e.narrators.length > 4 ? ' and others' : ''}`);
  if (e.durationSecs) bits.push(h(formatDuration(e.durationSecs)));
  if (e.dramatized) bits.push('<span class="chip warn">Dramatized</span>');
  if (e.kind === 'subscription' && e.status === 'not-checked' && !e.subscribed) bits.push('<span class="chip plain">Not subscribed</span>');
  if (e.status === 'error') bits.push(`<span class="chip err">Couldn't check</span>`);
  else if (e.status === 'not-checked') bits.push('<span class="chip plain">Not checked</span>');
  else bits.push(`<span class="chip ${e.abridged === false ? 'ok' : 'plain'}">${h(abridgmentLabel(e))}</span>`);

  const sub = [];
  if (e.editionTitle && e.editionTitle !== e.service) sub.push(h(e.editionTitle));
  if (e.note) sub.push(h(e.note));
  if (e.checkedAt && e.status !== 'not-checked' && e.status !== 'error' && e.status !== 'owned') sub.push(h(formatCheckedAt(e.checkedAt)));
  if (e.credit && e.status !== 'not-checked') sub.push(`Source: ${h(e.credit)}`);

  let action = '';
  if (e.url) {
    const label = e.linkLabel || (e.status === 'error' ? `Open ${e.service}` : e.status === 'purchase' ? 'View' : 'Open');
    action = externalLink(e.url, label, e.status === 'free' || e.status === 'owned' ? 'primary' : '');
  }
  let art = '';
  if (e.sourceId === 'apple' && e.artwork) {
    // Apple's artwork is shown only beside its Apple Books badge, as Apple's terms require.
    art = `<a class="apple-badge" href="${h(e.url)}" target="_blank" rel="noopener noreferrer"><img class="apple-art" src="${h(e.artwork)}" alt="" loading="lazy">Get it on Apple Books<span class="visually-hidden"> (opens in a new tab)</span></a>`;
  }
  let preview = '';
  if (e.previewUrl) {
    preview = `<details><summary>Listen to a sample</summary><audio controls preload="none" src="${h(e.previewUrl)}"></audio></details>`;
  }
  const backup = e.backupUrl ? ` <a class="small" href="${h(e.backupUrl)}" target="_blank" rel="noopener noreferrer">Or search the library website<span class="visually-hidden"> (opens in a new tab)</span></a>` : '';
  return `<li class="avail-item${highlight ? ' highlight' : ''}">
    <div><div class="svc">${h(e.service)}</div><div class="row small">${bits.join(' · ')}</div></div>
    <div class="act">${action}</div>
    ${sub.length || art || preview || backup ? `<div class="sub">${sub.join(' · ')}${backup}${art ? `<div class="row">${art}</div>` : ''}${preview}</div>` : ''}
  </li>`;
}

export function placeholderNotAvailable(label = 'Not available') {
  return `<span class="muted">${h(label)}</span>`;
}

export function errorBox(message, link) {
  return `<div class="notice err" role="alert">${h(message)}${link ? ` <a href="${h(link.url)}" target="_blank" rel="noopener noreferrer">${h(link.text)}</a>` : ''}</div>`;
}

export function setMain(html) {
  const main = document.getElementById('main');
  main.innerHTML = html;
  wireCoverFallbacks(main);
  return main;
}
