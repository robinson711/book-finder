import * as store from '../store.js';
import { h, $$, setMain, setTitle, cover, bookHref, statusChip, announce, wireCoverFallbacks } from '../ui.js';
import { statusFor } from '../availability.js';

export async function render({ params }) {
  setTitle('My lists');
  const tab = params.get('list') === 'finished' ? 'finished' : 'toRead';
  const p = store.profile();
  const list = p[tab];
  const main = setMain(`
    <h1>My lists</h1>
    <div class="tab-row" role="group" aria-label="Choose a list">
      <a class="button" href="#/lists?list=toRead" aria-current="${tab === 'toRead'}">To Read (${p.toRead.length})</a>
      <a class="button" href="#/lists?list=finished" aria-current="${tab === 'finished'}">Finished (${p.finished.length})</a>
    </div>
    ${list.length ? `<ul class="list-rows">${list.map((b) => {
      const s = statusFor(b.workKey);
      return `<li>${cover(b, 'S', { alt: false })}
        <div><a href="${bookHref(b.workKey)}"><strong>${h(b.title)}</strong></a><div class="small muted">${h(b.author || '')}</div>${s?.best ? statusChip({ status: s.best }) : ''}</div>
        <div class="row">
          ${tab === 'toRead' ? `<button type="button" data-move="${h(b.workKey)}">Mark finished</button>` : ''}
          <button type="button" class="link" data-remove="${h(b.workKey)}">Remove<span class="visually-hidden"> ${h(b.title)}</span></button>
        </div></li>`;
    }).join('')}</ul>` : `<p class="empty">This list is empty.</p>`}
    <p class="small muted">Lists are saved in this browser only. Export a backup from Settings.</p>`);
  wireCoverFallbacks(main);
  for (const btn of $$('[data-remove]')) {
    btn.addEventListener('click', () => {
      store.update((pr) => {
        pr[tab] = pr[tab].filter((b) => b.workKey !== btn.dataset.remove);
      });
      announce('Removed.');
      render({ params });
    });
  }
  for (const btn of $$('[data-move]')) {
    btn.addEventListener('click', () => {
      const book = p.toRead.find((b) => b.workKey === btn.dataset.move);
      if (book) store.toggleList('finished', book);
      announce('Moved to Finished.');
      render({ params });
    });
  }
}
