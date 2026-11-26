// Reads a file of owned books on this device. Nothing is uploaded.
// Accepted: a CSV with a header row containing "title" (and optionally author,
// format, service), or a plain text file with one book per line written as
// "Title by Author" or "Title - Author".

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function normFormat(v) {
  return /audio|listen|audible/i.test(String(v || '')) ? 'audiobook' : 'ebook';
}

export function parseOwnedFile(text, defaultService = 'Other') {
  const clean = String(text || '').replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { books: [], skipped: 0 };
  const first = lines[0].toLowerCase();
  if (first.includes(',') && /(^|,)\s*"?title"?\s*(,|$)/.test(first)) {
    const rows = parseCsv(clean);
    const header = rows[0].map((x) => x.trim().toLowerCase());
    const col = (names) => header.findIndex((x) => names.includes(x));
    const ti = col(['title', 'book title', 'name']);
    const ai = col(['author', 'authors', 'author name', 'by']);
    const fi = col(['format', 'type']);
    const si = col(['service', 'store', 'source', 'where']);
    const books = [];
    let skipped = 0;
    for (const r of rows.slice(1)) {
      const title = (r[ti] || '').trim();
      if (!title || title.length > 300) {
        skipped++;
        continue;
      }
      books.push({
        title,
        author: ai >= 0 ? (r[ai] || '').trim().slice(0, 200) : '',
        format: fi >= 0 ? normFormat(r[fi]) : normFormat(defaultService),
        service: si >= 0 && (r[si] || '').trim() ? r[si].trim().slice(0, 60) : defaultService,
      });
    }
    return { books, skipped };
  }
  const books = [];
  let skipped = 0;
  for (const line of lines) {
    const m = line.match(/^(.*?)\s+(?:by|-|–|—)\s+(.+)$/i);
    const title = (m ? m[1] : line).trim();
    if (!title || title.length > 300) {
      skipped++;
      continue;
    }
    books.push({ title, author: m ? m[2].trim().slice(0, 200) : '', format: normFormat(defaultService), service: defaultService });
  }
  return { books, skipped };
}
