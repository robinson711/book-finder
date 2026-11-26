// Subscriptions and stores that can only be linked to (no permitted data source).
// Each search link only contains the book's title and author.
// To add a service: add an entry here. See README "Add a source".

const q = (title, author) => encodeURIComponent([title, author].filter(Boolean).join(' '));

export const SERVICES = [
  // ----- Subscriptions -----
  {
    id: 'kindle-unlimited', name: 'Kindle Unlimited', kind: 'subscription', formats: ['ebook'],
    search: (t, a) => `https://www.amazon.com/s?k=${q(t, a)}&i=digital-text`,
  },
  {
    id: 'prime-reading', name: 'Amazon Prime (Prime Reading)', kind: 'subscription', formats: ['ebook'],
    search: (t, a) => `https://www.amazon.com/s?k=${q(t, a)}&i=digital-text`,
  },
  {
    id: 'audible', name: 'Audible', kind: 'subscription', formats: ['audiobook'],
    plans: [
      { id: 'plus', name: 'Audible Plus' },
      { id: 'premium-plus', name: 'Audible Premium Plus' },
    ],
    search: (t, a) => `https://www.audible.com/search?keywords=${q(t, a)}`,
  },
  {
    id: 'spotify', name: 'Spotify Premium', kind: 'subscription', formats: ['audiobook'],
    search: (t, a) => `https://open.spotify.com/search/${q(t, a)}/audiobooks`,
  },
  {
    id: 'everand', name: 'Everand', kind: 'subscription', formats: ['ebook', 'audiobook'],
    search: (t, a) => `https://www.everand.com/search?query=${q(t, a)}`,
  },
  {
    id: 'kobo-plus', name: 'Kobo Plus', kind: 'subscription', formats: ['ebook', 'audiobook'],
    search: (t, a) => `https://www.kobo.com/us/en/search?query=${q(t, a)}`,
  },
  {
    id: 'audiobooks-com', name: 'Audiobooks.com', kind: 'subscription', formats: ['audiobook'],
    search: (t) => `https://www.audiobooks.com/search/book/${q(t)}`,
  },
  {
    id: 'storytel', name: 'Storytel', kind: 'subscription', formats: ['ebook', 'audiobook'],
    search: () => 'https://www.storytel.com/',
    homeOnly: true,
  },
  // ----- Stores (books bought one at a time) -----
  {
    id: 'apple-books', name: 'Apple Books', kind: 'store', formats: ['ebook', 'audiobook'],
    // Prices for Apple Books come from Apple's official Search API (see sources/apple.js).
    search: () => 'https://www.apple.com/apple-books/',
    homeOnly: true,
  },
  {
    id: 'google-play-books', name: 'Google Play Books', kind: 'store', formats: ['ebook', 'audiobook'],
    search: (t, a) => `https://play.google.com/store/search?q=${q(t, a)}&c=books`,
  },
  {
    id: 'kindle-store', name: 'Kindle Store', kind: 'store', formats: ['ebook'],
    search: (t, a) => `https://www.amazon.com/s?k=${q(t, a)}&i=digital-text`,
  },
  {
    id: 'kobo-store', name: 'Kobo', kind: 'store', formats: ['ebook', 'audiobook'],
    search: (t, a) => `https://www.kobo.com/us/en/search?query=${q(t, a)}`,
  },
  {
    id: 'nook', name: 'Nook (Barnes & Noble)', kind: 'store', formats: ['ebook', 'audiobook'],
    search: (t, a) => `https://www.barnesandnoble.com/search?q=${q(t, a)}`,
  },
  {
    id: 'libro-fm', name: 'Libro.fm', kind: 'store', formats: ['audiobook'],
    search: (t, a) => `https://libro.fm/search?q=${q(t, a)}`,
  },
  {
    id: 'chirp', name: 'Chirp', kind: 'store', formats: ['audiobook'],
    search: (t) => `https://www.chirpbooks.com/search?q=${q(t)}`,
  },
  {
    id: 'bookshop', name: 'Bookshop.org', kind: 'store', formats: ['ebook', 'audiobook'],
    search: (t, a) => `https://bookshop.org/search?keywords=${q(t, a)}`,
  },
];

export function serviceById(id) {
  return SERVICES.find((s) => s.id === id) || null;
}

export const SUBSCRIPTIONS = SERVICES.filter((s) => s.kind === 'subscription');
export const STORES = SERVICES.filter((s) => s.kind === 'store');
