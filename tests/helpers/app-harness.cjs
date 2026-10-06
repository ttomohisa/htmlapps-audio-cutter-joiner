const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');

function loadApp() {
  const filename = process.env.AUDIO_APP_HTML || path.join(__dirname, '../../src/index.template.html');
  let html = fs.readFileSync(filename, 'utf8');
  const payload = html.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
  if (payload) html = gunzipSync(Buffer.from(payload[1].replace(/\s/g, ''), 'base64')).toString('utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const urls = new Map(), revoked = [], downloads = [], errors = [], elements = new Map();
  let serial = 0, nextDecode = null;
  function element(tag = 'DIV') {
    const listeners = new Map();
    return { tagName: tag, style: {}, dataset: {}, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '', currentTime: 0, duration: 1, paused: true, readyState: 1,
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; },
      append() {}, replaceChildren() {}, remove() {}, load() {}, pause() { this.paused = true; }, async play() { this.paused = false; },
      addEventListener(type, fn) { listeners.set(type, fn); if (type === 'loadedmetadata') queueMicrotask(fn); }, removeEventListener() {},
      getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0 }; }, setPointerCapture() {}, releasePointerCapture() {},
      click() { if (this.disabled) return; if (tag === 'A') downloads.push({ href: this.href, download: this.download }); else return this.dispatch('click'); },
      dispatch(type, details = {}) { return listeners.get(type)?.({ target: this, preventDefault() {}, stopPropagation() {}, ...details }); }
    };
  }
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const el = element(match[1].toUpperCase()); el.disabled = /\sdisabled\b/.test(match[0]); elements.set(match[2], el);
  }
  const i18nElements = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(match => {
    const el = element(); el.dataset.i18n = match[1]; return el;
  });
  const document = { documentElement: {}, body: { append() {} }, getElementById(id) { return elements.get(id) || null; }, querySelectorAll(selector) { return selector === '[data-i18n]' ? i18nElements : []; }, addEventListener() {}, createElement(tag) { return element(tag.toUpperCase()); }, createTextNode(text) { return { textContent: text }; } };
  elements.get('app-config').textContent = JSON.stringify({ name: 'Audio Cutter & Joiner', nameJa: '音声カット・結合' });
  elements.get('outputFormatSelect').value = 'wav'; elements.get('bitrateSelect').value = '192'; elements.get('outputNameInput').value = 'synthetic';
  const channels = [Float32Array.from({ length: 44100 }, (_, i) => i < 22050 ? .25 : .5), Float32Array.from({ length: 44100 }, (_, i) => i < 22050 ? -.25 : -.5)];
  const decoded = { duration: 1, sampleRate: 44100, numberOfChannels: 2, length: 44100, getChannelData(c) { return channels[c]; } };
  const originalSamples = channels.map(c => Buffer.from(c.buffer).toString('hex'));
  class FakeAudioContext { async decodeAudioData() { const pending = nextDecode; nextDecode = null; return pending ? pending() : decoded; } async close() {} }
  const context = vm.createContext({ document, window: { AudioContext: FakeAudioContext, addEventListener() {} }, navigator: { language: 'en' }, localStorage: { getItem() { return null; }, setItem() {} }, innerWidth: 1024, devicePixelRatio: 1, crypto: { randomUUID: () => `id-${++serial}` }, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout(fn, delay) { if (delay === 0) queueMicrotask(fn); return 1; }, clearTimeout() {}, Blob, DOMException, Float32Array, Uint8Array, Int16Array, ArrayBuffer, DataView, console: { error(e) { errors.push(e); }, warn(e) { errors.push(e); } }, URL: { createObjectURL(value) { const url = `blob:synthetic-${++serial}`; urls.set(url, value); return url; }, revokeObjectURL(url) { revoked.push(url); urls.delete(url); } } });
  const expose = 'globalThis.app={state,els,I18N,addFiles,setTrimRange,splitAtPlayhead,undoLast,moveClip,reorderClip,removeClip,startExport,exportWav,downloadExport,totalKeptDuration,applyLanguage,selectClip,renderSelectedMeta,cancelExport,startSequence,buildAllSegments,buildJunctionSegments,segmentBounds,resetTrim:typeof resetTrim==="function"?resetTrim:null};';
  vm.runInContext(script.replace('  })();', expose + '\n  })();'), context, { filename });
  const app = context.app;
  function file(name = 'synthetic.wav') { return { name, type: 'audio/wav', size: 176444, async arrayBuffer() { return new ArrayBuffer(8); } }; }
  function seed(count = 1) {
    app.state.clips = Array.from({ length: count }, (_, i) => ({ id: `clip-${i}`, sourceId: `source-${i}`, file: file(`synthetic-${i}.wav`), sourceDuration: 1, baseStart: 0, baseEnd: 1, trimStart: 0, trimEnd: 1, sampleRate: 44100, channels: 2, peaks: [.5, 1], analysisError: null }));
    app.state.selectedId = 'clip-0'; app.renderSelectedMeta(); return app.state.clips;
  }
  function delayDecode() {
    let resolve, reject, started;
    const begun = new Promise(r => { started = r; });
    const pending = new Promise((r, j) => { resolve = r; reject = j; });
    nextDecode = () => { started(); return pending; };
    return { begun, resolve: () => resolve(decoded), reject };
  }
  return { app, html, filename, channels, originalSamples, seed, file, urls, revoked, downloads, errors, i18nElements, delayDecode };
}
module.exports = { loadApp };
