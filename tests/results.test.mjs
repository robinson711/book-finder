import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entry } from './helpers.mjs';
import { groupForFormat, orderedConfirmed, removeAbridged, isAvailableNow, abridgmentLabel, bestStatus } from '../js/results.js';

const mixed = [
  entry({ service: 'Store B', status: 'purchase', kind: 'store', price: { amount: 9.99 } }),
  entry({ service: 'Library', status: 'library', kind: 'library', wait: { days: 10 } }),
  entry({ service: 'Gutenberg', status: 'free' }),
  entry({ service: 'Kindle', status: 'owned', kind: 'owned' }),
  entry({ service: 'Sub', status: 'included', kind: 'subscription' }),
  entry({ service: 'Store A', status: 'purchase', kind: 'store', price: { amount: 4.99 } }),
];

test('result order: owned, free, subscriptions, library, purchase', () => {
  const order = orderedConfirmed(mixed, 'ebook').map((e) => e.status);
  assert.deepEqual(order, ['owned', 'free', 'included', 'library', 'purchase', 'purchase']);
});

test('purchase options are sorted by price, cheapest first', () => {
  const buys = groupForFormat(mixed, 'ebook').groups.find((g) => g.id === 'purchase').items;
  assert.deepEqual(buys.map((e) => e.service), ['Store A', 'Store B']);
});

test('library entries are sorted by shortest wait', () => {
  const list = [entry({ service: 'L2', status: 'library', wait: { days: 30 } }), entry({ service: 'L1', status: 'library', wait: { days: 3 } })];
  const lib = groupForFormat(list, 'ebook').groups.find((g) => g.id === 'library').items;
  assert.deepEqual(lib.map((e) => e.service), ['L1', 'L2']);
});

test('ebook and audiobook results are kept apart', () => {
  const list = [entry({ format: 'ebook', service: 'E' }), entry({ format: 'audiobook', service: 'A' })];
  assert.deepEqual(orderedConfirmed(list, 'ebook').map((e) => e.service), ['E']);
  assert.deepEqual(orderedConfirmed(list, 'audiobook').map((e) => e.service), ['A']);
});

test('abridged editions never appear, in any group', () => {
  const list = [
    entry({ service: 'Abridged free', status: 'free', abridged: true }),
    entry({ service: 'Abridged buy', status: 'purchase', abridged: true, price: { amount: 1 } }),
    entry({ service: 'Abridged link', status: 'not-checked', confirmed: false, kind: 'library', abridged: true }),
    entry({ service: 'Unknown', status: 'free', abridged: null }),
    entry({ service: 'Unabridged', status: 'free', abridged: false }),
  ];
  const g = groupForFormat(list, 'ebook');
  const all = [...g.groups.flatMap((x) => x.items), ...g.unconfirmed].map((e) => e.service);
  assert.ok(!all.some((s) => s.startsWith('Abridged')));
  assert.equal(removeAbridged(list).length, 2);
  assert.equal(bestStatus([entry({ status: 'owned', abridged: true })]), null);
});

test('abridgment labels', () => {
  assert.equal(abridgmentLabel(entry({ abridged: null })), 'Abridgment not confirmed');
  assert.equal(abridgmentLabel(entry({ abridged: false })), 'Unabridged');
});

test('unconfirmed links go in their own group, library first', () => {
  const list = [
    entry({ service: 'Store', status: 'not-checked', confirmed: false, kind: 'store' }),
    entry({ service: 'Not subscribed', status: 'not-checked', confirmed: false, kind: 'subscription', subscribed: false }),
    entry({ service: 'My sub', status: 'not-checked', confirmed: false, kind: 'subscription', subscribed: true }),
    entry({ service: 'Libby', status: 'not-checked', confirmed: false, kind: 'library' }),
    entry({ service: 'Confirmed', status: 'free' }),
  ];
  const g = groupForFormat(list, 'ebook');
  assert.deepEqual(g.unconfirmed.map((e) => e.service), ['Libby', 'My sub', 'Not subscribed', 'Store']);
  assert.deepEqual(g.groups.flatMap((x) => x.items).map((e) => e.service), ['Confirmed']);
});

test('an entry marked confirmed:false is never treated as available', () => {
  const e = entry({ status: 'free', confirmed: false });
  assert.equal(isAvailableNow(e), false);
  assert.equal(orderedConfirmed([e], 'ebook').length, 0);
});

test('available now / no wait only includes confirmed, zero-wait items', () => {
  assert.equal(isAvailableNow(entry({ status: 'free' })), true);
  assert.equal(isAvailableNow(entry({ status: 'owned' })), true);
  assert.equal(isAvailableNow(entry({ status: 'library', wait: { days: 0 } })), true);
  assert.equal(isAvailableNow(entry({ status: 'library', wait: { days: 5 } })), false);
  assert.equal(isAvailableNow(entry({ status: 'library' })), false);
  assert.equal(isAvailableNow(entry({ status: 'purchase' })), false);
  assert.equal(isAvailableNow(entry({ status: 'not-checked', confirmed: false })), false);
  assert.equal(isAvailableNow(entry({ status: 'error', confirmed: false })), false);
});

test('buying options are highlighted when the confirmed library wait is over 4 weeks', () => {
  const long = [entry({ status: 'library', wait: { days: 35 } }), entry({ status: 'purchase', price: { amount: 5 } })];
  assert.equal(groupForFormat(long, 'ebook').highlightPurchase, true);
  const short = [entry({ status: 'library', wait: { days: 14 } }), entry({ status: 'purchase', price: { amount: 5 } })];
  assert.equal(groupForFormat(short, 'ebook').highlightPurchase, false);
  const free = [...long, entry({ status: 'free' })];
  assert.equal(groupForFormat(free, 'ebook').highlightPurchase, false);
  const unknownWait = [entry({ status: 'library' }), entry({ status: 'purchase', price: { amount: 5 } })];
  assert.equal(groupForFormat(unknownWait, 'ebook').highlightPurchase, false);
});
