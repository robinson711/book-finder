// Wikidata (CC0 open data): series membership and order, awards, pen names.
// Queries run on demand from the browser through the public query service.
// https://query.wikidata.org

import { fetchJson } from '../net.js';

export const info = {
  id: 'wikidata',
  name: 'Wikidata',
  credit: 'Wikidata',
  contacts: [
    { host: 'query.wikidata.org', receives: 'Book, author, series or award numbers in a database query' },
    { host: 'www.wikidata.org', receives: 'Series names you search for' },
  ],
};

const ENDPOINT = 'https://query.wikidata.org/sparql';
const LABEL = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }';

async function sparql(query, ttlMinutes = 60 * 24) {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const { data, fetchedAt } = await fetchJson(url, { ttlMinutes, timeoutMs: 20000, accept: 'application/sparql-results+json' });
  return { rows: data.results?.bindings || [], fetchedAt };
}

const v = (row, k) => row[k]?.value ?? null;
const qid = (uri) => (uri ? uri.split('/').pop() : null);
const safeOl = (s) => (/^OL\d+[WAM]$/.test(s) ? s : null);
const safeQ = (s) => (/^Q\d+$/.test(s) ? s : null);
const lit = (s) => JSON.stringify(String(s)); // quoted SPARQL string literal

export async function seriesForWork(work) {
  const ol = safeOl(work.workKey);
  const qs = (work.wikidataIds || []).map(safeQ).filter(Boolean).slice(0, 5);
  if (!ol && !qs.length) return [];
  const match = [ol ? `{ ?book wdt:P648 ${lit(ol)} }` : null, qs.length ? `{ VALUES ?book { ${qs.map((q) => 'wd:' + q).join(' ')} } }` : null]
    .filter(Boolean)
    .join(' UNION ');
  const { rows } = await sparql(`SELECT DISTINCT ?series ?seriesLabel WHERE { ${match} ?book wdt:P179 ?series . ${LABEL} } LIMIT 10`);
  return rows.map((r) => ({ id: qid(v(r, 'series')), name: v(r, 'seriesLabel') })).filter((s) => safeQ(s.id));
}

// Kind of work, for labels on series pages.
export function classifyType(label) {
  const t = String(label || '').toLowerCase();
  if (/box set|boxed set|omnibus/.test(t)) return 'Box set';
  if (/anthology|collection/.test(t)) return 'Collection';
  if (/novella|novelette/.test(t)) return 'Novella';
  if (/short story/.test(t)) return 'Short story';
  if (/comic|graphic novel|manga/.test(t)) return 'Comic';
  return null;
}

export async function seriesDetails(seriesId) {
  const id = safeQ(seriesId);
  if (!id) throw new Error('Not a valid series number.');
  const q = `SELECT ?book ?bookLabel ?ord ?date ?olid ?typeLabel ?authorLabel ?parentLabel ?seriesLabel WHERE {
    BIND(wd:${id} AS ?series)
    ?book p:P179 ?st . ?st ps:P179 ?series .
    OPTIONAL { ?st pq:P1545 ?ord }
    OPTIONAL { ?book wdt:P577 ?date }
    OPTIONAL { ?book wdt:P648 ?olid FILTER(STRENDS(?olid, "W")) }
    OPTIONAL { ?book wdt:P31 ?type }
    OPTIONAL { ?book wdt:P50 ?author }
    OPTIONAL { ?series wdt:P361 ?parent }
    ${LABEL}
  } LIMIT 400`;
  const { rows, fetchedAt } = await sparql(q);
  const byBook = new Map();
  let seriesName = null;
  let parentName = null;
  for (const r of rows) {
    seriesName = seriesName || v(r, 'seriesLabel');
    parentName = parentName || v(r, 'parentLabel');
    const key = qid(v(r, 'book'));
    const cur = byBook.get(key) || { qid: key, title: v(r, 'bookLabel'), ord: null, date: null, olid: null, types: new Set(), authors: new Set() };
    if (v(r, 'ord') && !cur.ord) cur.ord = v(r, 'ord');
    const d = v(r, 'date');
    if (d && (!cur.date || d < cur.date)) cur.date = d;
    if (v(r, 'olid') && !cur.olid) cur.olid = safeOl(v(r, 'olid'));
    if (v(r, 'typeLabel')) cur.types.add(v(r, 'typeLabel'));
    if (v(r, 'authorLabel')) cur.authors.add(v(r, 'authorLabel'));
    byBook.set(key, cur);
  }
  const books = [...byBook.values()]
    .map((b) => {
      const kinds = [...b.types].map(classifyType).filter(Boolean);
      return {
        qid: b.qid,
        title: b.title,
        ord: b.ord,
        ordNum: b.ord && !Number.isNaN(parseFloat(b.ord)) ? parseFloat(b.ord) : null,
        year: b.date ? Number(b.date.slice(0, 4)) : null,
        date: b.date,
        workKey: b.olid,
        kind: kinds[0] || null,
        authors: [...b.authors],
      };
    })
    .filter((b) => b.kind !== 'Comic' && b.title && !/^Q\d+$/.test(b.title));
  return { id, name: seriesName || 'Series', parentName, books, fetchedAt };
}

export function sortSeries(books, order = 'publication') {
  const copy = [...books];
  if (order === 'story') {
    copy.sort((a, b) => (a.ordNum ?? Infinity) - (b.ordNum ?? Infinity) || (a.date || '9').localeCompare(b.date || '9'));
  } else {
    copy.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.ordNum ?? Infinity) - (b.ordNum ?? Infinity));
  }
  return copy;
}

