# Security policy

## Supported version

Only the latest release on the default branch is supported.

## Reporting

Open a GitHub security advisory for vulnerabilities that could expose local files, bypass the runtime network boundary, execute untrusted code, or corrupt exported audio. Do not attach private audio recordings to public issues; use a synthetic reproduction file instead.

## Security model

Audio Cutter & Joiner has no backend. Selected audio remains in the browser as local `File` objects and temporary Blob URLs. Waveform analysis and export decoding use browser media APIs locally.

The generated standalone HTML uses a strict Content Security Policy with `connect-src 'none'` and does not use runtime `fetch`, XMLHttpRequest, WebSocket, or EventSource. Runtime CDNs, analytics, telemetry, and remote fonts are not used.

## Dependency trust

MP3 export uses `lamejs` as a build-time dependency. The repository pins an immutable upstream source URL and reviewed SHA-256 in `dependencies.json` / `dependencies.lock.json`.

When the verified local cache is unavailable, the build may download the pinned source. The SHA-256 must match before the source is embedded into the standalone HTML. The finished application does not download the encoder at runtime.

Third-party licensing information is recorded in `THIRD_PARTY_NOTICES.md`, with the LGPL-3.0 text included under `licenses/`.

## Self-extracting distribution

`dist/index.self-extract.html` contains a gzip-compressed copy of `dist/index.html`. The build records hashes for both the source and compressed payload and verifies that decompression restores the standalone HTML byte-for-byte. Decompression is performed locally with the browser `DecompressionStream` API and does not require network access.
