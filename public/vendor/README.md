# Markdown renderer

`markdown-it-15.0.3.mjs` is the unmodified browser ESM bundle from the official npm package `markdown-it@15.0.3`, `dist/browser/markdown-it.esm.min.mjs`.

- Upstream: https://github.com/markdown-it/markdown-it
- Documentation: https://markdown-it.github.io/markdown-it/
- License: MIT (see `markdown-it-LICENSE.txt` and license notices in the bundle).
- npm archive integrity (verified): `sha512-+Az7Ojz3iRGu8KYMvJ6xVhvrxP3eE+vEtJX75Ow88XBpcQNV/0lGX5ZynIIBftREo4DC2jsveAMDaeltmm8QvQ==`
- Browser bundle SHA256: `d5432491790141da046b1197353705db03264f40b5727f3b4b591f5aba193e30`.
- Security update: [GHSA-gfr2-rv44-r23c](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-gfr2-rv44-r23c), [GHSA-vfgh-jcmw-g37q](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-vfgh-jcmw-g37q).

The bundle is served locally. No CDN, remote scripts or new server dependencies are required. The renderer disables raw HTML, does not load answer images and restricts links to HTTP, HTTPS and mailto. Update this vendored bundle when applying upstream security fixes; run all tests and browser checks after updating.
