// Open Library (Internet Archive): search, book details, authors, covers, and
// confirmed public-domain scans. Used on demand only, never in bulk.
// https://openlibrary.org/developers/api

import { fetchJson } from '../net.js';
import { usPublicDomainCutoffYear } from '../config.js';
import { detectAbridgment, isDramatized } from '../text.js';

const BASE = 'https://openlibrary.org';
export const COVER_BASE = 'https://covers.openlibrary.org';

export const info = {
  id: 'openlibrary',
  name: 'Open Library',
  credit: 'Open Library',
  url: 'https://openlibrary.org',
  contacts: [
    { host: 'openlibrary.org', receives: 'Search words, book and author numbers' },
    { host: 'covers.openlibrary.org', receives: 'Cover and author photo numbers' },
  ],
};

const FIELDS = [
  'key', 'title', 'subtitle', 'author_name', 'author_key', 'first_publish_year', 'cover_i', 'isbn',
  'ratings_average', 'ratings_count', 'number_of_pages_median', 'language', 'subject', 'subject_key',
  'ebook_access', 'public_scan_b', 'ia', 'id_project_gutenberg', 'id_standard_ebooks', 'id_librivox',
  'id_wikidata', 'edition_count', 'format', 'oclc',
].join(',');

// Never shown: comics, graphic novels, magazines, children's books.
export const EXCLUDED_SUBJECTS = [
  'comics', 'comic books, strips, etc', 'graphic novels', 'comics & graphic novels', 'manga', 'magazines', 'periodicals',
  'juvenile fiction', 'juvenile literature', 'picture books', "children's fiction", "children's literature", 'board books',
];
const EXCLUDED_KEYS = new Set(EXCLUDED_SUBJECTS.map((s) => s.replace(/[^a-z0-9]+/g, '_')));

export function isExcluded(doc) {
  const subjects = (doc.subject || []).map((s) => String(s).toLowerCase());
  if (subjects.some((s) => EXCLUDED_SUBJECTS.includes(s))) return true;
  if ((doc.subject_key || []).some((k) => EXCLUDED_KEYS.has(k))) return true;
  const fmts = (doc.format || []).map((f) => String(f).toLowerCase());
  if (fmts.length && fmts.every((f) => /comic|graphic novel|magazine|periodical/.test(f))) return true;
  // English only: keep works that list English (or list no language at all).
  if (Array.isArray(doc.language) && doc.language.length && !doc.language.includes('eng')) return true;
  return false;
}

export function workFromDoc(doc) {
  const workKey = String(doc.key || '').replace('/works/', '');
  return {
    workKey,
    title: doc.title || 'Untitled',
    subtitle: doc.subtitle || '',
    authors: (doc.author_name || []).map((name, i) => ({ name, key: (doc.author_key || [])[i] || null })),
    firstPublishYear: doc.first_publish_year || null,
    coverId: doc.cover_i || null,
    isbns: (doc.isbn || []).slice(0, 40),
    subjects: (doc.subject || []).slice(0, 30),
    ratingsAverage: typeof doc.ratings_average === 'number' ? doc.ratings_average : null,
    ratingsCount: doc.ratings_count || 0,
    pages: doc.number_of_pages_median || null,
    languages: doc.language || [],
    ebookAccess: doc.ebook_access || null,
    publicScan: Boolean(doc.public_scan_b),
    ia: (doc.ia || []).slice(0, 5),
    gutenbergIds: doc.id_project_gutenberg || [],
    standardEbooksIds: doc.id_standard_ebooks || [],
    librivoxIds: doc.id_librivox || [],
    wikidataIds: doc.id_wikidata || [],
    editionCount: doc.edition_count || 0,
    oclc: (doc.oclc || []).slice(0, 10),
  };
}

// params: { q, title, author, isbn, subject, sort, page, limit, extra }
export async function search(params = {}) {
  const u = new URL(`${BASE}/search.json`);
  const parts = [];
  if (params.q) parts.push(params.q);
  if (params.isbn) parts.push(`isbn:${params.isbn}`);
  if (params.subject) parts.push(`subject:"${params.subject.replace(/"/g, '')}"`);
  if (params.extra) parts.push(params.extra);
  if (parts.length) u.searchParams.set('q', parts.join(' '));
  if (params.title) u.searchParams.set('title', params.title);
  if (params.author) u.searchParams.set('author', params.author);
  if (params.sort) u.searchParams.set('sort', params.sort);
  u.searchParams.set('lang', 'en');
  u.searchParams.set('fields', FIELDS);
  u.searchParams.set('limit', String(params.limit || 20));
  u.searchParams.set('page', String(params.page || 1));
  const { data, fetchedAt } = await fetchJson(u.href, { ttlMinutes: 60 * 6 });
  const works = (data.docs || []).filter((d) => !isExcluded(d)).map(workFromDoc);
  return { works, total: data.numFound || 0, fetchedAt };
}

