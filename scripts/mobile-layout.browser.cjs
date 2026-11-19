'use strict';
// Native Chromium checks run only in the existing unprivileged PR build job.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const PHONE_WIDTH = 720;
const HELP = "#helpButton", LANGUAGE = "#languageButton", CLOSE = "#helpClose";
const artifacts = path.resolve('test-results/mobile-layout');

async function exerciseActions(page, width, label) {
  if (width <= PHONE_WIDTH) {
    assert.equal(await page.locator('.mobile-tabs').isVisible(), true, label + ': editing navigation');
    assert.equal(await page.locator('.mobile-tabs button:visible').count(), 3, label + ': all mobile tabs');
  }
}

function syntheticWav() {
  const frames = 22050, sampleRate = 44100, out = Buffer.alloc(44 + frames * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + frames * 2, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) out.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / sampleRate) * 8000), 44 + i * 2);
  return out;
}

async function verifyNativeWavRoundTrip(page, label, width) {
  await page.locator('#fileInput').setInputFiles({ name: 'test-tone.wav', mimeType: 'audio/wav', buffer: syntheticWav() });
  await page.locator('#editorShell').waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await page.locator('#pageIntro').isVisible(), width > PHONE_WIDTH, label + ': intro after file import');
  if (width <= PHONE_WIDTH) await page.locator('.mobile-tab[data-page-target="export"]').click();
  await page.locator('#outputFormatSelect').selectOption('wav');
  await page.locator('#exportButton').click();
  await page.locator('#exportResult').waitFor({ state: 'visible', timeout: 20000 });
  const downloading = page.waitForEvent('download');
  await page.locator('#downloadButton').click();
  const download = await downloading;
  assert.match(download.suggestedFilename(), /\.wav$/, label + ': saved WAV name');
  const savedPath = await download.path();
  const bytes = fs.readFileSync(savedPath);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', label + ': WAV RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE', label + ': WAV container');
  assert.ok(bytes.length > 44, label + ': WAV contains audio samples');
  assert.equal(bytes.readUInt32LE(40), bytes.length - 44, label + ': valid PCM payload length');
  if (width <= PHONE_WIDTH) {
    await page.locator('.mobile-tab[data-page-target="clips"]').click();
    await page.locator('.clip-action.remove').first().click();
    assert.equal(await page.locator('#pageIntro').isVisible(), true, label + ': intro restored after removing final clip');
  }
}

async function main() {
  fs.mkdirSync(artifacts, {recursive:true});
  const browser = await chromium.launch();
  try {
    const cases = [];
    for (const language of ['ja', 'en']) {
      for (const [width, height] of [[1360,900], [PHONE_WIDTH + 1,568], [PHONE_WIDTH,568], [320,568], [393,252]]) cases.push({file:'dist/index.html', language, width, height});
    }
    // Also load the compressed and root download variants, without duplicating the full matrix.
    cases.push({file:'dist/index.self-extract.html', language:'en', width:360, height:640});
    cases.push({file:'audio-cutter-joiner.html', language:'ja', width:1360, height:900});
    for (const {file, language, width, height} of cases) {
      const context = await browser.newContext({viewport:{width,height}, locale:language, reducedMotion:'reduce', acceptDownloads:true});
      const page = await context.newPage();
      const errors = [], requests = [];
      const label = `${file} ${language} ${width}x${height}`;
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
      try {
        await page.goto(pathToFileURL(path.resolve(file)).href);
        await page.locator(HELP).waitFor();
        if (await page.locator('html').getAttribute('lang') !== language) await page.locator(LANGUAGE).click();
        assert.equal((await page.locator('[data-i18n="local"]').textContent()).trim(), language === 'en' ? 'Fully local processing' : '完全ローカル処理', label + ': privacy wording');
        assert.equal(await page.locator('body > footer').isVisible(), width > PHONE_WIDTH, label + ': informational footer breakpoint');
        assert.equal(await page.locator('#heroTitle').isVisible(), width > PHONE_WIDTH, label + ': hero title visible on desktop only');
        assert.equal(await page.locator('#pageIntro').isVisible(), true, label + ': intro description available before import');
        await exerciseActions(page, width, label);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + ': page width');
        // Responsive changes must not leave the informational footer in a stale state.
        await page.setViewportSize({width:PHONE_WIDTH + 1, height});
        assert.equal(await page.locator('body > footer').isVisible(), true, label + ': wider resize');
        await page.setViewportSize({width:PHONE_WIDTH, height});
        assert.equal(await page.locator('body > footer').isVisible(), false, label + ': phone resize');
        await page.setViewportSize({width,height});
        if (file === 'dist/index.html' && [1360,320].includes(width)) await page.screenshot({path:path.join(artifacts, `${language}-${width}.png`), fullPage:true});

        if (file === 'dist/index.html' && ((language === 'ja' && width === 1360) || (language === 'en' && width === 320))) {
          await verifyNativeWavRoundTrip(page, label, width);
        }

        await page.locator(HELP).click();
        const body = page.locator('#helpDialog .dialog-body');
        await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
        const finalItem = page.locator('#helpDialog .dialog-body p:visible, #helpDialog .dialog-body li:visible').last();
        const finalBox = await finalItem.boundingBox(), bodyBox = await body.boundingBox();
        assert.ok(finalBox && bodyBox && finalBox.y >= bodyBox.y - 1 && finalBox.y + finalBox.height <= bodyBox.y + bodyBox.height + 1, label + ': final Help guidance reachable');
        assert.ok(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1), label + ': Help width');
        const header = await page.locator('#helpDialog .dialog-head, #helpDialog .dialog-header').boundingBox();
        assert.ok(header && header.y >= 0 && header.y + header.height <= height, label + ': Help header visible');
        const beforeScroll = await page.evaluate(() => scrollY);
        await page.mouse.move(2, Math.floor(height / 2));
        await page.mouse.wheel(0,400);
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => scrollY), beforeScroll, label + ': modal background locked');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#helpDialog').isVisible(), false, label + ': Escape closes Help');
        await page.locator(HELP).click();
        await page.locator('#helpDialog').locator(CLOSE).first().click();
        assert.equal(await page.locator('#helpDialog').isVisible(), false, label + ': Help reopens and closes');
        assert.deepEqual(errors, [], label + ': console errors');
        assert.deepEqual(requests, [], label + ': no external runtime requests');
        console.log('PASS ' + label);
      } catch (error) {
        await page.screenshot({path:path.join(artifacts,'failure.png'), fullPage:true}).catch(() => {});
        throw new Error(label + ': ' + error.message, {cause:error});
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
