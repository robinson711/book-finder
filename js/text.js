// Small pure helpers for text, ISBNs and edition labels. No network, no DOM.

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Lowercase, strip accents, punctuation and edition notes like "(Unabridged)".
export function normalizeTitle(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\((?:un)?abridged\)|\[(?:un)?abridged\]/g, ' ')
    .replace(/\(.*?(?:edition|novel|book \d+|a novel)\)/g, ' ')
    .replace(/:.*$/, ' ') // drop subtitles
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// True when two titles name the same work (after normalizing).
export function titlesMatch(a, b) {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  return x.length > 0 && x === y;
}

// True when any author in list a shares a surname and first initial with one in list b.
export function authorsMatch(a, b) {
  const listA = [].concat(a || []).map(normalizeName).filter(Boolean);
  const listB = [].concat(b || []).map(normalizeName).filter(Boolean);
  const key = (n) => {
    const parts = n.split(' ');
    return `${parts[parts.length - 1]}|${parts[0][0]}`;
  };
  const keysB = new Set(listB.map(key));
  return listA.some((n) => keysB.has(key(n)));
}

// ----- ISBN -----

export function cleanIsbn(raw) {
  return String(raw ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn10(raw) {
  const s = cleanIsbn(raw);
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = s[i] === 'X' ? 10 : Number(s[i]);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(raw) {
  const s = cleanIsbn(raw);
  if (!/^97[89]\d{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

export function isValidIsbn(raw) {
  return isValidIsbn10(raw) || isValidIsbn13(raw);
}

export function isbn10to13(raw) {
  const s = cleanIsbn(raw);
  if (!isValidIsbn10(s)) return null;
  const core = '978' + s.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return core + ((10 - (sum % 10)) % 10);
}

// ----- Edition labels -----

// Returns true (abridged), false (confirmed unabridged) or null (source does not say).
export function detectAbridgment(...texts) {
  const joined = texts.filter(Boolean).join(' ').toLowerCase();
  if (/\bunabridged\b/.test(joined)) return false;
  if (/\babridged\b|\bcondensed\b|\babridgement\b|\babridgment\b/.test(joined)) return true;
  return null;
}

export function isDramatized(...texts) {
  const joined = texts.filter(Boolean).join(' ').toLowerCase();
  return /\bdramati[sz]ed\b|\bdramatic reading\b|\bfull[- ]cast\b|\bradio play\b|\baudio drama\b/.test(joined);
}

// Very small English check for store descriptions that do not state a language.
// Returns true when the text reads as English, false when it clearly does not,
// and null when there is too little text to tell.
const EN_WORDS = new Set(['the', 'and', 'of', 'to', 'a', 'in', 'is', 'that', 'his', 'her', 'with', 'for', 'he', 'she', 'it', 'was', 'on', 'as', 'by', 'from', 'this', 'an', 'be', 'are', 'who', 'their', 'they', 'has', 'have', 'but', 'not', 'at', 'when', 'what', 'all']);
export function looksEnglish(text) {
  const words = String(text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .match(/[a-zÀ-ɏ']+/g) || [];
  if (words.length < 12) return null;
  const hits = words.filter((w) => EN_WORDS.has(w)).length;
  return hits / words.length >= 0.12;
}

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatDuration(totalSeconds) {
  const s = Number(totalSeconds);
  if (!Number.isFinite(s) || s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} hr ${m} min`;
}

export function formatCheckedAt(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return 'Checked just now';
  if (mins < 60) return `Checked ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Checked ${hrs} hr ago`;
  return `Checked ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function formatPrice(amount, currency = 'USD') {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '';
  if (amount === 0) return 'Free';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function slug(text) {
  return normalizeName(text).replace(/ /g, '-');
}
