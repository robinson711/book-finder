// Everything a person saves lives here, on this device only (localStorage).
// Nothing in this file talks to the network.

const KEY = 'bookfinder:data';
const SCHEMA = 1;

export const EXPORT_KIND = 'book-finder-export';

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newProfile(name = 'Profile 1') {
  return {
    id: uid(),
    name,
    setupDone: false,
    theme: null, // 'light' | 'dark' | 'system'; null until chosen
    textSize: 100,
    library: null, // { id, name, libbyKey, overdriveHost, hoopla, catalogSearch }
    subscriptions: [], // service ids the person has ticked
    audiblePlan: null, // 'plus' | 'premium-plus' | null
    owned: [], // { id, title, author, workKey, format, service, addedAt }
    toRead: [], // book refs { workKey, title, author, coverId }
    finished: [],
    alerts: {
      types: { newBook: false, priceDrop: false, newlyIncluded: false, shorterWait: false },
      authors: [], // { key, name }
      series: [], // { id, name }
      books: [], // book refs to watch for price drops
    },
    seen: { prices: {}, authorWorks: {}, seriesWorks: {}, status: {}, lastAlertCheck: null },
    notices: [], // { id, type, text, href, createdAt, read }
  };
}

function emptyData() {
  const p = newProfile();
  return { schema: SCHEMA, activeProfileId: p.id, profiles: [p] };
}

let memory = null;
let storageOk = true;
const listeners = new Set();

function readRaw() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    storageOk = false;
    return null;
  }
}

export function storageAvailable() {
  return storageOk;
}

export function load() {
  if (memory) return memory;
  const raw = readRaw();
  memory = raw && raw.schema === SCHEMA && Array.isArray(raw.profiles) && raw.profiles.length ? migrate(raw) : emptyData();
  return memory;
}

function migrate(data) {
  // Fill in any fields added in later versions so old saves keep working.
  data.profiles = data.profiles.map((p) => {
    const base = newProfile(p.name);
    return {
      ...base,
      ...p,
      alerts: { ...base.alerts, ...p.alerts, types: { ...base.alerts.types, ...(p.alerts?.types || {}) } },
      seen: { ...base.seen, ...p.seen },
    };
  });
  if (!data.profiles.some((p) => p.id === data.activeProfileId)) data.activeProfileId = data.profiles[0].id;
  return data;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
    storageOk = true;
  } catch {
    storageOk = false;
  }
  for (const fn of listeners) fn(memory);
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function profile() {
  const d = load();
  return d.profiles.find((p) => p.id === d.activeProfileId) || d.profiles[0];
}

export function update(fn) {
  fn(profile());
  save();
}

export function listProfiles() {
  return load().profiles.map((p) => ({ id: p.id, name: p.name }));
}

export function addProfile(name) {
  const d = load();
  const p = newProfile(name || `Profile ${d.profiles.length + 1}`);
  d.profiles.push(p);
  d.activeProfileId = p.id;
  save();
  return p;
}

export function switchProfile(id) {
  const d = load();
  if (d.profiles.some((p) => p.id === id)) {
    d.activeProfileId = id;
    save();
  }
}

export function renameProfile(id, name) {
  const p = load().profiles.find((x) => x.id === id);
  if (p && name.trim()) {
    p.name = name.trim().slice(0, 40);
    save();
  }
}

export function deleteProfile(id) {
  const d = load();
  if (d.profiles.length <= 1) return false;
  d.profiles = d.profiles.filter((p) => p.id !== id);
  if (d.activeProfileId === id) d.activeProfileId = d.profiles[0].id;
  save();
  return true;
}

// ----- Lists -----

export function bookRef(work) {
  return {
    workKey: work.workKey,
    title: work.title,
    author: (work.authors || [])[0]?.name || work.author || '',
    coverId: work.coverId || null,
  };
}

export function inList(listName, workKey) {
  return profile()[listName].some((b) => b.workKey === workKey);
}

export function toggleList(listName, work) {
  update((p) => {
    const i = p[listName].findIndex((b) => b.workKey === work.workKey);
    if (i >= 0) p[listName].splice(i, 1);
    else {
      p[listName].unshift(bookRef(work));
      // A book moves from To Read to Finished, never sits in both.
      const other = listName === 'toRead' ? 'finished' : 'toRead';
      p[other] = p[other].filter((b) => b.workKey !== work.workKey);
    }
  });
}

// ----- Owned books -----

export function addOwned(entry) {
  update((p) => {
    p.owned.push({ id: uid(), addedAt: new Date().toISOString(), ...entry });
  });
}

export function removeOwned(id) {
  update((p) => {
    p.owned = p.owned.filter((o) => o.id !== id);
  });
}

// ----- Export / import / delete -----

export function exportData(now = new Date()) {
  return {
    kind: EXPORT_KIND,
    schema: SCHEMA,
    exportedAt: now.toISOString(),
    data: load(),
  };
}

export function validateImport(obj) {
  if (!obj || typeof obj !== 'object') return 'This file is not a Book Finder export.';
  if (obj.kind !== EXPORT_KIND) return 'This file is not a Book Finder export.';
  if (obj.schema !== SCHEMA) return 'This export comes from a different version and cannot be read.';
  const d = obj.data;
  if (!d || !Array.isArray(d.profiles) || d.profiles.length === 0) return 'The export has no profiles in it.';
  for (const p of d.profiles) {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') return 'A profile in the export is damaged.';
    for (const list of ['owned', 'toRead', 'finished']) {
      if (p[list] !== undefined && !Array.isArray(p[list])) return 'A list in the export is damaged.';
    }
  }
  return null;
}

// mode 'replace' swaps everything; mode 'merge' adds the file's profiles next to existing ones.
export function importData(obj, mode = 'replace') {
  const error = validateImport(obj);
  if (error) throw new Error(error);
  const incoming = migrate(structuredClone(obj.data));
  if (mode === 'merge') {
    const d = load();
    const ids = new Set(d.profiles.map((p) => p.id));
    for (const p of incoming.profiles) {
      if (ids.has(p.id)) p.id = uid();
      d.profiles.push(p);
    }
  } else {
    memory = { schema: SCHEMA, activeProfileId: incoming.activeProfileId, profiles: incoming.profiles };
  }
  save();
}

export function deleteAll() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('bookfinder:')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage blocked: nothing to delete */
  }
  memory = emptyData();
  for (const fn of listeners) fn(memory);
}

// For tests only.
export function _reset() {
  memory = null;
}
