import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import * as store from '../js/store.js';

beforeEach(() => {
  localStorage.clear();
  store._reset();
});

test('first run preselects nothing', () => {
  const p = store.profile();
  assert.equal(p.library, null);
  assert.deepEqual(p.subscriptions, []);
  assert.equal(p.theme, null);
  assert.equal(p.setupDone, false);
  assert.ok(Object.values(p.alerts.types).every((v) => v === false), 'alerts are off by default');
});

test('export then import restores everything', () => {
  store.update((p) => {
    p.name = 'Reader';
    p.subscriptions = ['audible'];
    p.toRead.push({ workKey: 'OL1W', title: 'Dune', author: 'Frank Herbert' });
  });
  store.addOwned({ title: 'Emma', author: 'Jane Austen', format: 'ebook', service: 'Kindle' });
  store.addProfile('Second');
  const file = JSON.parse(JSON.stringify(store.exportData()));
  store.deleteAll();
  assert.equal(store.listProfiles().length, 1);
  store.importData(file, 'replace');
  const names = store.listProfiles().map((p) => p.name);
  assert.deepEqual(names, ['Reader', 'Second']);
  store.switchProfile(store.listProfiles()[0].id);
  const p = store.profile();
  assert.equal(p.toRead[0].title, 'Dune');
  assert.equal(p.owned[0].title, 'Emma');
  assert.deepEqual(p.subscriptions, ['audible']);
});

test('import in merge mode adds profiles beside existing ones', () => {
  store.update((p) => (p.name = 'A'));
  const file = JSON.parse(JSON.stringify(store.exportData()));
  store.importData(file, 'merge');
  const list = store.listProfiles();
  assert.equal(list.length, 2);
  assert.notEqual(list[0].id, list[1].id);
});

test('import rejects files that are not backups', () => {
  assert.throws(() => store.importData({ hello: 1 }), /not a Book Finder export/);
  assert.throws(() => store.importData({ kind: 'book-finder-export', schema: 99, data: {} }), /different version/);
  assert.throws(() => store.importData({ kind: 'book-finder-export', schema: 1, data: { profiles: [] } }), /no profiles/);
  assert.throws(() => store.importData({ kind: 'book-finder-export', schema: 1, data: { profiles: [{ id: 'x', name: 'y', toRead: 'bad' }] } }), /damaged/);
});

test('delete all removes every stored key for this site', () => {
  store.update((p) => p.toRead.push({ workKey: 'OL1W', title: 'X' }));
  localStorage.setItem('bookfinder:cache', '{}');
  localStorage.setItem('other-site', 'keep');
  store.deleteAll();
  assert.equal(localStorage.getItem('bookfinder:data'), null);
  assert.equal(localStorage.getItem('bookfinder:cache'), null);
  assert.equal(localStorage.getItem('other-site'), 'keep');
  assert.equal(store.profile().toRead.length, 0);
});

test('profiles keep separate lists', () => {
  store.update((p) => p.toRead.push({ workKey: 'OL1W', title: 'One' }));
  store.addProfile('Kid');
  assert.equal(store.profile().toRead.length, 0);
  store.switchProfile(store.listProfiles()[0].id);
  assert.equal(store.profile().toRead.length, 1);
});

test('a book moves between To Read and Finished, never both', () => {
  const w = { workKey: 'OL9W', title: 'Book', authors: [{ name: 'A' }] };
  store.toggleList('toRead', w);
  store.toggleList('finished', w);
  const p = store.profile();
  assert.equal(p.toRead.length, 0);
  assert.equal(p.finished.length, 1);
});