export async function getWork(workKey) {
  if (!/^OL\d+W$/.test(workKey)) throw new Error('Not a valid book number.');
  const [{ data: work }, found] = await Promise.all([
    fetchJson(`${BASE}/works/${workKey}.json`, { ttlMinutes: 60 * 24 }),
    search({ q: `key:/works/${workKey}`, limit: 1 }).catch(() => ({ works: [] })),
  ]);
  const base = found.works[0] || {
    workKey,
    title: work.title,
    authors: [],
    subjects: work.subjects || [],
    coverId: (work.covers || []).find((c) => c > 0) || null,
    isbns: [],
    gutenbergIds: [],
    standardEbooksIds: [],
    librivoxIds: [],
    wikidataIds: [],
    ia: [],
  };
  const description = typeof work.description === 'string' ? work.description : work.description?.value || '';
  return {
    ...base,
    description,
    excerpt: (work.excerpts || [])[0]?.excerpt || '',
    links: (work.links || []).map((l) => ({ title: l.title, url: l.url })).filter((l) => /^https:\/\//.test(l.url)),
    wikidataIds: base.wikidataIds?.length ? base.wikidataIds : work.identifiers?.wikidata || [],
  };
}

export async function getEditions(workKey) {
  const { data } = await fetchJson(`${BASE}/works/${workKey}/editions.json?limit=50`, { ttlMinutes: 60 * 24 });
  return (data.entries || []).map((e) => ({
    key: e.key,
    title: e.title,
    format: e.physical_format || '',
    publishDate: e.publish_date || '',
    publishers: e.publishers || [],
    isbn13: e.isbn_13 || [],
    isbn10: e.isbn_10 || [],
    pages: e.number_of_pages || null,
    languages: (e.languages || []).map((l) => l.key?.replace('/languages/', '')),
    abridged: detectAbridgment(e.title, e.subtitle, e.edition_name, e.physical_format),
    dramatized: isDramatized(e.title, e.subtitle, e.edition_name),
  }));
}

export async function getAuthor(authorKey) {
  if (!/^OL\d+A$/.test(authorKey)) throw new Error('Not a valid author number.');
  const { data } = await fetchJson(`${BASE}/authors/${authorKey}.json`, { ttlMinutes: 60 * 24 });
  const bio = typeof data.bio === 'string' ? data.bio : data.bio?.value || '';
  return {
    key: authorKey,
    name: data.name || data.personal_name || 'Unknown author',
    bio,
    birthDate: data.birth_date || '',
    deathDate: data.death_date || '',
    alternateNames: data.alternate_names || [],
    photoId: (data.photos || []).find((p) => p > 0) || null,
    wikidataId: data.remote_ids?.wikidata || null,
    links: (data.links || []).map((l) => ({ title: l.title, url: l.url })).filter((l) => /^https:\/\//.test(l.url)),
  };
}

export async function authorWorks(authorKey, { page = 1, sort = 'new', limit = 40 } = {}) {
  return search({ extra: `author_key:${authorKey}`, sort, page, limit });
}

export function coverUrl(coverId, size = 'M') {
  return coverId ? `${COVER_BASE}/b/id/${coverId}-${size}.jpg?default=false` : null;
}

export function authorPhotoUrl(photoId, size = 'M') {
  return photoId ? `${COVER_BASE}/a/id/${photoId}-${size}.jpg?default=false` : null;
}

export function workUrl(workKey) {
  return `${BASE}/works/${workKey}`;
}

// Availability: a public-domain scan Open Library offers to read free, without
// borrowing. Shown only when the work is old enough to be public domain in the
// United States, so in-copyright lending never appears.
export async function availability(work, { now = new Date() } = {}) {
  const checkedAt = now.toISOString();
  const cutoff = usPublicDomainCutoffYear(now);
  if (work.publicScan && work.ebookAccess === 'public' && work.firstPublishYear && work.firstPublishYear <= cutoff && work.ia?.length) {
    return [
      {
        sourceId: 'openlibrary',
        credit: 'Open Library',
        service: 'Open Library (public-domain scan)',
        format: 'ebook',
        status: 'free',
        kind: 'free',
        confirmed: true,
        url: workUrl(work.workKey),
        checkedAt,
        abridged: null,
        note: `First published ${work.firstPublishYear}: public domain in the United States.`,
      },
    ];
  }
  return [];
}

// Fetches several works in one request (used for series pages and list checks).
export async function worksByKeys(keys) {
  const valid = keys.filter((k) => /^OL\d+W$/.test(k)).slice(0, 100);
  if (!valid.length) return [];
  const out = [];
  for (let i = 0; i < valid.length; i += 50) {
    const chunk = valid.slice(i, i + 50);
    const res = await search({ q: `key:(${chunk.map((k) => `"/works/${k}"`).join(' OR ')})`, limit: chunk.length });
    out.push(...res.works);
  }
  return out;
}
