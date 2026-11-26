// Source registry. Each source is a separate module with the same shape:
//   info:         { id, name, credit, contacts: [{ host, receives }] }
//   availability: async (work, context) => entry[]   (see results.js for the entry shape)
// To add a source, write a module like the ones in this folder and list it below.

import * as openlibrary from './openlibrary.js';
import * as freecatalogs from './freecatalogs.js';
import * as hathitrust from './hathitrust.js';
import * as apple from './apple.js';
import * as library from './library.js';
import * as wikidata from './wikidata.js';
import { SERVICES } from '../services.js';
import { normalizeTitle, normalizeName } from '../text.js';

export const AVAILABILITY_SOURCES = [openlibrary, freecatalogs, hathitrust, apple, library];
export const ALL_SOURCES = [openlibrary, freecatalogs, hathitrust, apple, wikidata, library];

// Owned books are matched on this device by title and author.
export function ownedEntries(work, owned) {
  const t = normalizeTitle(work.title);
  const names = (work.authors || []).map((a) => normalizeName(a.name));
  return owned
    .filter((o) => {
      if (o.workKey && o.workKey === work.workKey) return true;
      if (normalizeTitle(o.title) !== t) return false;
      if (!o.author || !names.length) return true;
      const last = normalizeName(o.author).split(' ').pop();
      return names.some((n) => n.split(' ').pop() === last);
    })
    .map((o) => ({
      sourceId: 'owned', credit: 'Your owned books', service: o.service || 'Owned', format: o.format === 'audiobook' ? 'audiobook' : 'ebook',
      status: 'owned', kind: 'owned', confirmed: true, url: ownedServiceUrl(o.service), checkedAt: o.addedAt,
      abridged: o.abridged === true ? true : null, note: 'Marked as owned on this device.',
    }));
}

function ownedServiceUrl(service) {
  const s = String(service || '').toLowerCase();
  if (s.includes('kindle')) return 'https://read.amazon.com/kindle-library';
  if (s.includes('audible')) return 'https://www.audible.com/library/titles';
  if (s.includes('apple')) return 'https://www.apple.com/apple-books/';
  if (s.includes('google')) return 'https://play.google.com/books';
  if (s.includes('kobo')) return 'https://www.kobo.com/us/en/library';
  if (s.includes('libro')) return 'https://libro.fm/library';
  return null;
}

// "Not checked" links for every subscription and store without a permitted data source.
export function serviceLinks(work, profile) {
  const out = [];
  const title = work.title;
  const author = work.authors?.[0]?.name;
  for (const s of SERVICES) {
    if (s.id === 'apple-books') continue; // Apple Books is checked through its official API.
    const subscribed = profile.subscriptions.includes(s.id);
    for (const format of s.formats) {
      let service = s.name;
      if (s.id === 'audible' && subscribed && profile.audiblePlan) {
        service = s.plans.find((p) => p.id === profile.audiblePlan)?.name || s.name;
      }
      out.push({
        sourceId: s.id, credit: 'Link only', service, format, status: 'not-checked', kind: s.kind, confirmed: false,
        url: s.search(title, author), subscribed,
        linkLabel: s.homeOnly ? `Not checked: open ${s.name} (home page)` : `Not checked: search ${s.name}`,
        abridged: null,
      });
    }
  }
  return out;
}

// Runs every source for one book. onUpdate is called as each source answers,
// so the page can fill in progressively.
export async function checkAll(work, profile, onUpdate = () => {}) {
  const ctx = { library: profile.library, now: new Date() };
  const entries = [...ownedEntries(work, profile.owned)];
  onUpdate([...entries], { done: false });
  const jobs = AVAILABILITY_SOURCES.map(async (src) => {
    try {
      const got = await src.availability(work, ctx);
      entries.push(...got);
    } catch {
      entries.push({
        sourceId: src.info.id, credit: src.info.credit, service: src.info.name, format: 'ebook', status: 'error', kind: 'free',
        confirmed: false, url: src.info.url || null, note: `Couldn't check ${src.info.name}.`,
      });
    }
    onUpdate([...entries], { done: false });
  });
  await Promise.all(jobs);
  entries.push(...serviceLinks(work, profile));
  onUpdate([...entries], { done: true, checkedAt: new Date().toISOString() });
  return entries;
}
