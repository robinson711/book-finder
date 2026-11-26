// Records what this device confirmed about each book, for "Available now",
// list badges and alerts. Only confirmed entries are ever recorded as available.

import * as store from './store.js';
import { bestStatus, isAvailableNow, removeAbridged, isConfirmed } from './results.js';
import { ownedEntries } from './sources/index.js';
import * as freecatalogs from './sources/freecatalogs.js';
import * as openlibrary from './sources/openlibrary.js';

export function recordStatus(workKey, entries, checkedAt = new Date().toISOString()) {
  const confirmed = removeAbridged(entries).filter(isConfirmed);
  const best = bestStatus(confirmed);
  const now = confirmed.filter(isAvailableNow);
  const summary = {
    checkedAt,
    best: best ? best.status : null,
    availableNow: now.length > 0,
    formats: {
      ebook: now.some((e) => e.format === 'ebook'),
      audiobook: now.some((e) => e.format === 'audiobook'),
    },
    free: confirmed.some((e) => e.status === 'free'),
    included: confirmed.some((e) => e.status === 'included'),
    shortestWait: Math.min(...confirmed.filter((e) => e.status === 'library' && typeof e.wait?.days === 'number').map((e) => e.wait.days), Infinity),
  };
  if (!Number.isFinite(summary.shortestWait)) summary.shortestWait = null;
  store.update((p) => {
    p.seen.status[workKey] = summary;
  });
  return summary;
}

export function statusFor(workKey) {
  return store.profile().seen.status[workKey] || null;
}

// Quick check that uses no outside store or library: owned books, the free
// catalog files published with this site, and Open Library's own record.
export async function lightCheck(work) {
  const p = store.profile();
  const entries = [...ownedEntries(work, p.owned)];
  const results = await Promise.allSettled([freecatalogs.availability(work), openlibrary.availability(work)]);
  for (const r of results) if (r.status === 'fulfilled') entries.push(...r.value);
  return entries;
}

export async function lightCheckMany(works, onProgress = () => {}) {
  const out = {};
  let i = 0;
  for (const w of works) {
    const entries = await lightCheck(w);
    out[w.workKey] = recordStatus(w.workKey, entries);
    onProgress(++i, works.length);
  }
  return out;
}
