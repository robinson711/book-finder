// Library presets and link builders. A library is chosen in setup; nothing here
// is tied to one person. Without official library access, every library link is
// labeled "Not checked".
//
// Fields:
//   libbyKey       the library's name in Libby web addresses (libbyapp.com/library/<key>)
//   overdriveHost  the library's OverDrive website (backup link to the same search)
//   hoopla         true when the library offers hoopla
//   catalogSearch  web address of the library catalog search, with {q} for the search words

export const LIBRARY_PRESETS = [
  {
    id: 'hmcpl',
    name: 'Huntsville-Madison County Public Library (Alabama)',
    shortName: 'HMCPL',
    libbyKey: 'vdl',
    libbyName: 'Valley Digital Library',
    overdriveHost: 'vdl.overdrive.com',
    hoopla: true,
    catalogSearch: 'https://catalog.hmcpl.org/Search/Results?lookfor={q}&searchIndex=Keyword',
  },
];

const enc = (s) => encodeURIComponent(s);
const words = (title, author) => [title, author].filter(Boolean).join(' ');

export function libbySearchUrl(lib, title, author) {
  if (!lib?.libbyKey) return null;
  return `https://libbyapp.com/search/${enc(lib.libbyKey)}/search/query-${enc(words(title, author))}/page-1`;
}

export function overdriveSearchUrl(lib, title, author) {
  if (!lib?.overdriveHost) return null;
  return `https://${lib.overdriveHost}/search?query=${enc(words(title, author))}`;
}

export function hooplaSearchUrl(lib, title, author) {
  if (!lib?.hoopla) return null;
  return `https://www.hoopladigital.com/search?q=${enc(words(title, author))}&scope=everything&type=direct`;
}

export function catalogSearchUrl(lib, title, author) {
  if (!lib?.catalogSearch || !lib.catalogSearch.includes('{q}')) return null;
  return lib.catalogSearch.replace('{q}', enc(words(title, author)));
}

// Checks a custom library typed in setup. Returns an error message or null.
export function validateCustomLibrary(lib) {
  if (!lib.name || !lib.name.trim()) return 'Enter the library name.';
  if (lib.libbyKey && !/^[a-z0-9-]{2,40}$/i.test(lib.libbyKey)) return 'The Libby library name should be letters, numbers or dashes only (for example "vdl").';
  if (lib.overdriveHost && !/^[a-z0-9-]+\.overdrive\.com$/i.test(lib.overdriveHost)) return 'The OverDrive address should look like "name.overdrive.com".';
  if (lib.catalogSearch) {
    let u;
    try {
      u = new URL(lib.catalogSearch.replace('{q}', 'test'));
    } catch {
      return 'The catalog search address is not a web address.';
    }
    if (u.protocol !== 'https:') return 'The catalog search address must start with https://';
    if (!lib.catalogSearch.includes('{q}')) return 'Put {q} where the search words go in the catalog address.';
  }
  return null;
}
