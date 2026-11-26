import { h, setMain, setTitle } from '../ui.js';
import { ALL_SOURCES } from '../sources/index.js';

export async function render() {
  setTitle('Privacy');
  const rows = ALL_SOURCES.flatMap((s) => s.info.contacts.map((c) => ({ ...c, name: s.info.name })));
  setMain(`
    <h1>Privacy</h1>
    <p><strong>No personal data leaves your device.</strong> There are no accounts, no sign-in, no analytics, no ads, no trackers and no affiliate links. Your profiles, library choice, subscriptions, owned books, lists and alerts are stored only in this browser.</p>
    <h2>Outside services this site contacts</h2>
    <p>When you search or open a page, your browser contacts these services directly. Each one receives only what is listed, plus what every website receives from any visitor: your device's <strong>IP address</strong> and basic browser details (such as browser type). No cookies are sent with these requests, and the address of the page you came from is withheld.</p>
    <table>
      <thead><tr><th scope="col">Service</th><th scope="col">Address</th><th scope="col">What it receives</th></tr></thead>
      <tbody>
        <tr><td>GitHub Pages (hosts this site)</td><td>The site's own address</td><td>Requests for the site's files and the weekly free-catalog files. GitHub may keep server logs, including IP addresses, under the GitHub Privacy Statement.</td></tr>
        ${rows.map((r) => `<tr><td>${h(r.name)}</td><td>${h(r.host)}</td><td>${h(r.receives)}</td></tr>`).join('')}
      </tbody>
    </table>
    <h2>Links you choose to open</h2>
    <p>Library, subscription and store links (Libby, hoopla, your library catalog, Amazon, Audible, Spotify and others) are only contacted if you tap them. Those links contain the book's title and author, and open in that service, where its own privacy policy applies.</p>
    <h2>Camera</h2>
    <p>Barcode scanning reads the camera image on this device. No image is uploaded or saved.</p>
    <h2>Files you import</h2>
    <p>Owned-book files and backup files are read on this device only. Nothing is uploaded.</p>
    <h2>Fonts and scripts</h2>
    <p>The site uses your device's own fonts and loads only its own scripts, including a bundled barcode reader. It does not load anything from content delivery networks.</p>
    <h2>Deleting your data</h2>
    <p>Settings has a button that deletes everything this site stored in this browser. Clearing your browser's site data does the same.</p>`);
}
