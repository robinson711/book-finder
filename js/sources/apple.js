// Apple Books prices from Apple's official iTunes Search API.
// https://performance-partners.apple.com/resources/documentation/itunes-store-web-service-search-api/
// Rules followed here:
//  - About 20 calls per minute: requests are spaced out and cached.
//  - Apple's cover art may only be shown to promote the Apple Books listing, next to an
//    Apple Books badge, so it is only used inside the Apple Books row.
//  - A result is used only when its title AND author match the book, because Apple's
//    ISBN lookup can return an unrelated book. Non-English editions are skipped.

import { fetchJson } from '../net.js';
import { titlesMatch, authorsMatch, detectAbridgment, isDramatized, looksEnglish, stripHtml } from '../text.js';

export const info = {
  id: 'apple',
  name: 'Apple Books',
  credit: 'Apple Books (iTunes Search API)',
  contacts: [
    { host: 'itunes.apple.com', receives: 'Search words (title and author)' },
    { host: 'is1-ssl.mzstatic.com (and similar)', receives: 'Requests for Apple Books cover art, shown in Apple Books rows' },
    { host: 'audio-ssl.itunes.apple.com', receives: 'Requests for an audiobook preview, only when you press play' },
  ],
};

function term(work) {
  return [work.title, work.authors?.[0]?.name].filter(Boolean).join(' ');
}

export function matchResult(r, work) {
  const name = r.trackName || r.collectionName || '';
  if (!titlesMatch(name, work.title)) return false;
  if (!authorsMatch([r.artistName], (work.authors || []).map((a) => a.name))) return false;
  if (looksEnglish(r.description) === false) return false;
  return true;
}

export async function search(work, media) {
  const u = new URL('https://itunes.apple.com/search');
  u.searchParams.set('term', term(work));
  u.searchParams.set('media', media);
  u.searchParams.set('country', 'US');
  u.searchParams.set('limit', '10');
  const { data, fetchedAt } = await fetchJson(u.href, { ttlMinutes: 60 * 6 });
  return { results: (data.results || []).filter((r) => matchResult(r, work)), fetchedAt };
}

function toEntry(r, format, fetchedAt) {
  const name = r.trackName || r.collectionName || '';
  const price = typeof r.price === 'number' ? r.price : r.collectionPrice;
  const url = r.trackViewUrl || r.collectionViewUrl;
  if (typeof price !== 'number' || !url || !/^https:\/\/books\.apple\.com\//.test(url)) return null;
  const description = stripHtml(r.description || '');
  return {
    sourceId: 'apple',
    credit: 'Apple Books',
    service: 'Apple Books',
    format,
    status: price === 0 ? 'free' : 'purchase',
    kind: price === 0 ? 'free' : 'store',
    confirmed: true,
    url: url.replace(/[?&]uo=\d+/, ''),
    price: { amount: price, currency: r.currency || 'USD' },
    checkedAt: fetchedAt,
    abridged: detectAbridgment(name, format === 'audiobook' ? description.slice(0, 400) : ''),
    dramatized: isDramatized(name, description.slice(0, 400)),
    editionTitle: name,
    artwork: r.artworkUrl100 || null,
    previewUrl: format === 'audiobook' && /^https:\/\/audio-ssl\.itunes\.apple\.com\//.test(r.previewUrl || '') ? r.previewUrl : null,
    rating: typeof r.averageUserRating === 'number' ? { average: r.averageUserRating, count: r.userRatingCount || 0 } : null,
    releaseDate: r.releaseDate || null,
    appleId: r.trackId || r.collectionId,
    note: price === 0 ? 'Free in Apple Books.' : '',
  };
}

export async function availability(work) {
  const out = [];
  for (const [media, format] of [['ebook', 'ebook'], ['audiobook', 'audiobook']]) {
    try {
      const { results, fetchedAt } = await search(work, media);
      // Keep the cheapest matching listing of each distinct edition title.
      const seen = new Map();
      for (const r of results) {
        const e = toEntry(r, format, fetchedAt);
        if (!e) continue;
        const k = e.editionTitle.toLowerCase();
        if (!seen.has(k) || seen.get(k).price.amount > e.price.amount) seen.set(k, e);
      }
      out.push(...seen.values());
    } catch (err) {
      out.push({
        sourceId: 'apple', credit: 'Apple Books', service: 'Apple Books', format, status: 'error', kind: 'store',
        confirmed: false, url: 'https://www.apple.com/apple-books/', note: "Couldn't check Apple Books right now.",
      });
    }
  }
  return out;
}

// Upcoming releases (pre-orders) by an author, for the author page.
export async function upcomingByAuthor(authorName, now = new Date()) {
  const u = new URL('https://itunes.apple.com/search');
  u.searchParams.set('term', authorName);
  u.searchParams.set('media', 'ebook');
  u.searchParams.set('attribute', 'authorTerm');
  u.searchParams.set('country', 'US');
  u.searchParams.set('limit', '50');
  const { data, fetchedAt } = await fetchJson(u.href, { ttlMinutes: 60 * 12 });
  const items = (data.results || []).filter(
    (r) => r.releaseDate && new Date(r.releaseDate) > now && authorsMatch([r.artistName], [authorName]) && looksEnglish(r.description) !== false,
  );
  const unique = new Map();
  for (const r of items) unique.set(r.trackName.toLowerCase(), r);
  return {
    fetchedAt,
    items: [...unique.values()].map((r) => ({
      title: r.trackName,
      releaseDate: r.releaseDate,
      url: (r.trackViewUrl || '').replace(/[?&]uo=\d+/, ''),
    })),
  };
}
