// Library plug-ins. Today these only build "Not checked" links, because live
// Libby (OverDrive) and hoopla data need official access this site does not have.
//
// To add official access later, give a provider a `live(work, library)` function
// that returns entries with status 'library' and a `wait` object, for example:
//   { status: 'library', confirmed: true, wait: { days: 14, copies: 3, holds: 9 }, ... }
// The book page, "Available now", the over-4-weeks buying highlight and the
// "shorter library wait" alert all use those fields automatically.

import { libbySearchUrl, overdriveSearchUrl, hooplaSearchUrl, catalogSearchUrl } from '../libraries.js';

export const info = {
  id: 'library',
  name: 'Library links',
  credit: 'Links only',
  contacts: [], // links open only when you tap them
};

export const PROVIDERS = [
  {
    id: 'libby',
    name: 'Libby',
    formats: ['ebook', 'audiobook'],
    live: null, // add official OverDrive access here
    links(work, lib) {
      const title = work.title;
      const author = work.authors?.[0]?.name;
      const url = libbySearchUrl(lib, title, author);
      if (!url) return [];
      return [{ url, backupUrl: overdriveSearchUrl(lib, title, author), label: 'Not checked: open in Libby', service: `Libby${lib.libbyName ? ` (${lib.libbyName})` : ''}` }];
    },
  },
  {
    id: 'hoopla',
    name: 'hoopla',
    formats: ['ebook', 'audiobook'],
    live: null, // add a licensed hoopla feed here
    links(work, lib) {
      const url = hooplaSearchUrl(lib, work.title, work.authors?.[0]?.name);
      return url ? [{ url, label: 'Not checked: open in hoopla', service: 'hoopla' }] : [];
    },
  },
];

export async function availability(work, { library }) {
  if (!library) return [];
  const out = [];
  for (const p of PROVIDERS) {
    if (p.live) {
      try {
        out.push(...(await p.live(work, library)));
        continue;
      } catch {
        /* fall through to the link with a "Couldn't check" note */
      }
    }
    for (const link of p.links(work, library)) {
      for (const format of p.formats) {
        out.push({
          sourceId: p.id, credit: library.shortName || library.name, service: link.service, format,
          status: 'not-checked', kind: 'library', confirmed: false, url: link.url, backupUrl: link.backupUrl || null,
          linkLabel: link.label, abridged: null,
        });
      }
    }
  }
  return out;
}

// Physical copies: a secondary link to the library catalog (never checked).
export function physicalCopyLink(work, library) {
  const url = catalogSearchUrl(library, work.title, work.authors?.[0]?.name);
  return url ? { url, label: `Find a physical copy at ${library.shortName || library.name}` } : null;
}
