import * as store from '../store.js';
import { h, $, setMain, setTitle, shelf, statusChip, announce, wireCoverFallbacks } from '../ui.js';
import { searchBox, wireSearchBox } from './searchbox.js';
import { statusFor, lightCheckMany } from '../availability.js';
import * as openlibrary from '../sources/openlibrary.js';
import { formatCheckedAt } from '../text.js';

function chipFor(workKey) {
  const s = statusFor(workKey);
  if (!s || !s.best) return '';
  return statusChip({ status: s.best });
}

export async function render() {
  setTitle('');
  const p = store.profile();
  const toRead = p.toRead;
  const chips = Object.fromEntries(toRead.map((b) => [b.workKey, chipFor(b.workKey)]));
  const availableNow = toRead.filter((b) => statusFor(b.workKey)?.availableNow);
  const lastChecks = toRead.map((b) => statusFor(b.workKey)?.checkedAt).filter(Boolean).sort();
  const oldest = lastChecks[0];

  const main = setMain(`
    <h1 class="visually-hidden">${h(window.APP_NAME)}</h1>
    ${searchBox()}
    <section aria-labelledby="toread-h">
      <div class="section-head"><h2 id="toread-h">My To Read list</h2><a href="#/lists">See all</a></div>
      ${toRead.length ? shelf(toRead.slice(0, 20), chips) : '<p class="empty">Your To Read list is empty. Open any book and choose "Add to To Read".</p>'}
    </section>
    <section aria-labelledby="now-h">
      <div class="section-head"><h2 id="now-h">Available now</h2>
      ${toRead.length ? '<button type="button" id="check-now">Check my To Read list</button>' : ''}</div>
      <p class="small muted">Only books confirmed as owned, free, or included in your subscriptions${p.library ? ', or with no library wait' : ''}. ${oldest ? h(`Oldest check: ${formatCheckedAt(oldest).replace('Checked ', '')}.`) : ''}</p>
      <div id="now-list">${availableNow.length ? shelf(availableNow, chips) : '<p class="empty">Nothing from your To Read list is confirmed available right now.</p>'}</div>
      <p class="small"><a href="#/browse/available">Browse all free books available now</a></p>
    </section>`);
  wireSearchBox(main);
  $('#check-now')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Looking up your books…';
    let works = [];
    try {
      works = await openlibrary.worksByKeys(toRead.map((b) => b.workKey));
    } catch {
      /* fall through: nothing to check */
    }
    await lightCheckMany(works, (i, n) => (btn.textContent = `Checking ${i} of ${n}…`));
    announce('To Read list checked.');
    render();
  });
  wireCoverFallbacks(main);
}
