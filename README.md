# Book Finder

Book Finder is a small website that shows where you can get a book as an **ebook or audiobook**: books you already own, free and legal copies, your subscriptions, your library, and stores. It runs entirely in your browser. There are no accounts, no analytics, no ads and no tracking. Everything you save stays on your own device.

"Book Finder" is a working name. To rename the site, see [Change the name](#change-the-name).

---

## What it can and cannot confirm

| Shown as confirmed | Source |
| --- | --- |
| Free ebooks | Project Gutenberg, Standard Ebooks, Baen Free Library, HathiTrust Full View, Open Library public-domain scans (only books published long enough ago to be public domain in the United States) |
| Free audiobooks, with narrators | LibriVox |
| Apple Books prices (ebook and audiobook), with the time checked | Apple's official iTunes Search API |
| Books you own | Your own entries, on your device |

| Link only, labeled "Not checked" | Why |
| --- | --- |
| Libby (OverDrive) and hoopla | Live data needs official access (OverDrive partner API, hoopla license) |
| Library catalog (physical copies) | Link only; the catalog does not allow automated checks |
| Kindle Unlimited, Prime Reading, Audible, Spotify, Everand, Kobo Plus, Audiobooks.com, Storytel | None offers a permitted way to check what is included |
| Kindle, Google Play Books, Kobo, Nook, Libro.fm, Chirp, Bookshop.org stores | No permitted price source (Google Play prices would need a Google key, which was skipped) |

---

## How to publish (first time)

You need a free GitHub account. The repository and the site are public on GitHub's free plan.

1. **Create the repository.** On GitHub, click **+** (top right), then **New repository**. Name it `book-finder`, choose **Public**, and leave every "Initialize" box unticked. Click **Create repository**.
2. **Upload the files.** Push this folder to the new repository's `main` branch (or use **Add file, Upload files** on the repository page and drag in everything in this folder, including the hidden `.github` folder).
3. **Turn on GitHub Pages.** In the repository, open **Settings, Pages**. Under **Build and deployment, Source**, choose **GitHub Actions**.
4. **Run the first publish.** Open the **Actions** tab, click **Publish site**, then **Run workflow**. It takes a few minutes (most of it downloads the free catalogs).
5. Your site is at `https://<your-github-name>.github.io/book-finder/`. Open it on your phone and use your browser's **Add to Home Screen** to install it like an app.

## How to update

Any change pushed to the `main` branch republishes the site automatically. The site also republishes **every Monday** to refresh the free catalogs. To refresh by hand: **Actions, Publish site, Run workflow**.

If a catalog download fails, the site still publishes; that catalog shows "Couldn't check" and **Settings, Free catalogs** says which one failed.

## How to back up your data

Your lists, owned books, profiles and settings are stored **in your browser only**. Clearing your browser's data (history, cookies, site data) erases them.

- **Back up:** Settings, **Export my data**. Save the file somewhere safe.
- **Restore or move to another device:** Settings, **Import a backup**. Choose whether it replaces everything or adds its profiles.
- **Delete everything:** Settings, **Delete all my data**.

## How to run it on your own computer

You need Python 3 (built in on Mac). In this folder run `python3 -m http.server 8080` and open `http://localhost:8080`. Free-catalog files are only built by the publish workflow; to build them locally, install Node.js 22 and run `node scripts/build-data.mjs`.

Run the tests with `node --test tests/*.test.mjs`.

---

## How to add a source

Every source is a separate module in `js/sources/`. Each exports:

```js
export const info = {
  id: 'example',
  name: 'Example',
  credit: 'Example Books',
  contacts: [{ host: 'api.example.org', receives: 'Search words (title and author)' }],
};

export async function availability(work, context) {
  // work: { workKey, title, authors: [{ name, key }], isbns, ... } from Open Library
  // return a list of entries; see js/results.js for the full shape
  return [{
    sourceId: 'example', credit: 'Example Books', service: 'Example', format: 'ebook',
    status: 'purchase',        // owned | free | included | library | purchase | not-checked | error
    kind: 'store',             // owned | free | subscription | library | store
    confirmed: true,           // only true when the source itself confirmed it
    url: 'https://example.org/book/123',
    price: { amount: 9.99, currency: 'USD' },
    checkedAt: new Date().toISOString(),
    abridged: null,            // true (never shown) | false (Unabridged) | null (Abridgment not confirmed)
  }];
}
```

Then:

1. Add it to `AVAILABILITY_SOURCES` in `js/sources/index.js`.
2. Add its web address to `connect-src` in the Content-Security-Policy line of `index.html` (the browser blocks anything not listed there).
3. Its `contacts` appear on the Privacy page automatically.
4. Only use a source whose terms allow this use, and never mark an entry `confirmed: true` unless the source confirmed it.

A link-only service (no data) is just an entry in `js/services.js`.

## How to add official library access later

Library plug-ins live in `js/sources/library.js`. Each provider (Libby, hoopla) has a `live` function that is empty today. If you or your library gets official access (OverDrive's partner API or a licensed hoopla feed):

1. Write `live(work, library)` to return entries with `status: 'library'`, `confirmed: true` and a `wait` object, for example `{ days: 14, copies: 3, holds: 9 }`. Use `wait.days: 0` when a copy is available now.
2. Any secret key must **not** go in the repository or the browser. Keep it in **GitHub Actions secrets** and have a scheduled workflow fetch only public catalog data, or use a small server you control.
3. Everything else updates on its own: the "Library" group on book pages, copies, holds and estimated wait, the over-4-weeks highlight on buying options, "Available now", the "No wait" filter, and the "Shorter library wait" alert.

## How to add or change a library

Library presets are in `js/libraries.js`. People can also type any library in Settings: its Libby name (the word after `libbyapp.com/library/`), its OverDrive address, whether it has hoopla, and a catalog search address with `{q}` where the search words go.

## Change the name

Change `APP_NAME` and `APP_SHORT_NAME` in `js/config.js`, the `name` and `short_name` in `manifest.webmanifest`, and the `<title>` in `index.html`.

---

## Privacy and rules this project follows

- No personal data leaves the device. No accounts, sign-in, analytics, ads, trackers or affiliate links.
- Requests to book sources contain only search words or book numbers. The full list of outside services, and what each receives (including your IP address), is on the site's **Privacy** page.
- No scraping where it is not allowed, no unofficial or private APIs, no pirated sources, no DRM circumvention. Library logins are never collected, and other services are never embedded or framed.
- Fonts are your device's own; all scripts are served from this site, including the bundled barcode reader (`vendor/zxing-wasm`, MIT license).
- No personal details, library card numbers or keys are stored in this repository.

## Data sources and terms

- Open Library API: https://openlibrary.org/developers/api (on-demand use for people browsing, with caching)
- Project Gutenberg offline catalogs: https://www.gutenberg.org/ebooks/offline_catalogs
- Standard Ebooks feeds: https://standardebooks.org/feeds (New Releases feed is free to all)
- LibriVox API: https://librivox.org/api/info
- HathiTrust Bibliographic API: https://hathitrust.org/bib_api
- Baen Free Library: https://www.baen.com/library/ (read only where baen.com/robots.txt allows)
- Apple iTunes Search API: https://performance-partners.apple.com/resources/documentation/itunes-store-web-service-search-api/
- Wikidata Query Service: https://query.wikidata.org
- GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
