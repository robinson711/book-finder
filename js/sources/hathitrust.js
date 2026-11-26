// HathiTrust Bibliographic API: confirms "Full View" (readable free in the
// United States) for a book, by ISBN or OCLC number. Small lookups only.
// https://hathitrust.org/bib_api

import { fetchJson } from '../net.js';
import { cleanIsbn } from '../text.js';

export const info = {
  id: 'hathitrust',
  name: 'HathiTrust',
  credit: 'HathiTrust Digital Library',
  contacts: [{ host: 'catalog.hathitrust.org', receives: 'Book numbers (ISBN or OCLC)' }],
};

export function buildIds(work) {
  const ids = [];
  for (const o of (work.oclc || []).slice(0, 5)) if (/^\d+$/.test(o)) ids.push(`oclc:${o}`);
  for (const i of (work.isbns || []).slice(0, 10)) {
    const c = cleanIsbn(i);
    if (c.length === 10 || c.length === 13) ids.push(`isbn:${c}`);
  }
  return ids.slice(0, 15);
}

export async function availability(work) {
  const ids = buildIds(work);
  if (!ids.length) return [];
  const url = `https://catalog.hathitrust.org/api/volumes/brief/json/${ids.map(encodeURIComponent).join('|')}`;
  try {
    const { data, fetchedAt } = await fetchJson(url, { ttlMinutes: 60 * 24 * 7 });
    const out = [];
    const seen = new Set();
    for (const res of Object.values(data || {})) {
      for (const item of res.items || []) {
        if (item.usRightsString === 'Full View' && item.itemURL && !seen.has(item.itemURL)) {
          seen.add(item.itemURL);
          out.push({
            sourceId: 'hathitrust', credit: 'HathiTrust', service: 'HathiTrust (full view)', format: 'ebook',
            status: 'free', kind: 'free', confirmed: true, url: item.itemURL.replace(/^http:/, 'https:'),
            checkedAt: fetchedAt, abridged: null, note: 'Full View: readable free in the United States.',
          });
        }
      }
    }
    return out.slice(0, 2);
  } catch {
    return [{
      sourceId: 'hathitrust', credit: 'HathiTrust', service: 'HathiTrust', format: 'ebook', status: 'error', kind: 'free',
      confirmed: false, url: `https://catalog.hathitrust.org/Search/Home?lookfor=${encodeURIComponent(work.title)}&type=title`,
      note: "Couldn't check HathiTrust right now.",
    }];
  }
}
