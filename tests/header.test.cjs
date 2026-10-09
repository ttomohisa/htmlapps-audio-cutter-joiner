const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app-harness.cjs');
const expected = {
  ja: { target: 'EN', action: '英語に切り替え', privacy: '完全ローカル処理', help: 'ヘルプ', close: '閉じる', waveform: '波形', play: '再生 / 一時停止', seek: '再生位置', stop: '停止' },
  en: { target: 'JA', action: 'Switch to Japanese', privacy: 'Fully local processing', help: 'Help', close: 'Close', waveform: 'Waveform', play: 'Play / pause', seek: 'Playback position', stop: 'Stop' }
};
function assertHeader(h, language) {
  const copy = expected[language], els = h.app.els;
  assert.equal(h.app.state.lang, language);
  assert.equal(els.languageLabel.textContent, copy.target);
  assert.equal(els.languageButton['aria-label'], copy.action);
  assert.equal(els.languageButton.title, copy.action);
  assert.ok(h.i18nElements.some(el => el.dataset.i18n === 'local' && el.textContent === copy.privacy));
}
for (const language of ['ja', 'en']) test(`header target and privacy on fresh ${language} load and repeated toggles`, () => {
  const h = loadApp({ language });
  assertHeader(h, language);
  for (let n = 0; n < 4; n++) { h.app.els.languageButton.click(); assertHeader(h, n % 2 ? language : language === 'ja' ? 'en' : 'ja'); }
});
test('header honors saved language and tolerates unavailable storage', () => {
  assertHeader(loadApp({ language: 'en', savedLanguage: 'ja' }), 'ja');
  assertHeader(loadApp({ language: 'ja', storageThrows: true }), 'ja');
});
test('visible version follows canonical config in source and each shipped representation', () => {
  const h = loadApp();
  assert.match(h.canonicalConfig.version, /^\d+\.\d+\.\d+$/);
  assert.equal(h.config.version, h.canonicalConfig.version);
  assert.ok(h.elements.get('versionBadge'), 'version badge has a stable runtime target');
  assert.equal(h.elements.get('versionBadge').textContent, `v${h.canonicalConfig.version}`);
  assert.match(h.html, new RegExp(`class="version-badge" id="versionBadge">v${h.canonicalConfig.version.replaceAll('.', '\\.')}<`));
});
test('help and audio control accessible labels follow the active language', () => {
  const h = loadApp();
  for (const language of ['ja', 'en', 'ja']) {
    h.app.applyLanguage(language); const copy = expected[language], els = h.app.els;
    assert.equal(els.helpButton.title, copy.help);
    assert.equal(els.helpClose.title, copy.close);
    assert.equal(els.helpClose['aria-label'], copy.close);
    for (const [id, key] of [['waveCanvas', 'waveform'], ['playButton', 'play'], ['seekRange', 'seek'], ['stopButton', 'stop']]) assert.equal(els[id]['aria-label'], copy[key], id);
  }
});
test('language toggles preserve selected clip, trim, output filename and valid WAV result', async () => {
  const h = loadApp(); const [clip] = h.seed(); h.app.setTrimRange(clip, .2, .8); await h.app.startExport();
  const result = h.app.state.exportResult, filename = h.app.els.outputNameInput.value;
  for (let n = 0; n < 4; n++) { h.app.els.languageButton.click(); assertHeader(h, n % 2 ? 'en' : 'ja'); }
  assert.equal(h.app.state.selectedId, clip.id); assert.equal(clip.trimStart, .2); assert.equal(clip.trimEnd, .8);
  assert.equal(h.app.state.exportResult, result); assert.equal(h.app.els.outputNameInput.value, filename);
  assert.equal(h.revoked.includes(result.url), false);
});

// Keep the supplied artwork, favicon, and header in sync across shipped representations.
test('app icon preserves the supplied SVG and canonical header/favicon artwork', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const icon = fs.readFileSync(path.join(__dirname, '../assets/favicon.svg'));
  assert.equal(crypto.createHash('sha256').update(icon).digest('hex'), '92933e28383d9413b48da97183fc7a7aededc8e708dea491c4c66cacc420e631');
  const html = loadApp().html;
  const favicon = html.match(/<link\b[^>]*rel="icon"[^>]*href="([^"]+)"/)[1];
  const expectedUri = 'data:image/svg+xml;base64,' + icon.toString('base64');
  assert.equal(favicon, expectedUri);
  const header = html.match(/<div class="brand-mark"[^>]*>\s*(<svg[\s\S]*?<\/svg>)/)[1];
  assert.equal(header, icon.toString('utf8').trim());
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Inline SVG IDs must not collide with page IDs');
  for (const match of header.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.includes(match[1]), `Missing inline SVG reference: ${match[1]}`);
  }
  assert.match(html, /\.brand-mark svg \{ width: 100%; height: 100%; display: block; \}/);
});
