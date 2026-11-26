// Turns raw availability entries from every source into the ordered groups
// shown on a book page. Pure functions: easy to test, no network, no DOM.
//
// An entry looks like:
// {
//   sourceId, credit, service, format: 'ebook' | 'audiobook',
//   status: 'owned' | 'free' | 'included' | 'library' | 'purchase' | 'not-checked' | 'error',
//   kind: 'owned' | 'free' | 'subscription' | 'library' | 'store',
//   url, price: { amount, currency }, wait: { days, copies, holds },
//   checkedAt, abridged: true | false | null, dramatized, narrators, durationSecs,
//   subscribed: boolean (link-outs only), note
// }

import { LONG_WAIT_DAYS } from './config.js';

export const FORMATS = ['ebook', 'audiobook'];

export const CONFIRMED_GROUPS = [
  { id: 'owned', title: 'You own this' },
  { id: 'free', title: 'Free now' },
  { id: 'included', title: 'Included in your subscriptions' },
  { id: 'library', title: 'Library' },
  { id: 'purchase', title: 'Buy' },
];

const STATUS_TO_GROUP = {
  owned: 'owned',
  free: 'free',
  included: 'included',
  library: 'library',
  purchase: 'purchase',
};

// The abridged rule: abridged editions never appear, with no way to show them.
export function removeAbridged(entries) {
  return entries.filter((e) => e && e.abridged !== true);
}

export function abridgmentLabel(entry) {
  if (entry.abridged === false) return 'Unabridged';
  return 'Abridgment not confirmed';
}

export function isConfirmed(entry) {
  return Boolean(entry && STATUS_TO_GROUP[entry.status] && entry.confirmed !== false);
}

// "Available now" and "No wait" only ever include confirmed entries.
export function isAvailableNow(entry) {
  if (!isConfirmed(entry)) return false;
  if (entry.status === 'owned' || entry.status === 'free' || entry.status === 'included') return true;
  if (entry.status === 'library') return Boolean(entry.wait && entry.wait.days === 0);
  return false;
}

function unconfirmedRank(e) {
  // Library links first, then subscriptions you have, then subscriptions you
  // don't have, then stores, then anything else.
  if (e.kind === 'library') return 0;
  if (e.kind === 'subscription') return e.subscribed ? 1 : 2;
  if (e.kind === 'store') return e.subscribed ? 3 : 4;
  return 5;
}

function byName(a, b) {
  return String(a.service).localeCompare(String(b.service));
}

export function groupForFormat(entries, format, { longWaitDays = LONG_WAIT_DAYS } = {}) {
  const list = removeAbridged(entries).filter((e) => e.format === format);
  const groups = CONFIRMED_GROUPS.map((g) => ({ ...g, items: [] }));
  const unconfirmed = [];
  for (const e of list) {
    if (isConfirmed(e)) {
      groups.find((g) => g.id === STATUS_TO_GROUP[e.status]).items.push(e);
    } else {
      unconfirmed.push(e);
    }
  }
  const lib = groups.find((g) => g.id === 'library');
  lib.items.sort((a, b) => (a.wait?.days ?? Infinity) - (b.wait?.days ?? Infinity) || byName(a, b));
  const buy = groups.find((g) => g.id === 'purchase');
  buy.items.sort((a, b) => (a.price?.amount ?? Infinity) - (b.price?.amount ?? Infinity) || byName(a, b));
  for (const g of groups) if (g.id !== 'library' && g.id !== 'purchase') g.items.sort(byName);
  unconfirmed.sort((a, b) => unconfirmedRank(a) - unconfirmedRank(b) || byName(a, b));

  const hasReadyOption = groups.some((g) => ['owned', 'free', 'included'].includes(g.id) && g.items.length);
  const shortestWait = lib.items.length ? Math.min(...lib.items.map((e) => e.wait?.days ?? Infinity)) : null;
  const highlightPurchase =
    !hasReadyOption && shortestWait !== null && Number.isFinite(shortestWait) && shortestWait > longWaitDays && buy.items.length > 0;

  return { format, groups, unconfirmed, highlightPurchase };
}

export function groupAvailability(entries, options) {
  return FORMATS.map((f) => groupForFormat(entries, f, options));
}

// Flattened order used by tests and by the "best option" summary on cards.
export function orderedConfirmed(entries, format, options) {
  return groupForFormat(entries, format, options).groups.flatMap((g) => g.items);
}

export function bestStatus(entries) {
  const confirmed = removeAbridged(entries).filter(isConfirmed);
  for (const g of CONFIRMED_GROUPS) {
    const hit = confirmed.find((e) => STATUS_TO_GROUP[e.status] === g.id);
    if (hit) return hit;
  }
  return null;
}
