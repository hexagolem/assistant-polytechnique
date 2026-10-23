# Security baseline — 23 October 2026

Production requires Node.js 24.22.1 or a later patched Node.js 24 release. The Render blueprint, package engines and local version files agree on this baseline. The application refuses an older production runtime; changing these files still requires a Render redeployment and a check of the actual deployed Node version.

The [Node.js 21 October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) fixes the Brotli decoder RCE and DNS/TLS validation issues. This server uses Node.js HTTP, crypto and SQLite directly; it does not use PHP, Python, Next.js or React Server Components.

The browser Markdown renderer uses the verified official markdown-it 15.0.3 bundle. It fixes [CVE-2026-111758](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-gfr2-rv44-r23c), a multiline-reference parsing denial of service. HTML remains disabled, so the separate [inline HTML issue](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-vfgh-jcmw-g37q) was not reachable with the application's configuration. Upstream archive integrity and the bundled file hash are recorded in `public/vendor/README.md`.

Offline validation: `node --test test/*.test.mjs` passes 50 tests on Node.js 24.22.1, including synthetic access control, session isolation, origin checks, Markdown safety and runtime version rejection. All upstream Dust responses are simulated. No model request or production deployment was performed by these checks.

Keep the Render disk private, keep ADMIN_SECRET and Dust credentials in private environment settings, and redeploy after runtime updates. Source and synthetic tests do not establish the state of production infrastructure or guarantee the absence of vulnerabilities.
