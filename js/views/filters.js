// Result filters for search and browse lists. Filters about availability use
// only confirmed data from this device's checks.

import { h, $, $$ } from '../ui.js';
import { lightCheckMany, statusFor } from '../availability.js';

export const LENGTHS = [
  ['', 'Any length'],
  ['short', 'Short (under 200 pages)'],
  ['medium', 'Medium (200 to 400 pages)'],
  ['long', 'Long (over 400 pages)'],
];

export function readFilters(params) {
  return {
    format: params.get('format') || '',
    nowait: params.get('nowait') === '1',
    free: params.get('free') === '1',
    length: params.get('length') || '',
    rating: Number(params.get('rating') || 0),
    from: Number(params.get('from') || 0),
    to: Number(params.get('to') || 0),
  };
}

export function filtersActive(f) {
  return Boolean(f.format || f.nowait || f.free || f.length || f.rating || f.from || f.to);
}

export function needsCheck(f) {
  return Boolean(f.format || f.nowait || f.free);
}

export function filterForm(f) {
  return `<details class="filters" ${filtersActive(f) ? 'open' : ''}><summary>Filters${filtersActive(f) ? ' (on)' : ''}</summary>
    <form id="filters" class="filter-grid">
      <div><label for="f-format">Format</label><select id="f-format" name="format">
        <option value="">Ebook or audiobook</option>
        <option value="ebook" ${f.format === 'ebook' ? 'selected' : ''}>Confirmed ebook available now</option>
        <option value="audiobook" ${f.format === 'audiobook' ? 'selected' : ''}>Confirmed audiobook available now</option></select></div>
      <div><label for="f-length">Length</label><select id="f-length" name="length">${LENGTHS.map(([v, l]) => `<option value="${v}" ${f.length === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label for="f-rating">Rating (Open Library)</label><select id="f-rating" name="rating">
        <option value="0">Any rating</option>${[3, 3.5, 4, 4.5].map((r) => `<option value="${r}" ${f.rating === r ? 'selected' : ''}>${r} stars and up</option>`).join('')}</select></div>
      <div><label for="f-from">First published from</label><input type="number" id="f-from" name="from" inputmode="numeric" min="1000" max="2100" value="${f.from || ''}"></div>
      <div><label for="f-to">to</label><input type="number" id="f-to" name="to" inputmode="numeric" min="1000" max="2100" value="${f.to || ''}"></div>
      <div><label class="check"><input type="checkbox" name="nowait" ${f.nowait ? 'checked' : ''}> No wait (confirmed)</label>
      <label class="check"><input type="checkbox" name="free" ${f.free ? 'checked' : ''}> Included or free (confirmed)</label></div>
      <div><p class="small muted">Language: English only. For narrators, search by narrator.</p></div>
      <div class="row"><button class="primary" type="submit">Apply filters</button><button type="button" id="f-clear">Clear</button></div>
    </form></details>`;
}

export function wireFilters(root, params) {
  const form = $('#filters', root);
  if (!form) return;
  const go = (clear) => {
    const next = new URLSearchParams(params);
    for (const k of ['format', 'nowait', 'free', 'length', 'rating', 'from', 'to', 'page']) next.delete(k);
    if (!clear) {
      const fd = new FormData(form);
      for (const [k, v] of fd.entries()) if (v && v !== '0') next.set(k, k === 'nowait' || k === 'free' ? '1' : String(v));
    }
    const base = location.hash.split('?')[0];
    location.hash = `${base}?${next.toString()}`;
  };
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    go(false);
  });
  $('#f-clear', root).addEventListener('click', () => go(true));
}

// Filters that use the book's own record.
export function applyRecordFilters(works, f) {
  return works.filter((w) => {
    if (f.length) {
      if (!w.pages) return false;
      if (f.length === 'short' && w.pages >= 200) return false;
      if (f.length === 'medium' && (w.pages < 200 || w.pages > 400)) return false;
      if (f.length === 'long' && w.pages <= 400) return false;
    }
    if (f.rating && !(w.ratingsAverage >= f.rating)) return false;
    if (f.from && !(w.firstPublishYear >= f.from)) return false;
    if (f.to && !(w.firstPublishYear <= f.to)) return false;
    return true;
  });
}

// Filters that need confirmed availability; runs the quick on-device check first.
export async function applyAvailabilityFilters(works, f, onProgress) {
  if (!needsCheck(f)) return works;
  await lightCheckMany(works, onProgress);
  return works.filter((w) => {
    const s = statusFor(w.workKey);
    if (!s) return false;
    if (f.nowait && !s.availableNow) return false;
    if (f.free && !(s.free || s.included || s.best === 'owned')) return false;
    if (f.format && !s.formats[f.format]) return false;
    return true;
  });
}

export function chipsFor(works, statusChip) {
  return Object.fromEntries(works.map((w) => {
    const s = statusFor(w.workKey);
    return [w.workKey, s?.best ? statusChip({ status: s.best }) : ''];
  }));
}

export { $$ };
