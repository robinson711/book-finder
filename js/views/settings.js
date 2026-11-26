import * as store from '../store.js';
import { h, $, $$, setMain, setTitle, announce, bookHref } from '../ui.js';
import { libraryFieldset, servicesFieldset, themeFieldset, wireForms, readForms } from './forms.js';
import { parseOwnedFile } from '../importers.js';
import { clearCache } from '../net.js';
import * as freecatalogs from '../sources/freecatalogs.js';
import { APP_VERSION } from '../config.js';

export async function render() {
  setTitle('Settings');
  const p = store.profile();
  const profiles = store.listProfiles();
  const main = setMain(`
    <h1>Settings</h1>
    <section aria-labelledby="prof-h" class="panel">
      <h2 id="prof-h">Profiles on this device</h2>
      <p class="small muted">Profiles keep separate libraries, subscriptions, owned books, lists and alerts for people sharing this device. They are not accounts and have no passwords.</p>
      <div class="field"><label for="profile-select">Current profile</label>
        <select id="profile-select">${profiles.map((x) => `<option value="${h(x.id)}" ${x.id === p.id ? 'selected' : ''}>${h(x.name)}</option>`).join('')}</select></div>
      <div class="row">
        <label for="rename" class="visually-hidden">Profile name</label>
        <input type="text" id="rename" value="${h(p.name)}" maxlength="40" class="search-select">
        <button type="button" id="rename-btn">Rename</button>
        <button type="button" id="add-profile">Add a profile</button>
        ${profiles.length > 1 ? '<button type="button" class="danger" id="delete-profile">Delete this profile</button>' : ''}
      </div>
    </section>

    <form id="prefs" class="panel" novalidate>
      <h2>Library, services and appearance</h2>
      ${libraryFieldset(p)}
      ${servicesFieldset(p)}
      ${themeFieldset(p)}
      <div class="field"><label for="text-size">Text size</label>
        <select id="text-size">${[90, 100, 115, 130, 150, 175, 200].map((s) => `<option value="${s}" ${p.textSize === s ? 'selected' : ''}>${s}%</option>`).join('')}</select></div>
      <div id="prefs-msg" role="status"></div>
      <button class="primary" type="submit">Save</button>
    </form>

    <section class="panel" aria-labelledby="owned-h">
      <h2 id="owned-h">Owned books</h2>
      <p class="small muted">Books you own appear first on book pages. Add them from a book page, by hand here, or from a file. Files are read on this device only. This site never asks for your Kindle, Audible or other logins.</p>
      <form id="owned-add" class="filter-grid">
        <div><label for="o-title">Title</label><input type="text" id="o-title" required></div>
        <div><label for="o-author">Author</label><input type="text" id="o-author"></div>
        <div><label for="o-format">Format</label><select id="o-format"><option value="ebook">Ebook</option><option value="audiobook">Audiobook</option></select></div>
        <div><label for="o-service">Where</label><select id="o-service">${['Kindle', 'Audible', 'Apple Books', 'Google Play Books', 'Kobo', 'Nook', 'Libro.fm', 'Chirp', 'Other'].map((s) => `<option>${s}</option>`).join('')}</select></div>
        <div class="row"><button type="submit">Add owned book</button></div>
      </form>
      <div class="field"><label for="owned-file">Import owned books from a file <span class="hint">A CSV with a "title" column (and optional author, format, service columns), or a text file with one "Title by Author" per line</span></label>
        <div class="row"><select id="owned-file-service" class="search-select" aria-label="These books are owned on">${['Kindle', 'Audible', 'Apple Books', 'Google Play Books', 'Kobo', 'Nook', 'Libro.fm', 'Chirp', 'Other'].map((s) => `<option>${s}</option>`).join('')}</select>
        <input type="file" id="owned-file" accept=".csv,.txt,text/csv,text/plain"></div></div>
      <div id="owned-msg" role="status"></div>
      <details><summary>Your owned books (${p.owned.length})</summary>
        ${p.owned.length ? `<ul class="list-rows">${p.owned.map((o) => `<li><span></span><div>${o.workKey ? `<a href="${bookHref(o.workKey)}">${h(o.title)}</a>` : h(o.title)}<div class="small muted">${h(o.author || '')} · ${o.format === 'audiobook' ? 'Audiobook' : 'Ebook'} on ${h(o.service)}</div></div><button type="button" class="link" data-del-owned="${h(o.id)}">Remove</button></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
      </details>
    </section>

    <section class="panel" aria-labelledby="data-h">
      <h2 id="data-h">Your data</h2>
      <div class="notice warn">Everything is stored in this browser only. Clearing this browser's data erases your lists, owned books and settings. Export a backup file to keep them.</div>
      <div class="row">
        <button type="button" id="export">Export my data</button>
        <label class="button" for="import-file">Import a backup</label>
        <input type="file" id="import-file" accept=".json,application/json" class="visually-hidden">
        <select id="import-mode" class="search-select" aria-label="How to import"><option value="replace">Import replaces everything</option><option value="merge">Import adds its profiles</option></select>
      </div>
      <div id="data-msg" role="status"></div>
      <h3>Delete everything</h3>
      <p class="small">Removes all profiles, lists, owned books, alerts and saved lookups from this browser. This cannot be undone.</p>
      <div class="row"><label class="check"><input type="checkbox" id="confirm-delete"> I understand this cannot be undone</label><button type="button" class="danger" id="delete-all" disabled>Delete all my data</button></div>
    </section>

    <section class="panel" aria-labelledby="catalog-h">
      <h2 id="catalog-h">Free catalogs</h2><div id="catalog-status"><p class="loading">Checking…</p></div>
    </section>
    <p><a href="#/privacy">Privacy</a> · <a href="#/about">About this site</a> · Version ${h(APP_VERSION)}</p>`);

  wireForms(main);
  $('#profile-select').addEventListener('change', (e) => {
    store.switchProfile(e.target.value);
    const np = store.profile();
    location.hash = np.setupDone ? '#/' : '#/setup';
  });
  $('#rename-btn').addEventListener('click', () => {
    store.renameProfile(p.id, $('#rename').value);
    announce('Profile renamed.');
    render();
  });
  $('#add-profile').addEventListener('click', () => {
    store.addProfile();
    location.hash = '#/setup';
  });
  $('#delete-profile')?.addEventListener('click', (ev) => {
    const btn = ev.currentTarget;
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.textContent = `Press again to delete "${p.name}"`;
      return;
    }
    store.deleteProfile(p.id);
    announce('Profile deleted.');
    render();
  });

  $('#prefs').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const res = readForms(main);
    if (res.error) {
      $('#prefs-msg').innerHTML = `<div class="notice err">${h(res.error)}</div>`;
      return;
    }
    store.update((pr) => {
      if (res.values.libChoice) pr.library = res.values.library;
      pr.subscriptions = res.values.subscriptions;
      pr.audiblePlan = res.values.audiblePlan;
      if (res.values.theme) pr.theme = res.values.theme;
      pr.textSize = Number($('#text-size').value) || 100;
    });
    $('#prefs-msg').innerHTML = '<div class="notice">Saved.</div>';
    announce('Settings saved.');
  });

  $('#owned-add').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = $('#o-title').value.trim();
    if (!title) return;
    store.addOwned({ title, author: $('#o-author').value.trim(), format: $('#o-format').value, service: $('#o-service').value });
    announce('Owned book added.');
    render();
  });
  $('#owned-file').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      $('#owned-msg').innerHTML = '<div class="notice err">That file is larger than 5 MB.</div>';
      return;
    }
    const { books, skipped } = parseOwnedFile(await file.text(), $('#owned-file-service').value);
    store.update((pr) => {
      for (const b of books) pr.owned.push({ id: crypto.randomUUID(), addedAt: new Date().toISOString(), ...b });
    });
    $('#owned-msg').innerHTML = `<div class="notice">Added ${books.length} owned books${skipped ? `, skipped ${skipped} lines` : ''}.</div>`;
    announce(`Added ${books.length} owned books.`);
  });
  for (const b of $$('[data-del-owned]')) {
    b.addEventListener('click', () => {
      store.removeOwned(b.dataset.delOwned);
      render();
    });
  }

  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `book-finder-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $('#data-msg').innerHTML = '<div class="notice">Backup file saved to your downloads.</div>';
  });
  $('#import-file').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      store.importData(obj, $('#import-mode').value);
      $('#data-msg').innerHTML = '<div class="notice">Backup imported.</div>';
      announce('Backup imported.');
      setTimeout(() => (location.hash = '#/'), 800);
    } catch (err) {
      $('#data-msg').innerHTML = `<div class="notice err">${h(err instanceof SyntaxError ? 'That file is not a Book Finder backup.' : err.message)}</div>`;
    }
  });
  $('#confirm-delete').addEventListener('change', (e) => {
    $('#delete-all').disabled = !e.target.checked;
  });
  $('#delete-all').addEventListener('click', () => {
    store.deleteAll();
    clearCache();
    location.hash = '#/setup';
  });

  const meta = await freecatalogs.meta();
  $('#catalog-status').innerHTML = meta
    ? `<table><thead><tr><th>Catalog</th><th>Books</th><th>Downloaded</th></tr></thead><tbody>${Object.entries(meta.sources || {}).map(([, s]) => `<tr><td>${h(s.name)}</td><td>${s.ok ? h(String(s.count)) : `<span class="muted">${h(s.error || 'Not available')}</span>`}</td><td>${s.fetchedAt ? h(new Date(s.fetchedAt).toLocaleDateString()) : ''}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">The free catalog files have not been built yet. They are built when the site is published.</p>';
}
