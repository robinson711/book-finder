import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gutenbergFromCsv, librivoxItem, standardEbooksFromAtom, robotsAllows, baenFromHtml } from '../scripts/build-data.mjs';
import { libbySearchUrl, hooplaSearchUrl, overdriveSearchUrl, catalogSearchUrl, LIBRARY_PRESETS, validateCustomLibrary } from '../js/libraries.js';

test('Gutenberg catalog: English text only, names re-ordered, children\'s books kept, comics left out', () => {
  const csv = 'Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves\n'
    + '345,Text,1995-10-01,Dracula,en,"Stoker, Bram, 1847-1912",Horror tales,PR,Gothic Fiction\n'
    + '1,Sound,2000-01-01,Audio,en,"X, Y",,,\n'
    + '2,Text,2000-01-01,Le Livre,fr,"Z, A",,,\n'
    + '3,Text,2000-01-01,Kids,en,"Q, R",Juvenile fiction,,\n'
    + '4,Text,2000-01-01,Funnies,en,"S, T",Comic books strips etc,,\n';
  const books = gutenbergFromCsv(csv);
  assert.deepEqual(Object.keys(books).sort(), ['3', '345']);
  assert.deepEqual(books['345'], ['Dracula', 'Bram Stoker']);
});

test('LibriVox items: readers, dramatized and abridged flags', () => {
  const b = librivoxItem({ id: '1', title: 'Dracula (Dramatic Reading)', authors: [{ first_name: 'Bram', last_name: 'Stoker' }], totaltimesecs: '3600',
    url_librivox: 'http://librivox.org/dracula', sections: [{ readers: [{ display_name: 'Ann' }] }, { readers: [{ display_name: 'Ann' }, { display_name: 'Bob' }] }] });
  assert.deepEqual(b.r, ['Ann', 'Bob']);
  assert.equal(b.d, true);
  assert.equal(b.u, 'https://librivox.org/dracula');
  assert.equal(librivoxItem({ id: 2, title: 'Emma (abridged)' }).ab, true);
  assert.equal(librivoxItem({ id: 3, title: 'Emma (unabridged)' }).ab, undefined);
});

test('Standard Ebooks feed parsing', () => {
  const xml = '<feed><entry><id>https://standardebooks.org/ebooks/a/b</id><title>Sir Nigel</title><author><name>Arthur Conan Doyle</name></author><link href="https://standardebooks.org/ebooks/a/b" rel="alternate" type="application/xhtml+xml"/></entry></feed>';
  assert.deepEqual(standardEbooksFromAtom(xml), [{ url: 'https://standardebooks.org/ebooks/a/b', t: 'Sir Nigel', a: 'Arthur Conan Doyle' }]);
});

test('robots.txt rules are honored', () => {
  const robots = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nCrawl-delay: 5\nDisallow: /*?*q=\nDisallow: /download/\n';
  assert.deepEqual(robotsAllows(robots, '/allbooks/category/index/id/2012?page=2'), { allowed: true, delaySeconds: 5 });
  assert.equal(robotsAllows(robots, '/catalog?q=x').allowed, false);
  assert.equal(robotsAllows(robots, '/download/file').allowed, false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\n', '/anything').allowed, false);
});

test('Baen list parsing', () => {
  const html = '<p><a href="https://www.baen.com/witchy-eye.html" class="slider-book-name">Witchy Eye</a></p><p class="slider-book-description">by D.J. Butler</p>';
  assert.deepEqual(baenFromHtml(html), [{ url: 'https://www.baen.com/witchy-eye.html', t: 'Witchy Eye', a: 'D.J. Butler' }]);
});

test('HMCPL link formats contain only the search words', () => {
  const hm = LIBRARY_PRESETS.find((l) => l.id === 'hmcpl');
  assert.equal(libbySearchUrl(hm, 'Project Hail Mary', 'Andy Weir'), 'https://libbyapp.com/search/vdl/search/query-Project%20Hail%20Mary%20Andy%20Weir/page-1');
  assert.equal(overdriveSearchUrl(hm, 'Dune'), 'https://vdl.overdrive.com/search?query=Dune');
  assert.equal(hooplaSearchUrl(hm, 'Dune'), 'https://www.hoopladigital.com/search?q=Dune&scope=everything&type=direct');
  assert.equal(catalogSearchUrl(hm, 'Dune'), 'https://catalog.hmcpl.org/Search/Results?lookfor=Dune&searchIndex=Keyword');
});

test('custom library validation', () => {
  assert.equal(validateCustomLibrary({ name: 'My Library', libbyKey: 'mylib', catalogSearch: 'https://cat.example.org/search?q={q}' }), null);
  assert.match(validateCustomLibrary({ name: '' }), /library name/);
  assert.match(validateCustomLibrary({ name: 'X', catalogSearch: 'http://x.org/?q={q}' }), /https/);
  assert.match(validateCustomLibrary({ name: 'X', catalogSearch: 'https://x.org/?q=' }), /\{q\}/);
});
