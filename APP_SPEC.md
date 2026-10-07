# APP_SPEC.md

## Product

- Name: Audio Cutter & Joiner
- Japanese name: 音声カット・結合
- Repository: `ttomohisa/htmlapps-audio-cutter-joiner`
- Current version: `v1.0.1`

## Goal

Provide a small browser app for trimming, splitting, arranging, joining, previewing, and exporting audio without uploading user files.

The final product should feel like one continuous clip workflow rather than separate "cutter" and "joiner" modes:

1. Add one or more audio files.
2. Select a clip and inspect its waveform.
3. Trim or split clips.
4. Remove and reorder clips.
5. Preview the sequence and clip boundaries.
6. Export one audio file.

## Product boundaries

This is not a DAW. Do not turn it into a multitrack editor.

Out of scope for v1.0 unless explicitly reconsidered:

- multitrack mixing
- recording
- EQ / compressor / reverb
- pitch or speed effects
- noise reduction
- AI processing
- beat detection
- full metadata/tag editing

## Privacy

User audio must remain in the browser.

- No runtime CDN.
- No analytics or telemetry.
- No user-file upload.
- No runtime `fetch`, XHR, WebSocket, or EventSource.
- CSP must keep `connect-src 'none'`.
- Third-party code/WASM added later must be pinned and embedded at build time.

The UI may state `完全ローカル処理 / Fully local processing` only while these conditions remain true.

## v1.0.0 acceptance criteria

### Import

- File picker supports multiple audio files.
- Drag & Drop works on desktop.
- Common audio extensions can be selected.
- Unsupported/non-audio selections show a plain-language message.
- Files are kept as `File` objects; the app does not create permanent full-file duplicate buffers.

### Clip list

- Multiple files appear as clips in added order.
- Long filenames truncate without horizontal scrolling.
- Selecting a clip updates the preview.
- Removing a clip offers Undo.
- Deleting the selected clip safely selects an adjacent clip when available.

### Waveform

- The selected file is decoded only for waveform analysis.
- Waveform peak data is cached; the decoded AudioBuffer is not kept after analysis.
- Waveform is Canvas-based and responsive.
- Click/tap seeks the audio.
- If waveform decoding fails, playback can remain available when the browser can still play the file.

### Playback

- Play / pause and stop are available.
- Seek slider is available.
- Space toggles play/pause outside form controls.
- Left/right arrow keys seek 5 seconds.

### Cutter

- Trim start/end are non-destructive edit metadata.
- Waveform handles adjust Start and End.
- Precise time fields accept `mm:ss.mmm`, `h:mm:ss.mmm`, or seconds.
- Start / End can be set from the playhead.
- Playback is constrained to the kept range.
- Split at playhead creates two clips referencing the same source `File`.
- Split fragments reuse cached source waveform peak data.
- Delete, split, and trim changes provide one-step Undo.
- Reset trim restores the selected clip's exact base boundaries, with one-step Undo. Split fragments restore only their own range. Unknown ranges and already-reset clips disable the action without replacing Undo.
- Reset stops preview and preserves clip/source identity, order, source File objects and cached peaks.


### Joiner

- Clip order defines the final playback order.
- Desktop supports drag-and-drop reordering from a dedicated drag handle.
- Up / Down buttons provide an explicit reorder fallback on touch devices and for keyboard users.
- Reordering is non-destructive and supports one-step Undo.
- Sequence preview plays every clip in the current list order and respects each kept range.
- Junction preview plays approximately the final 2 seconds of the selected clip followed by the first 2 seconds of the next clip.
- Starting another edit or preview stops sequence playback so two audio elements do not play at once.
- Total sequence duration is shown when duration metadata is available for all clips.

### File information

Show when available:

- duration
- file size
- sample rate
- channel count
- extension/type summary

### Responsive UI

Desktop:

- left clip list
- right waveform/preview

Smartphone:

- fixed bottom tabs for Clips, Edit, and Export
- no horizontal scroll
- no fixed UI covering the active content
- selecting a clip moves to Waveform view
- controls remain large enough for touch

### Language

- Japanese and English are both included.
- Language can be switched from the header: `EN` in Japanese and `JA` in English, with localized target-language labels and tooltips.
- The visible header version is `vX.Y.Z` from `app.config.json`. Help and audio-control accessible labels follow the active language.

### Export

- Current clip order and trim boundaries define the exported sequence.
- Valid imports and successful Undo invalidate previous exports. Rejected imports and no-op edits preserve valid results.
- Sequence mutations during an asynchronous export cancel that attempt so obsolete output cannot reappear. The user can export the edited sequence again.
- Output filename is editable and sanitized before download.
- MP3 export is available at 128 / 192 / 256 / 320 kbps using a pinned encoder embedded at build time.
- WAV export is PCM 16-bit, 44.1 kHz stereo.
- M4A/AAC export uses WebCodecs when `mp4a.40.2` encoding is supported by the current browser; unsupported browsers must show a plain-language fallback to MP3/WAV.
- Export has preparing/encoding/finalizing, cancel, failure, success, and save states.
- Runtime export must make no external network request.
- Export decodes/resamples clip-by-clip instead of keeping one giant final decoded sequence in memory.

## Stable-release scope

v1.0.0 establishes the current cutter/joiner workflow as the stable baseline. Future additions should preserve the simple single-track workflow and remain optional. Candidates such as fade in/out, crossfade, or per-clip volume require a separate product decision and are not part of the v1.0.0 contract.
