'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const argument = process.argv.indexOf('--html');
const file = argument >= 0 ? process.argv[argument + 1] : path.join(__dirname, '../src/index.template.html');
let html = fs.readFileSync(file, 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/);
if (payload) html = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
const excluded = [
  "並べ替え・削除・元に戻すの後も、表示中のクリップ操作・音声選択・現在のタブへフォーカスを戻します。",
  "「範囲をリセット」にフォーカスがある場合、操作後は開始欄または現在のタブへ戻します。",
  " After reorder, remove, or Undo, focus returns to a visible clip control, audio picker, or current tab.",
  " When Reset trim has focus, it returns focus to Start or the current tab.",
  "画面が小さい場合はヘルプの本文内をスクロールしてください。閉じるボタンは上部に残ります。Escキーでも閉じられます。",
  "On a small screen, scroll inside the Help text. The Close button stays at the top. You can also press Esc to close Help."
];
for (const text of excluded) {
  assert.equal(html.includes(text), false, `User-facing help must exclude obsolete audit/implementation copy: ${text}`);
}
console.log('User-facing help copy regression passed.');
