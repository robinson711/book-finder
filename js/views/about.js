import { h, setMain, setTitle } from '../ui.js';
import { APP_VERSION } from '../config.js';

export async function render() {
  setTitle('About');
  setMain(`
    <h1>About ${h(window.APP_NAME)}</h1>
    <p>${h(window.APP_NAME)} shows where you can get a book as an ebook or audiobook: books you own, free and legal copies, your subscriptions, your library, and stores. It is a free, non-commercial project.</p>
    <h2>What the labels mean</h2>
    <dl class="meta-list">
      <dt><span class="chip ok">Free now</span></dt><dd>Confirmed free and legal to read or listen to in the United States, by the named source.</dd>
      <dt><span class="chip plain">Buy</span></dt><dd>A confirmed price, with the time it was checked.</dd>
      <dt><span class="chip plain">Not checked</span></dt><dd>A link that opens a search in that service. This site could not confirm the book is there.</dd>
      <dt><span class="chip plain">Not subscribed</span></dt><dd>A subscription you did not tick in Settings.</dd>
      <dt><span class="chip err">Couldn't check</span></dt><dd>The source did not answer. The link still opens it directly.</dd>
      <dt><span class="chip plain">Abridgment not confirmed</span></dt><dd>The source does not say whether the edition is abridged. Editions marked abridged are never shown.</dd>
    </dl>
    <h2>Sources</h2>
    <p>Book details: Open Library. Free books: Project Gutenberg, Standard Ebooks, LibriVox, Baen Free Library, HathiTrust and Open Library public-domain scans. Prices: Apple Books. Series, awards and pen names: Wikidata.</p>
    <p>Book data and covers belong to their sources and publishers. This site is not affiliated with any library, store or service it links to.</p>
    <p><a href="#/privacy">Privacy</a> · Version ${h(APP_VERSION)}</p>`);
}
