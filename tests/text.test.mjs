import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidIsbn, isbn10to13, detectAbridgment, isDramatized, titlesMatch, authorsMatch, looksEnglish, normalizeTitle } from '../js/text.js';
import { parseOwnedFile } from '../js/importers.js';
import { usPublicDomainCutoffYear } from '../js/config.js';

test('ISBN check digits', () => {
  assert.equal(isValidIsbn('978-0-441-17271-9'), true);
  assert.equal(isValidIsbn('9780441172718'), false);
  assert.equal(isValidIsbn('0-441-17271-7'), true);
  assert.equal(isValidIsbn('0306406152'), true);
  assert.equal(isbn10to13('0306406152'), '9780306406157');
  assert.equal(isValidIsbn('12345'), false);
});

test('abridgment detection', () => {
  assert.equal(detectAbridgment('Project Hail Mary (Unabridged)'), false);
  assert.equal(detectAbridgment('Dracula (Abridged)'), true);
  assert.equal(detectAbridgment('Condensed edition'), true);
  assert.equal(detectAbridgment('Dracula'), null);
  assert.equal(isDramatized('Dracula (Dramatic Reading)'), true);
  assert.equal(isDramatized('Full-Cast Audio Drama'), true);
  assert.equal(isDramatized('Dracula'), false);
});

test('title and author matching', () => {
  assert.ok(titlesMatch('Project Hail Mary (Unabridged)', 'Project Hail Mary'));
  assert.ok(titlesMatch('The Hobbit: or There and Back Again', 'Hobbit'));
  assert.ok(!titlesMatch('Dune Messiah', 'Dune'));
  assert.ok(authorsMatch(['Andy Weir'], ['Andy Weir']));
  assert.ok(authorsMatch(['J. R. R. Tolkien'], ['John Ronald Reuel Tolkien']));
  assert.ok(!authorsMatch(['Andy Weir'], ['Frank Herbert']));
  assert.equal(normalizeTitle('  The  Martian! '), 'martian');
});

test('English check for store descriptions', () => {
  assert.equal(looksEnglish('A lone astronaut must save the earth from disaster in this incredible new science-based thriller from the author of the book.'), true);
  assert.equal(looksEnglish('Quando Ryland Grace si risveglia, non ha assolutamente idea di dove si trovi né di chi sia. Vede solo che il suo corpo è collegato a decine di tubi.'), false);
  assert.equal(looksEnglish('Short'), null);
});

test('US public domain cutoff year', () => {
  assert.equal(usPublicDomainCutoffYear(new Date('2026-11-26')), 1930);
  assert.equal(usPublicDomainCutoffYear(new Date('2027-01-01T12:00:00Z')), 1931);
});

test('owned-book file import: CSV and plain text', () => {
  const csv = 'Title,Author,Format,Service\n"Dune, Deluxe",Frank Herbert,Audiobook,Audible\nEmma,Jane Austen,ebook,Kindle\n,,,\n';
  const a = parseOwnedFile(csv);
  assert.equal(a.books.length, 2);
  assert.deepEqual(a.books[0], { title: 'Dune, Deluxe', author: 'Frank Herbert', format: 'audiobook', service: 'Audible' });
  const txt = 'Dune by Frank Herbert\nEmma - Jane Austen\nJust A Title\n';
  const b = parseOwnedFile(txt, 'Kindle');
  assert.equal(b.books.length, 3);
  assert.equal(b.books[1].author, 'Jane Austen');
  assert.equal(b.books[2].service, 'Kindle');
});
