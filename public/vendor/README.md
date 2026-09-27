# Markdown renderer

`markdown-it-15.0.2.mjs` is the unmodified browser ESM bundle from the official npm package `markdown-it@15.0.2`, `dist/browser/markdown-it.esm.min.mjs`.

- Upstream: https://github.com/markdown-it/markdown-it
- Documentation: https://markdown-it.github.io/markdown-it/
- License: MIT (see `markdown-it-LICENSE.txt` and license notices in the bundle).
- npm archive integrity: `sha512-q4IGxMv56jCqT4OCRCADBoDP3LO4MhmTXjFbphHPXs4g3j9Xg5RDnxqN8IF/3vIWEU+VCnUq+7JUg/cfy2E6Qw==`

The bundle is served locally. No CDN, remote scripts or new server dependencies are required. The renderer disables raw HTML, does not load answer images and restricts links to HTTP, HTTPS and mailto. Update this vendored bundle when applying upstream security fixes; run all tests and browser checks after updating.
