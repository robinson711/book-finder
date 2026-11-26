import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entry } from './helpers.mjs';
import { availabilityRow } from '../js/ui.js';
import { serviceLinks, ownedEntries } from '../js/sources/index.js';
import { newProfile } from '../js/store.js';

test('unconfirmed library link is labeled "Not checked: open in Libby"', () => {
  const html = availabilityRow(entry({ service: 'Libby', status: 'not-checked', confirmed: false, kind: 'library', linkLabel: 'Not checked: open in Libby' }));
  assert.match(html, /Not checked: open in Libby/);
  assert.match(html, /chip plain">Not checked</);
  assert.doesNotMatch(html, /Free now|Abridgment/);
});

test('subscription not ticked is labeled "Not subscribed"', () => {
  const html = availabilityRow(entry({ service: 'Everand', status: 'not-checked', confirmed: false, kind: 'subscription', subscribed: false }));
  assert.match(html, /Not subscribed/);
  const mine = availabilityRow(entry({ service: 'Everand', status: 'not-checked', confirmed: false, kind: 'subscription', subscribed: true }));
  assert.doesNotMatch(mine, /Not subscribed/);
});

test('failed source shows "Couldn\'t check" with a direct link', () => {
  const html = availabilityRow(entry({ service: 'Apple Books', status: 'error', confirmed: false, url: 'https://www.apple.com/apple-books/' }));
  assert.match(html, /Couldn't check/);
  assert.match(html, /href="https:\/\/www\.apple\.com\/apple-books\/"/);
});

test('confirmed price shows the amount and the time checked', () => {
  const html = availabilityRow(entry({ service: 'Apple Books', status: 'purchase', price: { amount: 14.99, currency: 'USD' }, checkedAt: new Date().toISOString() }));
  assert.match(html, /\$14\.99/);
  assert.match(html, /Checked just now/);
});

test('unknown abridgment is labeled', () => {
  assert.match(availabilityRow(entry({ abridged: null })), /Abridgment not confirmed/);
  assert.match(availabilityRow(entry({ abridged: false })), /Unabridged/);
});

test('every subscription and store appears as a link-out, with Not subscribed where not ticked', () => {
  const p = newProfile();
  p.subscriptions = ['kindle-unlimited'];
  const links = serviceLinks({ title: 'Dune', authors: [{ name: 'Frank Herbert' }] }, p);
  assert.ok(links.every((e) => e.status === 'not-checked' && e.confirmed === false));
  assert.equal(links.find((e) => e.sourceId === 'kindle-unlimited').subscribed, true);
  assert.equal(links.find((e) => e.sourceId === 'everand').subscribed, false);
  for (const e of links) assert.ok(!/tag=|affiliate|ref=/.test(e.url), `no affiliate tags in ${e.url}`);
  assert.ok(links.every((e) => e.url.startsWith('https://')));
});

test('owned books match by title and author on the device', () => {
  const owned = [{ title: 'Dune', author: 'Frank Herbert', format: 'audiobook', service: 'Audible' }];
  const got = ownedEntries({ workKey: 'OL1W', title: 'Dune', authors: [{ name: 'Frank Herbert' }] }, owned);
  assert.equal(got.length, 1);
  assert.equal(got[0].status, 'owned');
  assert.equal(got[0].format, 'audiobook');
  assert.equal(ownedEntries({ workKey: 'OL2W', title: 'Emma', authors: [{ name: 'Jane Austen' }] }, owned).length, 0);
});

import { isPublisherSeries } from '../js/sources/wikidata.js';
test('publisher collected-edition lines are not treated as story series', () => {
  assert.equal(isPublisherSeries('The Cambridge Edition of the Works by Jane Austen'), true);
  assert.equal(isPublisherSeries('Penguin Classics'), true);
  assert.equal(isPublisherSeries('The Hunger Games'), false);
  assert.equal(isPublisherSeries('Discworld'), false);
});
