const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');

function loadApp({ language = 'en', savedLanguage = null, storageThrows = false, width = 1024 } = {}) {
  const filename = process.env.AUDIO_APP_HTML || path.join(__dirname, '../../src/index.template.html');
  let html = fs.readFileSync(filename, 'utf8');
  const payload = html.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
  if (payload) html = gunzipSync(Buffer.from(payload[1].replace(/\s/g, ''), 'base64')).toString('utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const urls = new Map(), revoked = [], downloads = [], errors = [], elements = new Map();
  let serial = 0, nextDecode = null, nextMetadata = null, document;
  // A deliberately small DOM boundary: tree connectivity, hidden/mobile panes,
  // focus and the original bubbling path. It does not model browser layout.
  function element(tag = 'DIV') {
    const listeners = new Map(), classes = new Set();
    const el = { tagName: tag, style: {}, dataset: {}, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '', currentTime: 0, duration: 1, paused: true, readyState: 1, children: [], parentElement: null,
      get isConnected() { return this === document?.body || !!this.parentElement?.isConnected; },
      get className() { return [...classes].join(' '); }, set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
      classList: { add(...values) { values.forEach(c => classes.add(c)); }, remove(...values) { values.forEach(c => classes.delete(c)); }, contains(value) { return classes.has(value); }, toggle(value, force) { const add = force ?? !classes.has(value); if (add) classes.add(value); else classes.delete(value); return add; } },
      setAttribute(k, v) { if (k === 'class') this.className = v; else if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v; else this[k] = v; },
      getAttribute(k) { if (k === 'class') return this.className; if (k.startsWith('data-')) return this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ?? null; return this[k] ?? null; },
      removeAttribute(k) { delete this[k]; },
      contains(node) { return node === this || this.children.some(child => child.contains(node)); },
      append(...nodes) { for (const node of nodes) { if (node.parentElement) node.remove(); node.parentElement = this; this.children.push(node); } },
      replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this.append(...nodes); },
      remove() { if (this.contains(document?.activeElement)) document.activeElement = document.body; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; },
      matches(selector) { return selector.split(',').some(part => { let simple = part.trim(); if (simple === ':modal') return tag === 'DIALOG' && this.open; const attrs = [...simple.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)]; simple = simple.replace(/\[[^\]]+\]/g, ''); if (attrs.some(([, name, value]) => value === undefined ? this.getAttribute(name) === null || this.getAttribute(name) === false : this.getAttribute(name) !== value)) return false; const parts = simple.split('.'); return (!parts[0] || parts[0].toUpperCase() === tag) && parts.slice(1).every(c => classes.has(c)); }); },
      closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; },
      querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      getClientRects() { for (let node = this; node; node = node.parentElement) { if (node.hidden || (node.tagName === 'DIALOG' && !node.open) || (width <= 720 && node.dataset.mobilePage && !node.classList.contains('is-mobile-active')) || (width > 720 && node.classList.contains('mobile-tabs'))) return []; } return this.isConnected ? [{ width: 100, height: 30 }] : []; },
      focus() { if (!this.disabled && this.getClientRects().length && (!document.querySelector('dialog[open]') || document.querySelector('dialog[open]').contains(this))) { document.activeElement = this; this.dispatch('focusin'); } },
      blur() { if (document.activeElement === this) document.activeElement = document.body; },
      showModal() { this.open = true; this.querySelector('button')?.focus(); }, close() { this.open = false; document.activeElement = document.body; },
      load() {}, pause() { this.paused = true; }, async play() { this.paused = false; },
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); if (type === 'loadedmetadata') { if (nextMetadata) { const pending = nextMetadata; nextMetadata = null; pending(fn); } else queueMicrotask(fn); } },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0 }; }, setPointerCapture() {}, releasePointerCapture() {},
      click() { if (this.disabled) return; if (tag === 'A') downloads.push({ href: this.href, download: this.download }); else return this.dispatch('click'); },
      dispatch(type, details = {}) {
        const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...details };
        const path = []; for (let node = this; node; node = node.parentElement) path.push(node);
        if (this.isConnected) path.push(document);
        const results = [];
        for (const node of path) { event.currentTarget = node; for (const fn of node._listeners?.get(type) || []) { const result = fn(event); if (result?.then) results.push(result); } if (event.stopped) break; }
        this.lastEvent = event;
        return results.length ? Promise.all(results) : undefined;
      },
      _listeners: listeners
    };
    return el;
  }
  const body = element('BODY'), documentListeners = new Map();
  let activeElement = body;
  document = { documentElement: {}, body,
    get activeElement() { if (activeElement !== body && !activeElement.getClientRects().length) activeElement = body; return activeElement; }, set activeElement(value) { activeElement = value; }, _listeners: documentListeners,
    getElementById(id) { return elements.get(id) || null; }, querySelectorAll(selector) { return body.querySelectorAll(selector); }, querySelector(selector) { return body.querySelector(selector); },
    addEventListener(type, fn) { if (!documentListeners.has(type)) documentListeners.set(type, new Set()); documentListeners.get(type).add(fn); }, createElement(tag) { return element(tag.toUpperCase()); }, createTextNode(text) { const node = element('#TEXT'); node.textContent = text; return node; }
  };
  const markup = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, match => match.slice(0, match.indexOf('>') + 1) + '</script>');
  const stack = [body], voidTags = new Set(['INPUT', 'IMG', 'BR', 'HR', 'META', 'LINK', 'SOURCE', 'USE', 'PATH']);
  for (const match of markup.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const tag = match[1].toUpperCase();
    if (match[0].startsWith('</')) { const index = stack.map(node => node.tagName).lastIndexOf(tag); if (index > 0) stack.length = index; continue; }
    const el = element(tag); for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(attr[1], attr[2]);
    el.disabled = /\sdisabled\b/.test(match[0]); el.hidden = /\shidden\b/.test(match[0]);
    if (el.id) elements.set(el.id, el); stack.at(-1).append(el);
    if (!voidTags.has(tag) && !match[0].endsWith('/>')) stack.push(el);
  }
  const i18nElements = document.querySelectorAll('[data-i18n]');
  const canonicalConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../app.config.json'), 'utf8'));
  const embeddedConfig = html.match(/<script type="application\/json" id="app-config">([\s\S]*?)<\/script>/)[1];
  const config = embeddedConfig === '__APP_CONFIG_JSON__' ? canonicalConfig : JSON.parse(embeddedConfig);
  elements.get('app-config').textContent = JSON.stringify(config);
  elements.get('outputFormatSelect').value = 'wav'; elements.get('bitrateSelect').value = '192'; elements.get('outputNameInput').value = 'synthetic';
  const channels = [Float32Array.from({ length: 44100 }, (_, i) => i < 22050 ? .25 : .5), Float32Array.from({ length: 44100 }, (_, i) => i < 22050 ? -.25 : -.5)];
  const decoded = { duration: 1, sampleRate: 44100, numberOfChannels: 2, length: 44100, getChannelData(c) { return channels[c]; } };
  const originalSamples = channels.map(c => Buffer.from(c.buffer).toString('hex'));
  class FakeAudioContext { async decodeAudioData() { const pending = nextDecode; nextDecode = null; return pending ? pending() : decoded; } async close() {} }
  const context = vm.createContext({ document, window: { AudioContext: FakeAudioContext, addEventListener() {} }, navigator: { language }, localStorage: { getItem() { if (storageThrows) throw new Error('storage unavailable'); return savedLanguage; }, setItem() { if (storageThrows) throw new Error('storage unavailable'); } }, innerWidth: width, devicePixelRatio: 1, crypto: { randomUUID: () => `id-${++serial}` }, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout(fn, delay) { if (delay === 0) queueMicrotask(fn); return 1; }, clearTimeout() {}, Blob, DOMException, Float32Array, Uint8Array, Int16Array, ArrayBuffer, DataView, console: { error(e) { errors.push(e); }, warn(e) { errors.push(e); } }, URL: { createObjectURL(value) { const url = `blob:synthetic-${++serial}`; urls.set(url, value); return url; }, revokeObjectURL(url) { revoked.push(url); urls.delete(url); } } });
  const expose = 'globalThis.app={state,els,I18N,renderClips,setMobilePage,addFiles,setTrimRange,splitAtPlayhead,undoLast,moveClip,reorderClip,removeClip,startExport,exportWav,downloadExport,totalKeptDuration,applyLanguage,selectClip,renderSelectedMeta,cancelExport,startSequence,buildAllSegments,buildJunctionSegments,segmentBounds,resetTrim:typeof resetTrim==="function"?resetTrim:null};';
  vm.runInContext(script.replace('  })();', expose + '\n  })();'), context, { filename });
  const app = context.app;
  function file(name = 'synthetic.wav') { return { name, type: 'audio/wav', size: 176444, async arrayBuffer() { return new ArrayBuffer(8); } }; }
  function seed(count = 1) {
    app.state.clips = Array.from({ length: count }, (_, i) => ({ id: `clip-${i}`, sourceId: `source-${i}`, file: file(`synthetic-${i}.wav`), sourceDuration: 1, baseStart: 0, baseEnd: 1, trimStart: 0, trimEnd: 1, sampleRate: 44100, channels: 2, peaks: [.5, 1], analysisError: null }));
    app.state.selectedId = 'clip-0'; app.renderClips(); app.renderSelectedMeta(); return app.state.clips;
  }
  function delayDecode() {
    let resolve, reject, started;
    const begun = new Promise(r => { started = r; });
    const pending = new Promise((r, j) => { resolve = r; reject = j; });
    nextDecode = () => { started(); return pending; };
    return { begun, resolve: () => resolve(decoded), reject };
  }
  function delayMetadata() {
    let resolve, started; const begun = new Promise(r => { started = r; });
    nextMetadata = fn => { resolve = () => queueMicrotask(fn); started(); };
    return { begun, resolve: () => resolve() };
  }
  async function press(el, key) {
    await el.dispatch('keydown', { key, code: key === ' ' ? 'Space' : key });
    const cancelled = el.lastEvent.defaultPrevented;
    await el.dispatch('keyup', { key, code: key === ' ' ? 'Space' : key });
    if (!cancelled && el.tagName === 'BUTTON' && (key === 'Enter' || key === ' ')) await el.click();
  }
  return { document, press, delayMetadata, app, html, filename, config, canonicalConfig, elements, channels, originalSamples, seed, file, urls, revoked, downloads, errors, i18nElements, delayDecode };
}
module.exports = { loadApp };
