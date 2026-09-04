# Offline / Local Processing Verification

## Automated guardrails

Run on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-repository.ps1
```

The checks verify the generated standalone HTML has no external script/stylesheet resources, no runtime network API calls used by the app source, and a CSP containing:

```text
connect-src 'none'
```

The MP3 encoder may be downloaded during **build** when it is not present in `.cache/`. Its SHA-256 must match `dependencies.lock.json` before it is embedded. This build-time download is not part of application runtime.

## Manual verification

Before a release:

1. Build `dist/index.html` while online if the pinned MP3 encoder is not cached yet.
2. Disconnect the network or use DevTools Network blocking.
3. Open `dist/index.html` directly with `file://`.
4. Add representative audio files.
5. Confirm waveform, trim, split, reorder, full preview, junction preview, remove, and Undo.
6. Export and save representative MP3 and WAV files; reopen them and confirm duration/audio.
7. When the browser reports AAC encoder support, export M4A and reopen it as well. When unsupported, confirm M4A is clearly unavailable and MP3/WAV remain usable.
8. Confirm no unexpected request appears in DevTools Network during all user operations.
9. Repeat the runtime check with `dist/index.self-extract.html`.

## User data boundary

Audio files are selected from the local device. Temporary Blob URLs are used for playback and saved-result download. Web Audio decodes selected audio locally for waveform analysis and export. User audio bytes are not sent to the build-time dependency URL or any other external server.