export async function authorExtras(authorKey, wikidataId) {
  const ol = safeOl(authorKey);
  const q = safeQ(wikidataId);
  const match = q ? `BIND(wd:${q} AS ?a)` : ol ? `?a wdt:P648 ${lit(ol)} .` : null;
  if (!match) return null;
  const { rows, fetchedAt } = await sparql(
    `SELECT ?a ?pseud ?article WHERE { ${match} OPTIONAL { ?a wdt:P742 ?pseud } OPTIONAL { ?article schema:about ?a ; schema:isPartOf <https://en.wikipedia.org/> } } LIMIT 30`,
  );
  if (!rows.length) return null;
  return {
    qid: qid(v(rows[0], 'a')),
    penNames: [...new Set(rows.map((r) => v(r, 'pseud')).filter(Boolean))],
    wikipedia: v(rows[0], 'article'),
    fetchedAt,
  };
}

export async function awardsForWork(work) {
  const ol = safeOl(work.workKey);
  const qs = (work.wikidataIds || []).map(safeQ).filter(Boolean).slice(0, 5);
  if (!ol && !qs.length) return [];
  const match = [ol ? `{ ?book wdt:P648 ${lit(ol)} }` : null, qs.length ? `{ VALUES ?book { ${qs.map((x) => 'wd:' + x).join(' ')} } }` : null]
    .filter(Boolean)
    .join(' UNION ');
  const { rows } = await sparql(
    `SELECT DISTINCT ?awardLabel ?year WHERE { ${match} ?book p:P166 ?st . ?st ps:P166 ?award . OPTIONAL { ?st pq:P585 ?t } BIND(YEAR(?t) AS ?year) ${LABEL} } LIMIT 30`,
  );
  return rows.map((r) => ({ name: v(r, 'awardLabel'), year: v(r, 'year') })).filter((a) => a.name && !/^Q\d+$/.test(a.name));
}

// Awards offered in Browse. Looked up by their exact English name on Wikidata.
export const AWARDS = [
  'Hugo Award for Best Novel',
  'Nebula Award for Best Novel',
  'Pulitzer Prize for Fiction',
  'Booker Prize',
  'National Book Award for Fiction',
  'Edgar Award for Best Novel',
  'Arthur C. Clarke Award',
  "Women's Prize for Fiction",
  'Locus Award for Best Fantasy Novel',
  'World Fantasy Award—Novel',
  'Agatha Award for Best Contemporary Novel',
  'Bram Stoker Award for Best Novel',
];

export async function awardWinners(awardName) {
  if (!AWARDS.includes(awardName)) throw new Error('Unknown award.');
  const q = `SELECT ?book ?bookLabel ?authorLabel ?olid ?year WHERE {
    ?award rdfs:label ${JSON.stringify(awardName)}@en .
    ?book p:P166 ?st . ?st ps:P166 ?award .
    OPTIONAL { ?st pq:P585 ?t } BIND(YEAR(?t) AS ?year)
    OPTIONAL { ?book wdt:P50 ?author }
    OPTIONAL { ?book wdt:P648 ?olid FILTER(STRENDS(?olid, "W")) }
    ${LABEL}
  } LIMIT 400`;
  const { rows, fetchedAt } = await sparql(q, 60 * 24 * 7);
  const byBook = new Map();
  for (const r of rows) {
    const key = qid(v(r, 'book'));
    const cur = byBook.get(key) || { title: v(r, 'bookLabel'), author: v(r, 'authorLabel'), workKey: safeOl(v(r, 'olid') || ''), year: v(r, 'year') };
    byBook.set(key, cur);
  }
  const books = [...byBook.values()].filter((b) => b.title && !/^Q\d+$/.test(b.title));
  books.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  return { books, fetchedAt };
}

// Finds book series by name (Wikidata's public search).
export async function searchSeries(text) {
  const u = new URL('https://www.wikidata.org/w/api.php');
  u.searchParams.set('action', 'wbsearchentities');
  u.searchParams.set('search', text.slice(0, 100));
  u.searchParams.set('language', 'en');
  u.searchParams.set('uselang', 'en');
  u.searchParams.set('type', 'item');
  u.searchParams.set('limit', '20');
  u.searchParams.set('format', 'json');
  u.searchParams.set('origin', '*');
  const { data } = await fetchJson(u.href, { ttlMinutes: 60 * 24 });
  return (data.search || [])
    .filter((r) => /series|trilogy|saga|cycle|sequence|chronicles/i.test(r.description || '') && !/television|tv |film|video game|comic|manga|anime|podcast/i.test(r.description || ''))
    .map((r) => ({ id: r.id, name: r.label, description: r.description }))
    .filter((r) => /^Q\d+$/.test(r.id));
}

// First books of series (series number 1) that have an Open Library record.
export async function seriesStarters() {
  const q = `SELECT ?book ?bookLabel ?seriesLabel ?olid ?date WHERE {
    ?book p:P179 ?st . ?st ps:P179 ?series ; pq:P1545 "1" .
    ?book wdt:P648 ?olid FILTER(STRENDS(?olid, "W"))
    ?book wdt:P577 ?date FILTER(YEAR(?date) >= 1990)
    ?book wdt:P407 wd:Q1860 .
    ${LABEL}
  } ORDER BY DESC(?date) LIMIT 150`;
  const { rows, fetchedAt } = await sparql(q, 60 * 24 * 7);
  const seen = new Set();
  const books = [];
  for (const r of rows) {
    const olid = safeOl(v(r, 'olid') || '');
    if (!olid || seen.has(olid)) continue;
    seen.add(olid);
    books.push({ workKey: olid, title: v(r, 'bookLabel'), series: v(r, 'seriesLabel') });
  }
  return { books, fetchedAt };
}
