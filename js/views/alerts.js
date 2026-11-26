import * as store from '../store.js';
import { h, $, $$, setMain, setTitle, announce, authorHref, seriesHref, bookHref } from '../ui.js';
import { ALERT_TYPES, runAlertChecks, markAllRead, clearNotices } from '../alerts.js';
import { formatCheckedAt } from '../text.js';

export async function render() {
  setTitle('Alerts');
  const p = store.profile();
  const notices = p.notices;
  const main = setMain(`
    <h1>Alerts</h1>
    <p class="small muted">Alerts appear only here, when you open the site. They are off until you turn them on, and each profile has its own.</p>
    <section aria-labelledby="new-h">
      <div class="section-head"><h2 id="new-h">Notices</h2>
        <div class="row">${notices.length ? '<button type="button" id="read-all">Mark all read</button><button type="button" class="link" id="clear">Clear</button>' : ''}<button type="button" id="check">Check now</button></div></div>
      ${p.seen.lastAlertCheck ? `<p class="small muted">${h(formatCheckedAt(p.seen.lastAlertCheck))}${p.seen.lastAlertProblems?.length ? `. Couldn't check: ${h(p.seen.lastAlertProblems.join(', '))}.` : '.'}</p>` : ''}
      ${notices.length ? `<ul class="list-rows">${notices.map((n) => `<li><span>${n.read ? '' : '<span class="chip info">New</span>'}</span><div><a href="${h(n.href || '#/alerts')}">${h(n.text)}</a><div class="small muted">${h(new Date(n.createdAt).toLocaleString())}</div></div><span></span></li>`).join('')}</ul>` : '<p class="empty">No notices.</p>'}
    </section>
    <section aria-labelledby="types-h">
      <h2 id="types-h">Alert types</h2>
      <form id="types">${ALERT_TYPES.map((t) => t.available
        ? `<label class="check"><input type="checkbox" name="${t.id}" ${p.alerts.types[t.id] ? 'checked' : ''}> ${h(t.name)}</label><p class="hint">Source: ${h(t.source)}</p>`
        : `<label class="check"><input type="checkbox" disabled> ${h(t.name)}</label><p class="hint">${h(t.reason)}</p>`).join('')}
      </form>
    </section>
    <section aria-labelledby="follow-h">
      <h2 id="follow-h">What you follow</h2>
      <h3>Authors</h3>${followList(p.alerts.authors, (a) => `<a href="${authorHref(a.key)}">${h(a.name)}</a>`, 'author', 'key')}
      <h3>Series</h3>${followList(p.alerts.series, (s) => `<a href="${seriesHref(s.id)}">${h(s.name)}</a>`, 'series', 'id')}
      <h3>Books watched for price drops</h3>${followList(p.alerts.books, (b) => `<a href="${bookHref(b.workKey)}">${h(b.title)}</a>`, 'book', 'workKey')}
      <p class="small muted">Follow an author or series from its page. Watch a book's price from its book page.</p>
    </section>`);
  for (const box of $$('#types input[name]')) {
    box.addEventListener('change', () => {
      store.update((pr) => {
        pr.alerts.types[box.name] = box.checked;
      });
      announce(box.checked ? 'Alert turned on.' : 'Alert turned off.');
    });
  }
  $('#read-all')?.addEventListener('click', () => {
    markAllRead();
    render();
  });
  $('#clear')?.addEventListener('click', () => {
    clearNotices();
    render();
  });
  $('#check').addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    ev.currentTarget.textContent = 'Checking…';
    const res = await runAlertChecks({ force: true });
    announce(res.ran ? 'Alerts checked.' : 'Turn on an alert type first.');
    render();
  });
  for (const btn of $$('[data-unfollow]')) {
    btn.addEventListener('click', () => {
      const [kind, id] = btn.dataset.unfollow.split('|');
      store.update((pr) => {
        if (kind === 'author') pr.alerts.authors = pr.alerts.authors.filter((a) => a.key !== id);
        if (kind === 'series') pr.alerts.series = pr.alerts.series.filter((s) => s.id !== id);
        if (kind === 'book') pr.alerts.books = pr.alerts.books.filter((b) => b.workKey !== id);
      });
      render();
    });
  }
  // Seeing the page counts as reading the notices.
  if (notices.some((n) => !n.read)) setTimeout(markAllRead, 4000);
}

function followList(items, label, kind, idField) {
  if (!items.length) return '<p class="muted">None.</p>';
  return `<ul class="list-rows">${items.map((x) => `<li><span></span><div>${label(x)}</div><button type="button" class="link" data-unfollow="${kind}|${h(x[idField])}">Stop</button></li>`).join('')}</ul>`;
}
