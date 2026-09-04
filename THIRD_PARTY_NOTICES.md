# Third-Party Notices

Audio Cutter & Joiner v1.0.0 embeds the following third-party component in the generated standalone HTML.

## lamejs 1.2.1

- Project: https://github.com/zhuker/lamejs
- Pinned source commit: `260ecf8a2cf15b97e65442986c5c9149b0be7764`
- Embedded file: `lame.min.js`
- License: LGPL-3.0
- Locked SHA-256: `15d285e2587b3bdbfd18a68de6ce07cc074f7480a82c3815da2dc1c348ec6df4`
- Corresponding source: https://github.com/zhuker/lamejs/tree/260ecf8a2cf15b97e65442986c5c9149b0be7764

The build script downloads the pinned file only when a verified local cache is unavailable, verifies its SHA-256, and embeds the source into the standalone HTML. Audio Cutter & Joiner does not modify the lamejs source at build time.

A copy of the GNU Lesser General Public License v3 is included at `licenses/LGPL-3.0.txt`.

## Browser APIs

The application also uses standard browser APIs such as File API, Blob URLs, HTMLMediaElement, Canvas, Web Audio, and (when available) WebCodecs. These are not third-party application dependencies.
