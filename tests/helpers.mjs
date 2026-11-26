// Minimal browser stand-ins so modules can be tested in Node.
class MemoryStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
globalThis.localStorage = new MemoryStorage();

export function entry(over) {
  return { sourceId: 'x', service: 'Svc', credit: 'Src', format: 'ebook', status: 'free', kind: 'free', confirmed: true, abridged: null, url: 'https://example.org/', ...over };
}
