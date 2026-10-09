# Changelog

## 1.0.3 - 2026-10-09

- Normalize the app icon background to `#16624f` with 25% corner radii, and keep the asset, header and favicon consistent without changing the artwork.

## 1.0.2 - 2026-10-09

- Refresh the app icon and favicon with the supplied SVG artwork, preserving the original viewBox and standalone/offline behavior.
- Add icon consistency coverage for the canonical asset, header, and favicon.

## 1.0.1 - 2026-10-07

- Standardized header language targets and localized their accessible labels/tooltips, Help controls, and audio-control labels.
- Bound the visible `vX.Y.Z` header badge to the canonical app version without changing layout or local-processing copy.
- Added header regression coverage across source, readable, self-extract, and root public builds.

- Added Reset trim / 範囲をリセット for the selected clip, with exact split-fragment boundaries and one-step Undo.
- Fixed stale downloadable output after adding more audio, and invalidated cached exports after successful Undo.
- Cancelled in-flight exports when clips change, including waveform dragging, so obsolete results cannot reappear.
- Added dependency-free synthetic-audio regression tests for source and generated HTML, including PCM16 WAV byte checks.

## 1.0.0 - 2026-09-04

- Promoted Audio Cutter & Joiner to the first stable release.
- Finalized local MP3, M4A/AAC (when supported by WebCodecs), and WAV export.
- Confirmed trim, split, delete, reorder, one-step Undo, sequence preview, and junction preview behavior.
- Finalized Japanese/English desktop and smartphone UI, including the mobile Clips / Edit / Export navigation.
- Reworked README documentation for release use, offline operation, privacy boundaries, format support, build layout, and limitations.
- Refreshed release screenshots using representative non-uniform audio so the waveform view is clear.
- Re-ran standalone, self-extract, runtime-network, and export regression checks for the stable build.

## 0.4.0 - 2026-09-04

- Added real sequence export as MP3, M4A/AAC, or WAV.
- Added editable output filename and 128 / 192 / 256 / 320 kbps quality choices for compressed formats.
- Added export preparing, progress, cancel, failure, completion, and save states.
- Added a pinned, SHA-256-verified lamejs build-time dependency that is embedded in standalone HTML for offline MP3 export.
- Added browser-feature-detected AAC encoding via WebCodecs and a local M4A/ISO BMFF muxer.
- Added clip-by-clip decode/resample export to avoid holding one giant final decoded sequence in memory.
- Added the smartphone Export tab and updated JA/EN copy and documentation.


## 0.3.0 - 2026-09-03

- Added desktop drag-and-drop clip reordering with a dedicated drag handle.
- Added explicit Up / Down reordering controls for touch and keyboard-friendly operation.
- Added one-step Undo for clip reordering.
- Added full sequence preview that respects the current clip order and trim ranges.
- Added junction preview for the final ~2 seconds of the selected clip plus the first ~2 seconds of the next clip.
- Added sequence duration/status UI and playback conflict handling.

## 0.2.1 - 2026-09-03

- Fixed the empty dependency array build failure under Windows PowerShell StrictMode.
- Replaced PowerShell 7-only / newer hash and constructor usage in the build path for Windows PowerShell 5.1 compatibility.
- Realigned the header, page intro, workspace surface, buttons, toast, help dialog, spacing, and mobile layout with htmlapps-template v1.2.2.
- Removed development-only status copy from the user-facing workspace.

## 0.2.0 - 2026-09-03

- Added non-destructive Start / End trim ranges.
- Added draggable waveform trim handles and precise time fields.
- Added Set Start / Set End from the current playhead.
- Added kept-range preview with playback clamped to the selected range.
- Added split-at-playhead with shared source files and waveform peak reuse.
- Extended one-step Undo to trim, split, and delete operations.
- Updated smartphone editing UI and JA/EN copy for the Cutter stage.

## 0.1.0 - 2026-09-03

- Added the initial template-based repository structure.
- Added multi-file audio import and desktop Drag & Drop.
- Added clip selection and removal with Undo.
- Added local waveform analysis using Web Audio and reduced peak caching.
- Added native audio preview, seek, stop, and keyboard controls.
- Added responsive desktop/smartphone layouts and JA/EN UI.
- Added strict runtime CSP with `connect-src 'none'`.
- Added standalone and self-extract build/check scripts.
