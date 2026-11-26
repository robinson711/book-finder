// In-site alerts. Checked when the site is opened; compares confirmed data
// against what this device saw last time. No email, push or outside service.

import * as store from './store.js';
import * as openlibrary from './sources/openlibrary.js';
import * as wikidata from './sources/wikidata.js';
import * as apple from './sources/apple.js';
import { formatPrice } from './text.js';

export const ALERT_TYPES = [
  { id: 'newBook', name: 'New book by an author or in a series you follow', available: true, source: 'Open Library and Wikidata' },
  { id: 'priceDrop', name: 'Price drop on a book you watch', available: true, source: 'Apple Books prices (the only store with a permitted price source)' },
  {
    id: 'newlyIncluded', name: 'Newly included in your subscriptions', available: false,
    reason: 'Unavailable: no subscription service offers a permitted way to check which books it includes.',
  },
  {
    id: 'shorterWait', name: 'Shorter library wait', available: false,
    reason: 'Unavailable: library waits need official Libby (OverDrive) or hoopla access, which this site does not have yet.',
  },
];

const MIN_HOURS_BETWEEN_CHECKS = 12;

export function unreadCount() {
  return store.profile().notices.filter((n) => !n.read).length;
}

function addNotice(p, notice) {
  if (p.notices.some((n) => n.id === notice.id)) return;
  p.notices.unshift({ read: false, createdAt: new Date().toISOString(), ...notice });
  p.notices = p.notices.slice(0, 200);
}

export function comparePrice(p, work, entries) {
  const prices = entries.filter((e) => e.sourceId === 'apple' && e.status === 'purchase' && e.price);
  for (const fmt of ['ebook', 'audiobook']) {
    const cheapest = prices.filter((e) => e.format === fmt).sort((a, b) => a.price.amount - b.price.amount)[0];
    if (!cheapest) continue;
    const key = `${work.workKey}:${fmt}`;
    const prev = p.seen.prices[key];
    if (prev && cheapest.price.amount < prev.amount && p.alerts.types.priceDrop && p.alerts.books.some((b) => b.workKey === work.workKey)) {
      addNotice(p, {
        id: `price:${key}:${cheapest.price.amount}:${cheapest.checkedAt.slice(0, 10)}`,
        type: 'priceDrop',
        href: `#/book/${work.workKey}`,
        text: `Price drop: ${work.title} (${fmt}) is ${formatPrice(cheapest.price.amount)} at Apple Books, down from ${formatPrice(prev.amount)}.`,
      });
    }
    p.seen.prices[key] = { amount: cheapest.price.amount, checkedAt: cheapest.checkedAt, title: work.title };
  }
}

export async function runAlertChecks({ force = false, now = new Date() } = {}) {
  const p = store.profile();
  const types = p.alerts.types;
  if (!types.newBook && !types.priceDrop) return { ran: false };
  const last = p.seen.lastAlertCheck ? new Date(p.seen.lastAlertCheck) : null;
  if (!force && last && now - last < MIN_HOURS_BETWEEN_CHECKS * 3600000) return { ran: false };
  const problems = [];

  if (types.newBook) {
    for (const a of p.alerts.authors.slice(0, 30)) {
      try {
        const res = await openlibrary.authorWorks(a.key, { limit: 20, sort: 'new' });
        const keys = res.works.map((w) => w.workKey);
        store.update((pr) => {
          const seen = pr.seen.authorWorks[a.key];
          if (seen) {
            for (const w of res.works) {
              if (!seen.includes(w.workKey) && w.firstPublishYear && w.firstPublishYear >= now.getFullYear() - 1) {
                addNotice(pr, { id: `author:${a.key}:${w.workKey}`, type: 'newBook', href: `#/book/${w.workKey}`, text: `New book by ${a.name}: ${w.title}` });
              }
            }
          }
          pr.seen.authorWorks[a.key] = [...new Set([...(seen || []), ...keys])].slice(-300);
        });
      } catch {
        problems.push(a.name);
      }
    }
    for (const s of p.alerts.series.slice(0, 30)) {
      try {
        const d = await wikidata.seriesDetails(s.id);
        store.update((pr) => {
          const entry = pr.alerts.series.find((x) => x.id === s.id);
          const known = new Set(entry?.known || []);
          for (const b of d.books) {
            if (!known.has(b.qid)) {
              addNotice(pr, { id: `series:${s.id}:${b.qid}`, type: 'newBook', href: b.workKey ? `#/book/${b.workKey}` : `#/series/${s.id}`, text: `New in ${s.name}: ${b.title}` });
            }
          }
          if (entry) entry.known = d.books.map((b) => b.qid);
        });
      } catch {
        problems.push(s.name);
      }
    }
  }

  if (types.priceDrop && p.alerts.books.length) {
    try {
      const works = await openlibrary.worksByKeys(p.alerts.books.map((b) => b.workKey).slice(0, 25));
      for (const w of works) {
        const entries = await apple.availability(w);
        store.update((pr) => comparePrice(pr, w, entries));
      }
    } catch {
      problems.push('prices');
    }
  }

  store.update((pr) => {
    pr.seen.lastAlertCheck = now.toISOString();
    pr.seen.lastAlertProblems = problems;
  });
  return { ran: true, problems };
}

export function markAllRead() {
  store.update((p) => {
    for (const n of p.notices) n.read = true;
  });
}

export function clearNotices() {
  store.update((p) => {
    p.notices = [];
  });
}
