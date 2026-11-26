// Form pieces shared by first-run setup and Settings.

import { h, $, $$ } from '../ui.js';
import { LIBRARY_PRESETS, validateCustomLibrary } from '../libraries.js';
import { SUBSCRIPTIONS, STORES, serviceById } from '../services.js';

export function libraryFieldset(p) {
  const lib = p.library;
  const choice = !lib ? (p.setupDone ? 'none' : '') : lib.id === 'custom' ? 'custom' : lib.id;
  const custom = lib && lib.id === 'custom' ? lib : {};
  return `<fieldset>
    <legend>Your library</legend>
    <p class="hint">Library links open a search in the library's own app. Nothing is checked or sent to your library by this site, and it never asks for your card number.</p>
    ${LIBRARY_PRESETS.map((l) => `<label class="check"><input type="radio" name="library" value="${h(l.id)}" ${choice === l.id ? 'checked' : ''}> ${h(l.name)}<span class="hint">Libby (${h(l.libbyName)})${l.hoopla ? ', hoopla' : ''}, library catalog</span></label>`).join('')}
    <label class="check"><input type="radio" name="library" value="custom" ${choice === 'custom' ? 'checked' : ''}> A different library</label>
    <div class="stack" id="custom-library" ${choice === 'custom' ? '' : 'hidden'}>
      <div class="field"><label for="lib-name">Library name</label><input type="text" id="lib-name" value="${h(custom.name || '')}" autocomplete="off"></div>
      <div class="field"><label for="lib-libby">Libby library name <span class="hint">(optional) The word after "libbyapp.com/library/" when you open your library in Libby, for example "vdl"</span></label><input type="text" id="lib-libby" value="${h(custom.libbyKey || '')}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <div class="field"><label for="lib-od">OverDrive website <span class="hint">(optional) For example "name.overdrive.com"</span></label><input type="text" id="lib-od" value="${h(custom.overdriveHost || '')}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <label class="check"><input type="checkbox" id="lib-hoopla" ${custom.hoopla ? 'checked' : ''}> My library offers hoopla</label>
      <div class="field"><label for="lib-cat">Catalog search address <span class="hint">(optional) Search your library catalog for "test", copy the address, and replace the word test with {q}</span></label><input type="url" id="lib-cat" value="${h(custom.catalogSearch || '')}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
    </div>
    <label class="check"><input type="radio" name="library" value="none" ${choice === 'none' ? 'checked' : ''}> No library</label>
  </fieldset>`;
}

export function servicesFieldset(p) {
  const sub = (s) => `<label class="check"><input type="checkbox" name="service" value="${h(s.id)}" ${p.subscriptions.includes(s.id) ? 'checked' : ''}> ${h(s.name)}</label>`;
  const audible = serviceById('audible');
  return `<fieldset>
    <legend>Subscriptions you have</legend>
    <p class="hint">Tick only what you pay for. Services you leave unticked still appear, marked "Not subscribed".</p>
    <div class="choice-grid">${SUBSCRIPTIONS.map(sub).join('')}</div>
    <div class="field" id="audible-plan" ${p.subscriptions.includes('audible') ? '' : 'hidden'}>
      <label for="audible-plan-select">Audible plan</label>
      <select id="audible-plan-select"><option value="">Choose a plan</option>${audible.plans.map((pl) => `<option value="${pl.id}" ${p.audiblePlan === pl.id ? 'selected' : ''}>${h(pl.name)}</option>`).join('')}</select>
    </div>
  </fieldset>
  <fieldset>
    <legend>Stores you buy from</legend>
    <p class="hint">Stores sell books one at a time. Every store still appears on book pages; ticked stores are listed first.</p>
    <div class="choice-grid">${STORES.map(sub).join('')}</div>
  </fieldset>`;
}

export function themeFieldset(p) {
  const opt = (v, label) => `<label class="check"><input type="radio" name="theme" value="${v}" ${p.theme === v ? 'checked' : ''}> ${label}</label>`;
  return `<fieldset><legend>Appearance</legend>${opt('light', 'Light')}${opt('dark', 'Dark')}${opt('system', 'Match this device')}</fieldset>`;
}

export function wireForms(root) {
  for (const r of $$('input[name="library"]', root)) {
    r.addEventListener('change', () => {
      $('#custom-library', root).hidden = $('input[name="library"]:checked', root)?.value !== 'custom';
    });
  }
  const aud = $('input[name="service"][value="audible"]', root);
  aud?.addEventListener('change', () => {
    $('#audible-plan', root).hidden = !aud.checked;
  });
  for (const r of $$('input[name="theme"]', root)) {
    r.addEventListener('change', () => {
      document.documentElement.dataset.theme = r.value;
    });
  }
}

// Reads the forms. Returns { error } or { values }.
export function readForms(root, { requireAll = false } = {}) {
  const libChoice = $('input[name="library"]:checked', root)?.value;
  const theme = $('input[name="theme"]:checked', root)?.value;
  if (requireAll && !libChoice) return { error: 'Choose your library, "A different library", or "No library".' };
  if (requireAll && !theme) return { error: 'Choose light, dark or match this device.' };
  let library = null;
  if (libChoice === 'custom') {
    library = {
      id: 'custom',
      name: $('#lib-name', root).value.trim(),
      shortName: $('#lib-name', root).value.trim(),
      libbyKey: $('#lib-libby', root).value.trim().toLowerCase() || null,
      libbyName: null,
      overdriveHost: $('#lib-od', root).value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || null,
      hoopla: $('#lib-hoopla', root).checked,
      catalogSearch: $('#lib-cat', root).value.trim() || null,
    };
    const err = validateCustomLibrary(library);
    if (err) return { error: err };
  } else if (libChoice && libChoice !== 'none') {
    library = { ...LIBRARY_PRESETS.find((l) => l.id === libChoice) };
  }
  const subscriptions = $$('input[name="service"]:checked', root).map((i) => i.value);
  const audiblePlan = subscriptions.includes('audible') ? $('#audible-plan-select', root)?.value || null : null;
  return { values: { library, libChoice, subscriptions, audiblePlan, theme } };
}
