# AGENTS.md

## Read first

This repository follows `htmlapps-template` conventions. Treat `APP_SPEC.md` as the product contract and `src/index.template.html` as the editable app source. Generated files under `dist/` and `audio-cutter-joiner.html` must not be edited directly.

## Product rules

- Keep the product focused on cut / split / arrange / join / preview / export.
- Do not add DAW-style features without an explicit product decision.
- Do not remove existing behavior just to simplify a later implementation.
- Use SVG icons rather than emoji UI icons.
- Keep Japanese and English strings in sync.
- Technical engine terms belong in Help/details, not primary user-facing status text.

## Privacy rules

- User audio remains local.
- Runtime external network access stays blocked by CSP.
- Do not add analytics, telemetry, remote fonts, runtime CDN, or user-file uploads.
- If another encoder or WASM runtime is added, pin it in build metadata, review its license, and embed it into the standalone HTML.
- Re-check the claim `完全ローカル処理` whenever runtime architecture changes.

## UI rules

- Brand accent: `#16624F`.
- Light interface.
- Header utility icons have no decorative box/background by default.
- Smartphone behavior is a first-class requirement.
- Prevent horizontal scrolling, clipped dialogs, fixed-bar overlap, and tiny tap targets.
- Long filenames must not break layouts.
- Destructive but recoverable actions should prefer Undo.
- Empty, loading, success, and failure states must tell the user what to do next.

## Audio architecture

For v1.0.0:

- Keep original inputs as `File` objects.
- Native `<audio>` playback uses Blob URLs.
- Web Audio decoding is only for waveform analysis.
- Cache reduced peak arrays, not decoded AudioBuffers.
- Release Blob URLs when switching/clearing.
- Keep trim ranges as metadata in source-time coordinates.
- Split clips must keep referencing the same source `File`; do not duplicate full audio bytes.
- Reuse cached source waveform peaks across split fragments.
- Keep edit operations non-destructive; export must render from clip metadata without mutating source files.

For export:

- WAV is written as 44.1 kHz stereo PCM16 in the app.
- MP3 uses the pinned `lamejs` build-time dependency embedded into standalone HTML.
- M4A uses browser WebCodecs AAC only when support is reported, then wraps encoded AAC frames in a local M4A/ISO BMFF container.
- Do not introduce a runtime CDN or runtime dependency download.
- Process clips sequentially where possible; do not concatenate all decoded audio into one giant AudioBuffer.
- Any new encoder dependency must be pinned, hashed, licensed, and embedded at build time.
- Do not expose arbitrary media-engine command execution to the browser UI.

## Validation

Before handing off a release candidate on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-repository.ps1
```

Also manually test:

- desktop and smartphone layouts
- Japanese and English
- picker and Drag & Drop
- multiple clips
- trim by waveform handles and precise fields
- split at playhead
- clip remove + Undo
- drag reorder and Up / Down reorder
- full sequence preview and junction preview
- Undo for trim / split / reorder / delete
- waveform success and failure
- playback range clamp, seek, stop, keyboard
- MP3 / WAV export and saved-file reopening
- M4A export when WebCodecs AAC is supported, or clear unsupported UI otherwise
- direct `file://` opening
- offline behavior / DevTools Network
