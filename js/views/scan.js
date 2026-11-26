// ISBN barcode scanning. Camera images are processed on this device only:
// by the browser's built-in barcode reader where available, otherwise by a
// barcode reader bundled with this site (vendor/zxing-wasm). Nothing is uploaded.

import { h, $, setMain, setTitle, announce } from '../ui.js';
import { cleanIsbn, isValidIsbn } from '../text.js';

let stream = null;
let timer = null;

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  if (stream) for (const t of stream.getTracks()) t.stop();
  stream = null;
}
window.addEventListener('hashchange', stop);

let zxingPromise = null;
function zxing() {
  if (!zxingPromise) {
    zxingPromise = import('../../vendor/zxing-wasm/reader/index.js').then((mod) => {
      mod.prepareZXingModule({
        overrides: { locateFile: (path) => new URL(`../../vendor/zxing-wasm/reader/${path}`, import.meta.url).href },
      });
      return mod;
    });
  }
  return zxingPromise;
}

async function makeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('ean_13')) {
        const d = new window.BarcodeDetector({ formats: ['ean_13'] });
        return async (source) => (await d.detect(source)).map((r) => r.rawValue);
      }
    } catch {
      /* fall back to the bundled reader */
    }
  }
  const mod = await zxing();
  return async (source) => {
    let input = source;
    if (source instanceof HTMLVideoElement) {
      const c = document.createElement('canvas');
      c.width = source.videoWidth;
      c.height = source.videoHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(source, 0, 0);
      input = ctx.getImageData(0, 0, c.width, c.height);
    }
    const res = await mod.readBarcodes(input, { formats: ['EAN13'], tryHarder: true, maxNumberOfSymbols: 1 });
    return res.filter((r) => r.isValid).map((r) => r.text);
  };
}

function found(code) {
  const isbn = cleanIsbn(code);
  if (!isValidIsbn(isbn) || !/^97[89]/.test(isbn)) return false;
  stop();
  announce(`Found ISBN ${isbn}.`);
  location.hash = `#/search?q=${isbn}&type=isbn`;
  return true;
}

export async function render() {
  setTitle('Scan a barcode');
  const main = setMain(`
    <h1>Scan a book's barcode</h1>
    <p>Point your camera at the barcode on the back of a book (the one starting with 978 or 979). The image is read on this device and never uploaded.</p>
    <div class="row"><button class="primary" type="button" id="start">Start camera</button>
      <label class="button" for="photo">Take or choose a photo</label>
      <input type="file" id="photo" accept="image/*" capture="environment" class="visually-hidden"></div>
    <div id="cam" hidden><div class="scanner"><video id="video" playsinline muted></video><div class="frame" aria-hidden="true"></div></div>
      <p class="small muted" aria-live="polite" id="scan-status">Looking for a barcode…</p><button type="button" id="stop">Stop camera</button></div>
    <div id="scan-msg" role="alert"></div>
    <form id="manual" class="stack">
      <h2>Or type the ISBN</h2>
      <div class="search-form"><label for="isbn" class="visually-hidden">ISBN</label>
        <input type="text" id="isbn" inputmode="numeric" autocomplete="off" placeholder="978…" maxlength="20">
        <button class="primary" type="submit">Find</button></div>
    </form>`);
  $('#manual').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = $('#isbn').value;
    if (!found(v)) {
      const isbn = cleanIsbn(v);
      if (isValidIsbn(isbn)) location.hash = `#/search?q=${isbn}&type=isbn`;
      else $('#scan-msg').innerHTML = `<div class="notice err">${h('That is not a valid ISBN. Check the digits and try again.')}</div>`;
    }
  });
  $('#photo').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    $('#scan-msg').innerHTML = '<p class="loading">Reading the photo…</p>';
    try {
      const mod = await zxing();
      const res = await mod.readBarcodes(file, { formats: ['EAN13'], tryHarder: true });
      const ok = res.filter((r) => r.isValid).some((r) => found(r.text));
      if (!ok) $('#scan-msg').innerHTML = '<div class="notice err">No book barcode found in that photo. Try again closer, or type the ISBN.</div>';
    } catch {
      $('#scan-msg').innerHTML = '<div class="notice err">The photo could not be read. Type the ISBN instead.</div>';
    }
  });
  $('#stop').addEventListener('click', () => {
    stop();
    $('#cam').hidden = true;
  });
  $('#start').addEventListener('click', async () => {
    $('#scan-msg').innerHTML = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      $('#scan-msg').innerHTML = '<div class="notice err">This browser cannot use the camera here. Take a photo or type the ISBN instead.</div>';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    } catch {
      $('#scan-msg').innerHTML = '<div class="notice err">Camera access was not allowed. You can allow it in your browser settings, take a photo, or type the ISBN.</div>';
      return;
    }
    const video = $('#video');
    video.srcObject = stream;
    await video.play();
    $('#cam').hidden = false;
    const detect = await makeDetector();
    let busy = false;
    timer = setInterval(async () => {
      if (busy || !stream || video.readyState < 2) return;
      busy = true;
      try {
        const codes = await detect(video);
        for (const c of codes) if (found(c)) break;
      } catch {
        /* keep trying */
      }
      busy = false;
    }, 350);
  });
  return main;
}
