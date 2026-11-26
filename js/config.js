// Site-wide settings. To rename the site, change APP_NAME here and the
// "name" fields in manifest.webmanifest. Nothing personal belongs in this file.
export const APP_NAME = 'Book Finder';
export const APP_SHORT_NAME = 'Book Finder';
export const APP_VERSION = '1.0.0';

// Where the weekly free-catalog index is published (built by GitHub Actions).
export const DATA_BASE = './data/';

// Hours before a cached availability check is considered stale.
export const CHECK_TTL_HOURS = 12;

// A confirmed library wait longer than this many days highlights buying options.
export const LONG_WAIT_DAYS = 28;

// Books first published in or before this year are public domain in the United States.
// (US copyright on works published before 1931 has expired as of January 1, 2026; the
// cutoff moves forward one year every January 1.)
export function usPublicDomainCutoffYear(now = new Date()) {
  return now.getUTCFullYear() - 96;
}
