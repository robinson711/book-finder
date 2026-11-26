import * as store from '../store.js';
import { h, $, setMain, setTitle, announce } from '../ui.js';
import { libraryFieldset, servicesFieldset, themeFieldset, wireForms, readForms } from './forms.js';

export async function render() {
  setTitle('Set up');
  const p = store.profile();
  const main = setMain(`
    <h1>Welcome to ${h(window.APP_NAME)}</h1>
    <p>${h(window.APP_NAME)} shows where you can read or listen to a book: books you own, free legal copies, your subscriptions, your library and stores. Everything you choose here stays on this device. There are no accounts.</p>
    <div class="notice warn"><strong>Your lists live in this browser only.</strong> Clearing this browser's data (history, cookies and site data) erases them. Use <em>Settings, Export my data</em> to keep a backup file.</div>
    ${store.storageAvailable() ? '' : '<div class="notice err" role="alert">This browser is blocking storage, so nothing can be saved. Private browsing often does this.</div>'}
    <form id="setup" novalidate>
      <div class="field"><label for="profile-name">Profile name <span class="hint">(optional) Useful if several people share this device</span></label>
        <input type="text" id="profile-name" value="${h(p.name)}" maxlength="40" autocomplete="off"></div>
      ${libraryFieldset(p)}
      ${servicesFieldset(p)}
      ${themeFieldset(p)}
      <div id="setup-error" role="alert"></div>
      <button class="primary" type="submit">Finish setup</button>
    </form>
    <p class="small muted">See the <a href="#/privacy">Privacy page</a> for every outside service this site contacts.</p>`);
  wireForms(main);
  $('#setup').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const res = readForms(main, { requireAll: true });
    if (res.error) {
      $('#setup-error').innerHTML = `<div class="notice err">${h(res.error)}</div>`;
      announce(res.error);
      return;
    }
    const name = $('#profile-name').value.trim();
    store.update((pr) => {
      if (name) pr.name = name.slice(0, 40);
      pr.library = res.values.library;
      pr.subscriptions = res.values.subscriptions;
      pr.audiblePlan = res.values.audiblePlan;
      pr.theme = res.values.theme;
      pr.setupDone = true;
    });
    location.hash = '#/';
  });
}
