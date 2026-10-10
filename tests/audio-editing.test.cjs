const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app-harness.cjs');
const reset = h => { assert.ok(h.app.els.resetTrimButton, 'Reset trim control exists'); return h.app.els.resetTrimButton.click(); };
const range = clip => [clip.trimStart, clip.trimEnd];
const samplesUnchanged = h => h.channels.forEach((c, i) => assert.equal(Buffer.from(c.buffer).toString('hex'), h.originalSamples[i]));
async function exported(h) { await h.app.startExport(); assert.ok(h.app.state.exportResult, 'export succeeded'); return h.app.state.exportResult; }
function cleared(h, result) { assert.equal(h.app.state.exportResult, null); assert.equal(h.app.els.exportResult.hidden, true); assert.ok(h.revoked.includes(result.url)); h.app.downloadExport(); assert.equal(h.downloads.length, 0); }

// These execute production handlers and WAV writing. DOM, media playback and decoding are doubles.
test('reset restores only selected clip exact base bounds and can be undone once', async () => {
  const h = loadApp(), clips = h.seed(2), clip = clips[0]; h.app.setTrimRange(clip, .25, .75);
  const file = clip.file, peaks = clip.peaks, ids = clips.map(c => c.id), sourceId = clip.sourceId;
  const before = await exported(h); h.app.state.sequencePlaying = true; h.app.els.sequenceAudio.paused = false; h.app.els.audio.paused = false;
  reset(h); assert.deepEqual(range(clip), [0, 1]); assert.equal(h.app.state.sequencePlaying, false); assert.equal(h.app.els.sequenceAudio.paused, true); assert.equal(h.app.els.audio.paused, true);
  assert.equal(h.app.state.selectedId, clip.id); assert.equal(clip.sourceId, sourceId); assert.equal(clip.file, file); assert.equal(clip.peaks, peaks); assert.deepEqual(clips.map(c => c.id), ids); assert.deepEqual(range(clips[1]), [0, 1]); cleared(h, before);
  assert.equal(h.app.els.toastAction.hidden, false); await h.app.undoLast(); assert.deepEqual(range(clip), [.25, .75]); assert.equal(h.app.state.undo, null); samplesUnchanged(h);
});
test('reset split fragment never expands to the whole source', async () => {
  const h = loadApp(); const [source] = h.seed(); h.app.els.audio.currentTime = .5; await h.app.splitAtPlayhead();
  const right = h.app.state.clips[1]; h.app.setTrimRange(right, .6, .9); reset(h);
  assert.deepEqual(range(right), [.5, 1]); assert.equal(right.file, source.file); assert.equal(right.peaks, source.peaks); assert.deepEqual(range(h.app.state.clips[0]), [0, .5]);
  await h.app.undoLast(); assert.deepEqual(range(right), [.6, .9]);
});
test('reset restores submillisecond source bounds without trim tolerance', () => {
  const h = loadApp(), [clip] = h.seed(); clip.baseStart = .10001; clip.baseEnd = .90009; clip.trimStart = .10002; clip.trimEnd = .90008; h.app.renderSelectedMeta(); reset(h); assert.deepEqual(range(clip), [.10001, .90009]);
});
test('repeated and untrimmed reset retain Undo and valid output', async () => {
  const h = loadApp(), [clip] = h.seed(); h.app.setTrimRange(clip, .25, .75); reset(h); const undo = h.app.state.undo; const result = await exported(h);
  assert.equal(h.app.els.resetTrimButton.disabled, true); reset(h); h.app.resetTrim(); assert.equal(h.app.state.undo, undo); assert.equal(h.app.state.exportResult, result); assert.equal(h.revoked.includes(result.url), false);
});
test('missing selection or unknown bounds disable reset without changing Undo', () => {
  const h = loadApp(); assert.ok(h.app.els.resetTrimButton); assert.equal(h.app.els.resetTrimButton.disabled, true);
  const [clip] = h.seed(); clip.sourceDuration = NaN; clip.baseEnd = NaN; clip.trimEnd = NaN; const undo = { sentinel: true }; h.app.state.undo = undo; h.app.renderSelectedMeta(); assert.equal(h.app.els.resetTrimButton.disabled, true); h.app.resetTrim(); assert.equal(h.app.state.undo, undo); assert.ok(Number.isNaN(clip.baseEnd));
});
test('reset labels and fragment guidance are present in both languages', () => {
  const h = loadApp(); for (const [lang, label, fragment] of [['en', 'Reset trim', 'fragment'], ['ja', '範囲をリセット', '分割']]) { h.app.applyLanguage(lang); assert.equal(h.app.I18N[lang].resetTrim, label); assert.ok(h.app.I18N[lang].resetTrimHelp.includes(fragment)); assert.ok(h.i18nElements.some(el => el.dataset.i18n === 'resetTrimHelp' && el.textContent === h.app.I18N[lang].resetTrimHelp)); }
});
test('valid import revokes old WAV and fresh output includes both clips', async () => {
  const h = loadApp(); h.seed(); const old = await exported(h); assert.equal(old.blob.size, 176444);
  await h.app.addFiles([h.file('added.wav')]); await h.app.selectClip(h.app.state.clips[1].id); cleared(h, old);
  const fresh = await exported(h); assert.equal(fresh.duration, 2); assert.equal(fresh.blob.size, 352844); const view = new DataView(await fresh.blob.arrayBuffer()); assert.equal(view.getUint32(40, true), 352800); samplesUnchanged(h);
});
test('rejected import, empty import, selection, language and no-op edits preserve export', async () => {
  const h = loadApp(); h.seed(2); const old = await exported(h); await h.app.addFiles([{ name: 'no.txt', type: 'text/plain' }]); await h.app.addFiles([]); await h.app.selectClip('clip-1'); h.app.applyLanguage('ja'); h.app.setTrimRange(h.app.state.clips[1], 0, 1); h.app.moveClip('clip-0', -1); h.app.reorderClip('clip-0', 'clip-1', false); await h.app.undoLast(); assert.equal(h.app.state.exportResult, old); assert.equal(h.revoked.includes(old.url), false);
});
for (const action of ['trim', 'split', 'delete', 'reorder']) test(`successful ${action} Undo invalidates output (source-level history case)`, async () => {
  const h = loadApp(); h.seed(action === 'trim' || action === 'split' ? 1 : 2);
  if (action === 'trim') h.app.setTrimRange(h.app.state.clips[0], .25, .75);
  if (action === 'split') { h.app.els.audio.currentTime = .5; await h.app.splitAtPlayhead(); }
  if (action === 'delete') h.app.removeClip('clip-1');
  if (action === 'reorder') h.app.moveClip('clip-1', -1);
  const old = await exported(h); await h.app.undoLast(); cleared(h, old); assert.equal(h.app.state.undo, null);
});
for (const action of ['import', 'trim', 'reset', 'delete', 'reorder', 'undo', 'drag']) test(`mutation during pending export discards obsolete ${action} result and permits retry`, async () => {
  const h = loadApp(); const [clip] = h.seed(2); h.app.setTrimRange(clip, .25, .75);
  const gate = h.delayDecode(), pending = h.app.startExport(); await gate.begun;
  if (action === 'import') await h.app.addFiles([h.file('extra.wav')]);
  if (action === 'trim') h.app.setTrimRange(clip, .1, .9);
  if (action === 'reset') reset(h);
  if (action === 'delete') h.app.removeClip('clip-1');
  if (action === 'reorder') h.app.moveClip('clip-1', -1);
  if (action === 'undo') await h.app.undoLast();
  if (action === 'drag') { h.app.state.dragHandle = 'start'; h.app.els.waveCanvas.getBoundingClientRect = () => ({ width: 100, height: 0, left: 0 }); h.app.els.waveCanvas.dispatch('pointermove', { clientX: 10 }); }
  gate.resolve(); await pending; assert.equal(h.app.state.exportResult, null); assert.equal(h.app.state.exporting, false); assert.equal(h.app.els.exportProgress.hidden, true); assert.equal(h.app.els.exportError.hidden, true); assert.equal(h.errors.length, 0); await exported(h); samplesUnchanged(h);
});
test('rejected import during pending export does not cancel valid output', async () => {
  const h = loadApp(); h.seed(); const gate = h.delayDecode(), pending = h.app.startExport(); await gate.begun; await h.app.addFiles([]); gate.resolve(); await pending; assert.ok(h.app.state.exportResult);
});
test('cancelled export stays discarded when decoder finishes; retry succeeds', async () => {
  const h = loadApp(); h.seed(); const gate = h.delayDecode(), pending = h.app.startExport(); await gate.begun; h.app.cancelExport(); gate.resolve(); await pending; assert.equal(h.app.state.exportResult, null); assert.equal(h.app.state.exporting, false); assert.equal(h.app.els.exportError.hidden, true); await exported(h);
});
test('decoder error is shown and subsequent export can succeed', async () => {
  const h = loadApp(); h.seed(); const gate = h.delayDecode(), pending = h.app.startExport(); await gate.begun; gate.reject(new Error('synthetic decode failure')); await pending; assert.equal(h.app.state.exportResult, null); assert.equal(h.app.els.exportError.hidden, false); assert.match(h.app.els.exportError.textContent, /synthetic decode failure/); await exported(h); assert.equal(h.app.els.exportError.hidden, true);
});
test('real WAV bytes reflect trim and reset while original channel samples stay untouched', async () => {
  const h = loadApp(), [clip] = h.seed(); h.app.setTrimRange(clip, .25, .75); const trimmed = await exported(h); assert.equal(trimmed.blob.size, 88244);
  reset(h); const full = await exported(h); const b = Buffer.from(await full.blob.arrayBuffer()); assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WAVE'); assert.equal(b.readUInt16LE(22), 2); assert.equal(b.readUInt32LE(24), 44100); assert.equal(b.readUInt16LE(34), 16); assert.equal(b.readInt16LE(44), 8192); assert.equal(b.readInt16LE(46), -8192); assert.equal(b.readInt16LE(44 + 22050 * 4), 16384); assert.equal(b.readInt16LE(46 + 22050 * 4), -16384); samplesUnchanged(h);
});
test('sequence and junction preview boundaries continue to respect kept ranges', async () => {
  const h = loadApp(); const [a, b] = h.seed(2); h.app.setTrimRange(a, .1, .7); h.app.setTrimRange(b, .2, .9);
  const segments = h.app.buildJunctionSegments(); assert.equal(segments.length, 2); assert.deepEqual({ ...h.app.segmentBounds(segments[0], a) }, { start: .1, end: .7 }); assert.deepEqual({ ...h.app.segmentBounds(segments[1], b) }, { start: .2, end: .9 });
  await h.app.startSequence(h.app.buildAllSegments(), 'all'); assert.equal(h.app.state.sequencePlaying, true); assert.equal(h.app.els.sequenceAudio.currentTime, .1); reset(h); assert.equal(h.app.state.sequencePlaying, false);
});
test('M4A remains disabled without WebCodecs and WAV remains available', () => {
  const h = loadApp(); h.seed(); h.app.els.outputFormatSelect.value = 'm4a'; h.app.els.outputFormatSelect.dispatch('change'); assert.equal(h.app.state.m4aSupported, false); assert.equal(h.app.els.exportButton.disabled, true); h.app.els.outputFormatSelect.value = 'wav'; h.app.els.outputFormatSelect.dispatch('change'); assert.equal(h.app.els.exportButton.disabled, false);
});
test('reset during export keeps its Undo action available after cancellation', async () => {
  const h = loadApp(), [clip] = h.seed(); h.app.setTrimRange(clip, .25, .75); const gate = h.delayDecode(), pending = h.app.startExport(); await gate.begun; reset(h); gate.resolve(); await pending;
  assert.equal(h.app.els.toastAction.hidden, false); await h.app.els.toastAction.click(); assert.deepEqual(range(clip), [.25, .75]);
});

