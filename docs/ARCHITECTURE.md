# Architecture

## v1.0.0 runtime

```text
Local File(s)
   |
   +--> File objects kept in clip state
   |
   +--> Blob URL --> HTMLAudioElement --> preview
   |
   +--> temporary ArrayBuffer --> Web Audio decode --> reduced peak array --> Canvas waveform
   |
   +--> export: clip-by-clip decode/resample to 44.1 kHz stereo
             |--> WAV: PCM 16-bit writer
             |--> MP3: embedded lamejs encoder
             `--> M4A: WebCodecs AAC --> local ISO BMFF/M4A muxer

External server: not used at runtime
Runtime network: blocked by CSP (`connect-src 'none'`)
```

Trim and split operations are non-destructive. Each clip stores source-time boundaries while continuing to reference the original `File`. Split fragments share source metadata and the reduced waveform peak array, so splitting does not duplicate the audio bytes.

Export processes one clip at a time rather than constructing one large decoded sequence AudioBuffer. The current clip is decoded, trimmed and resampled, passed to the selected encoder/writer, then allowed to become collectible before the next clip is processed.

M4A output is feature-detected. If WebCodecs cannot encode `mp4a.40.2`, M4A is disabled and MP3/WAV remain available.

## Build

```text
src/index.template.html
+ app.config.json
+ dependencies.json / dependencies.lock.json
+ pinned lamejs source (verified build cache)
        |
        v
build-standalone.ps1
        |
        +--> dist/index.html
        +--> dist/index.self-extract.html
        +--> manifests / size report
        +--> audio-cutter-joiner.html
```

The MP3 encoder is a **build-time** dependency. The generated HTML contains it inline and needs no runtime CDN or network request.

The generated HTML is not an editable source file.

## Sequence preview

`sequenceAudio` is a separate hidden audio element used only for non-destructive whole-sequence and junction previews. It creates one temporary object URL at a time, revokes it before advancing, and never renders or concatenates a new audio file.
