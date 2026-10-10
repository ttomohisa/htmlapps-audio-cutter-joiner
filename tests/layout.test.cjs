const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app-harness.cjs');

// Structural CSS contracts complement the native wheel/Tab checks; this harness
// does not implement browser layout or prove on-screen focus visibility.
const style = () => loadApp().html.match(/<style>([\s\S]*?)<\/style>/)[1];
function declarations(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|[{}])\\s*${escaped}\\s*\\{([^{}]*)\\}`));
  assert.ok(match, `Missing CSS rule: ${selector}`);
  return Object.fromEntries(match[1].split(';').filter(value => value.trim()).map(value => {
    const colon = value.indexOf(':');
    return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
  }));
}
function media(css, condition) {
  const marker = `@media (${condition})`;
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, `Missing media query: ${condition}`);
  const open = css.indexOf('{', start);
  let depth = 1, end = open + 1;
  while (depth && end < css.length) { if (css[end] === '{') depth++; if (css[end] === '}') depth--; end++; }
  assert.equal(depth, 0, 'Media query is balanced');
  return css.slice(open + 1, end - 1);
}

test('only a modal dialog locks root and body background scrolling', () => {
  const css = style();
  assert.equal(declarations(css, 'html:has(dialog:modal), body:has(dialog:modal)').overflow, 'hidden');
  assert.notEqual(declarations(css, 'html').overflow, 'hidden');
  assert.notEqual(declarations(css, 'body').overflow, 'hidden');
});

test('Help shares its safe-area viewport height between fixed header and scrollable body', () => {
  const css = style();
  const dialog = declarations(css, '#helpDialog');
  assert.equal(dialog['max-height'], 'min(760px, calc(100dvh - 28px - env(safe-area-inset-top) - env(safe-area-inset-bottom)))');
  const open = declarations(css, '#helpDialog[open]');
  assert.equal(open.display, 'flex');
  assert.equal(open['flex-direction'], 'column');
  assert.equal(declarations(css, '#helpDialog > .dialog-header').flex, '0 0 auto');
  assert.equal(declarations(css, '#helpClose').flex, '0 0 auto');
  const body = declarations(css, '#helpDialog > .dialog-body');
  assert.equal(body.flex, '1 1 auto');
  assert.equal(body['min-height'], '0');
  assert.equal(body['max-height'], 'none');
  assert.equal(body.overflow, 'auto');
  assert.equal(body['overscroll-behavior'], 'contain');
  assert.doesNotMatch(css, /#helpDialog\s*\{[^}]*display\s*:\s*flex/, 'Closed Help must retain native hidden behavior');
});

test('narrow header wraps the title and version while utility actions stay unshrunk', () => {
  const narrow = media(style(), 'max-width: 420px');
  const title = declarations(narrow, '.brand-name');
  assert.equal(title.display, 'flex');
  assert.equal(title['flex-wrap'], 'wrap');
  assert.equal(title['white-space'], 'normal');
  assert.equal(title.overflow, 'visible');
  assert.equal(declarations(narrow, '.brand-name > [data-i18n="appName"]')['overflow-wrap'], 'anywhere');
  const badge = declarations(narrow, '.version-badge');
  assert.equal(badge.flex, '0 0 auto');
  assert.equal(badge['margin-left'], '0');
  assert.equal(badge['white-space'], 'nowrap');
  assert.equal(declarations(narrow, '.header-actions').flex, '0 0 auto');
});

test('mobile root reserves focus-scrolling room for sticky header and fixed tabs', () => {
  const css = style();
  const root = declarations(media(css, 'max-width: 720px'), 'html');
  assert.equal(root['scroll-padding-top'], 'calc(var(--header-height) + 12px)');
  assert.equal(root['scroll-padding-bottom'], 'calc(88px + env(safe-area-inset-bottom))');
  assert.equal(declarations(css, 'html')['scroll-padding-bottom'], undefined, 'Desktop scroll geometry stays unchanged');
});

test('local-processing badge uses a decorative shield without changing its bilingual claim', () => {
  const h = loadApp();
  const badge = h.html.match(/<div class="local-badge">([\s\S]*?)<\/div>/)[1];
  assert.match(badge, /<svg\b[^>]*aria-hidden="true"[^>]*focusable="false"[^>]*><use href="#i-shield"\s*\/>/);
  const shield = h.html.match(/<symbol id="i-shield" viewBox="0 0 24 24">([\s\S]*?)<\/symbol>/)?.[1];
  assert.equal(shield, '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-5"/>', 'Use the canonical PDF Fill & Sign local-processing shield');
  assert.doesNotMatch(badge, /#i-lock/);
  assert.equal(h.app.I18N.ja.local, '完全ローカル処理');
  assert.equal(h.app.I18N.en.local, 'Fully local processing');
});

test('Help explains its independent scrolling in both languages', () => {
  const h = loadApp();
  assert.match(h.html, /<p data-i18n="helpScroll">[^<]+<\/p>/);
  for (const language of ['ja', 'en']) {
    h.app.applyLanguage(language);
    const text = h.i18nElements.find(el => el.dataset.i18n === 'helpScroll')?.textContent;
    assert.ok(text && text !== 'helpScroll', `Help scroll guidance is translated: ${language}`);
    assert.equal(text, h.app.I18N[language].helpScroll);
  }
  assert.notEqual(h.app.I18N.ja.helpScroll, h.app.I18N.en.helpScroll);
});

test('canonical repository check includes layout regressions for every shipped representation', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const check = fs.readFileSync(path.join(__dirname, '../scripts/check-repository.ps1'), 'utf8');
  const loop = check.match(/foreach \(\$testPath in \$testPaths\) \{([\s\S]*?)\n  \}/)[1];
  assert.ok(loop.includes('$env:AUDIO_APP_HTML = $testPath'));
  assert.ok(loop.includes('tests\\layout.test.cjs'), 'New layout checks must execute for each representation');
  assert.ok(check.includes('src\\index.template.html'));
  assert.ok(check.includes('$rootHtml, $dist'));
  assert.ok(check.includes('$config.build.selfExtract.output'));
});
