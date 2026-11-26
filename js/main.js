// App start-up and page routing (addresses after the # sign).

import { APP_NAME } from './config.js';
import * as store from './store.js';
import { $, $$, h, setMain } from './ui.js';
import { runAlertChecks, unreadCount } from './alerts.js';

window.APP_NAME = APP_NAME;

const routes = [
  [/^\/?$/, () => import('./views/home.js')],
  [/^\/search$/, () => import('./views/search.js')],
  [/^\/browse(?:\/(.*))?$/, () => import('./views/browse.js')],
  [/^\/book\/(OL\d+W)$/, () => import('./views/book.js')],
  [/^\/author\/(OL\d+A)$/, () => import('./views/author.js')],
  [/^\/series\/(Q\d+)$/, () => import('./views/series.js')],
  [/^\/lists$/, () => import('./views/lists.js')],
  [/^\/alerts$/, () => import('./views/alerts.js')],
  [/^\/settings$/, () => import('./views/settings.js')],
  [/^\/setup$/, () => import('./views/setup.js')],
  [/^\/scan$/, () => import('./views/scan.js')],
  [/^\/privacy$/, () => import('./views/privacy.js')],
  [/^\/about$/, () => import('./views/about.js')],
];

export function applyTheme() {
  const p = store.profile();
  document.documentElement.dataset.theme = p.theme || 'system';
  document.documentElement.style.fontSize = `${Math.min(200, Math.max(80, p.textSize || 100))}%`;
}

function updateChrome(path) {
  const p = store.profile();
  const chip = $('#profile-chip');
  const many = store.listProfiles().length > 1;
  chip.textContent = many ? `Profile: ${p.name}` : '';
  chip.hidden = !many;
  const count = unreadCount();
  $('#alert-count').innerHTML = count ? `<span class="badge-dot" aria-label="${count} new">${count}</span>` : '';
  const section = path.split('/')[1] || 'home';
  for (const a of $$('.bottom-nav a')) {
    if (a.dataset.nav === section || (section === '' && a.dataset.nav === 'home')) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  for (const el of $$('[data-app-name]')) el.textContent = APP_NAME;
}

let renderToken = 0;
async function render() {
  const token = ++renderToken;
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const p = store.profile();
  if (!p.setupDone && path !== '/setup' && path !== '/privacy' && path !== '/about') {
    location.replace('#/setup');
    return;
  }
  updateChrome(path);
  for (const [re, loader] of routes) {
    const m = path.match(re);
    if (!m) continue;
    try {
      const view = await loader();
      if (token !== renderToken) return;
      await view.render({ match: m, params, isCurrent: () => token === renderToken });
    } catch (err) {
      console.error(err);
      if (token === renderToken) setMain(`<h1>Something went wrong</h1><p>${h(err.message || 'This page could not be shown.')}</p><p><a href="#/">Go home</a></p>`);
    }
    if (token === renderToken) {
      const main = $('#main');
      const heading = main.querySelector('h1');
      (heading || main).setAttribute('tabindex', '-1');
      (heading || main).focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    return;
  }
  setMain('<h1>Page not found</h1><p><a href="#/">Go home</a></p>');
}

store.onChange(() => {
  applyTheme();
  updateChrome((location.hash.replace(/^#/, '') || '/').split('?')[0]);
});

window.addEventListener('hashchange', render);
applyTheme();
render();

// Alerts are checked when the site is opened (in-site only, no outside notification service).
if (store.profile().setupDone) {
  runAlertChecks().then(() => updateChrome((location.hash.replace(/^#/, '') || '/').split('?')[0])).catch(() => {});
}

// Installable app: cache the site's own files for offline start-up.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
