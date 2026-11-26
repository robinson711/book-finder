// Network helper: every request to an outside service goes through here, so
// rate limits, time-outs and caching are handled in one place.
// Requests never include cookies or personal data: only search words or book numbers.

const CACHE_KEY = 'bookfinder:cache';
const CACHE_MAX_ENTRIES = 400;

// Minimum gap between requests to each host, in milliseconds.
const HOST_GAP_MS = {
  'openlibrary.org': 1100, // Open Library: 1 request per second without identification
  'itunes.apple.com': 3100, // Apple: about 20 calls per minute
  'catalog.hathitrust.org': 500,
  'query.wikidata.org': 500,
};

const lastCall = new Map();
const queues = new Map();

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle(host) {
  const gap = HOST_GAP_MS[host] ?? 0;
  const prev = queues.get(host) || Promise.resolve();
  const next = prev.then(async () => {
    const since = Date.now() - (lastCall.get(host) || 0);
    if (since < gap) await wait(gap - since);
    lastCall.set(host, Date.now());
  });
  queues.set(host, next.catch(() => {}));
  return next;
}

let memCache = null;
function readCache() {
  if (memCache) return memCache;
  try {
    memCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    memCache = {};
  }
  return memCache;
}
function writeCache() {
  try {
    const entries = Object.entries(memCache);
    if (entries.length > CACHE_MAX_ENTRIES) {
      entries.sort((a, b) => a[1].t - b[1].t);
      memCache = Object.fromEntries(entries.slice(entries.length - CACHE_MAX_ENTRIES));
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(memCache));
  } catch {
    /* storage full or blocked: keep the in-memory copy only */
  }
}

export function clearCache() {
  memCache = {};
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export class FetchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// ttlMinutes: 0 disables the cache. Returns { data, fetchedAt, fromCache }.
export async function fetchJson(url, { ttlMinutes = 60, timeoutMs = 12000, accept } = {}) {
  const now = Date.now();
  if (ttlMinutes > 0) {
    const hit = readCache()[url];
    if (hit && now - hit.t < ttlMinutes * 60000) return { data: hit.d, fetchedAt: new Date(hit.t).toISOString(), fromCache: true };
  }
  const host = new URL(url, location.href).host;
  await throttle(host);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: accept ? { Accept: accept } : undefined,
    });
  } catch (e) {
    throw new FetchError(e.name === 'AbortError' ? 'The service took too long to answer.' : 'Could not reach the service.', 0);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new FetchError(`The service answered with an error (${res.status}).`, res.status);
  const data = await res.json();
  const fetchedAt = new Date().toISOString();
  if (ttlMinutes > 0) {
    readCache()[url] = { t: Date.now(), d: data };
    writeCache();
  }
  return { data, fetchedAt, fromCache: false };
}

// Files published with this site (the weekly free-catalog index).
const localCache = new Map();
export async function fetchLocal(path) {
  if (localCache.has(path)) return localCache.get(path);
  const p = fetch(path, { credentials: 'same-origin' }).then((r) => {
    if (!r.ok) throw new FetchError('Catalog file missing.', r.status);
    return r.json();
  });
  localCache.set(path, p);
  p.catch(() => localCache.delete(path));
  return p;
}