// Production handlers run against a tree/focus/event-path double. Native browser
// Tab, rendered visibility, scrolling, media decoding and playback remain manual checks.
const rows = h => h.app.els.clipList.children;
const row = (h, id) => rows(h).find(item => item.dataset.id === id);
const action = (h, id, name) => name === 'row' ? row(h, id) : row(h, id).querySelectorAll('button')[{ grip: 0, up: 1, down: 2, remove: 3 }[name]];
const order = h => Array.from(h.app.state.clips, clip => clip.id);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function assertFocus(h, id, name) { assert.ok(h.document.activeElement === action(h, id, name), `${id} ${name} owns focus`); assert.ok(h.document.activeElement.isConnected); assert.ok(h.document.activeElement.getClientRects().length); assert.equal(h.document.activeElement.disabled, false); }
function activate(h, id, name) { const button = action(h, id, name); button.focus(); return button.click(); }

for (const key of ['Enter', ' ']) test(`nested Move up keeps native ${JSON.stringify(key)} activation instead of selecting the row`, async () => {
  const h = loadApp(); h.seed(3); const button = action(h, 'clip-2', 'up'); button.focus();
  await h.press(button, key); assert.deepEqual(order(h), ['clip-0', 'clip-2', 'clip-1']); assert.equal(h.app.state.selectedId, 'clip-0'); assertFocus(h, 'clip-2', 'up');
});
test('row Enter still selects its own clip and retains the row across asynchronous rendering', async () => {
  const h = loadApp(); h.seed(2); const item = row(h, 'clip-1'); item.focus(); await h.press(item, 'Enter'); await flush();
  assert.equal(h.app.state.selectedId, 'clip-1'); assertFocus(h, 'clip-1', 'row');
});
test('pointer Move down retains the logical action on the moved clip', () => {
  const h = loadApp(); const clips = h.seed(3), files = clips.map(c => c.file), peaks = clips.map(c => c.peaks);
  activate(h, 'clip-0', 'down'); assert.deepEqual(order(h), ['clip-1', 'clip-0', 'clip-2']); assertFocus(h, 'clip-0', 'down');
  for (const clip of h.app.state.clips) { const index = Number(clip.id.slice(-1)); assert.equal(clip.file, files[index]); assert.equal(clip.peaks, peaks[index]); }
});
for (const [id, name] of [['clip-1', 'up'], ['clip-1', 'down']]) test(`moving ${name} to a boundary uses a focusable same-row fallback`, () => {
  const h = loadApp(); h.seed(3); activate(h, id, name); assertFocus(h, id, 'row');
});
test('drag reorder preserves its focused grip by clip identity', () => {
  const h = loadApp(); h.seed(3); action(h, 'clip-2', 'grip').focus(); h.app.reorderClip('clip-2', 'clip-0', false); assertFocus(h, 'clip-2', 'grip');
});
test('ordinary rerenders retain the logical action without moving an unrelated focus owner', () => {
  const h = loadApp(); h.seed(3); action(h, 'clip-1', 'remove').focus(); h.app.applyLanguage('ja'); assertFocus(h, 'clip-1', 'remove');
  h.app.els.outputNameInput.focus(); h.app.renderClips(); assert.equal(h.document.activeElement, h.app.els.outputNameInput);
});
test('Remove moves focus to the next surviving logical row action', async () => {
  const h = loadApp(); h.seed(3); activate(h, 'clip-1', 'remove'); await flush(); assert.deepEqual(order(h), ['clip-0', 'clip-2']); assertFocus(h, 'clip-2', 'remove');
});
test('removing the selected last row retains its previous neighbor through async selection', async () => {
  const h = loadApp(); h.seed(2); await h.app.selectClip('clip-1'); activate(h, 'clip-1', 'remove'); await flush();
  assert.equal(h.app.state.selectedId, 'clip-0'); assertFocus(h, 'clip-0', 'remove');
});
test('removing the only clip focuses the visible empty-state picker', async () => {
  const h = loadApp(); h.seed(); activate(h, 'clip-0', 'remove'); await flush(); assert.ok(h.document.activeElement === h.app.els.fileInput, 'empty-state picker owns focus'); assert.ok(h.document.activeElement.getClientRects().length);
});
test('Undo from its toast restores the deleted clip action after asynchronous selection', async () => {
  const h = loadApp(); h.seed(2); activate(h, 'clip-1', 'remove'); h.app.els.toastAction.focus(); await h.app.els.toastAction.click();
  assert.deepEqual(order(h), ['clip-0', 'clip-1']); assertFocus(h, 'clip-1', 'remove'); assert.equal(h.app.state.undo, null);
});
test('reorder Undo restores the original logical action even after a disabled boundary fallback', async () => {
  const h = loadApp(); h.seed(2); activate(h, 'clip-1', 'up'); h.app.els.toastAction.focus(); await h.app.els.toastAction.click();
  assert.deepEqual(order(h), ['clip-0', 'clip-1']); assertFocus(h, 'clip-1', 'up');
});
test('no-op reorder leaves focus, Undo and export ownership unchanged', async () => {
  const h = loadApp(); h.seed(2); action(h, 'clip-0', 'remove').focus(); const before = h.document.activeElement; const undo = { sentinel: true }; h.app.state.undo = undo;
  await h.app.startExport(); const result = h.app.state.exportResult; h.app.moveClip('clip-0', -1); h.app.reorderClip('clip-0', 'clip-1', false);
  assert.equal(h.document.activeElement, before); assert.equal(h.app.state.undo, undo); assert.equal(h.app.state.exportResult, result);
});
test('mobile reorder stays in Clips and retains its action', () => {
  const h = loadApp({ width: 320 }); h.seed(3); activate(h, 'clip-0', 'down'); assert.equal(h.app.state.mobilePage, 'clips'); assertFocus(h, 'clip-0', 'down');
});
test('mobile removal preserves existing Edit navigation and uses the visible current tab', async () => {
  const h = loadApp({ width: 320 }); h.seed(2); activate(h, 'clip-0', 'remove'); await flush();
  assert.equal(h.app.state.mobilePage, 'editor'); assert.equal(h.document.activeElement.dataset.pageTarget, 'editor'); assert.ok(h.document.activeElement.getClientRects().length);
});
test('mobile Undo keeps its existing Edit navigation without focusing hidden Clips', async () => {
  const h = loadApp({ width: 320 }); h.seed(2); activate(h, 'clip-1', 'remove'); h.app.els.toastAction.focus(); await h.app.els.toastAction.click();
  assert.equal(h.app.state.mobilePage, 'editor'); assert.equal(h.document.activeElement.dataset.pageTarget, 'editor'); assert.ok(h.document.activeElement.getClientRects().length);
});
for (const newerOwner of ['field', 'modal', 'closed-modal', 'operation', 'selection', 'import']) test(`pending Undo does not reclaim focus from a newer ${newerOwner}`, async () => {
  const h = loadApp(); h.seed(3); activate(h, 'clip-1', 'remove'); const gate = h.delayMetadata(); h.app.els.toastAction.focus(); const pending = h.app.els.toastAction.click(); await gate.begun;
  let expected;
  if (newerOwner === 'field') { h.app.els.outputNameInput.focus(); expected = h.app.els.outputNameInput; }
  if (newerOwner === 'modal' || newerOwner === 'closed-modal') { h.app.els.helpDialog.showModal(); expected = h.app.els.helpClose; if (newerOwner === 'closed-modal') { h.app.els.helpDialog.close(); expected = h.document.body; } }
  if (newerOwner === 'operation') { h.app.moveClip('clip-2', -1); expected = h.document.body; }
  if (newerOwner === 'import') { await h.app.addFiles([h.file('newer.wav')]); expected = h.document.body; }
  if (newerOwner === 'selection') { await h.app.selectClip('clip-2'); expected = h.document.body; }
  gate.resolve(); await pending; assert.ok(h.document.activeElement === expected, 'newer owner keeps focus'); if (newerOwner === 'modal') assert.equal(h.app.els.helpDialog.open, true);
});
test('Undo called without toast or clip focus does not steal an unrelated owner', async () => {
  const h = loadApp(); h.seed(2); h.app.removeClip('clip-1'); h.app.els.outputNameInput.focus(); await h.app.undoLast(); assert.equal(h.document.activeElement, h.app.els.outputNameInput);
});
test('Help keyboard guidance is present and synchronized in both languages', () => {
  const h = loadApp(); for (const language of ['ja', 'en']) { h.app.applyLanguage(language); const text = h.app.I18N[language].clipKeyboardHelp; assert.ok(text); assert.equal(h.i18nElements.find(el => el.dataset.i18n === 'clipKeyboardHelp')?.textContent, text); }
});
