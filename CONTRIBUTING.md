# Contributing to DeshiPay

Thanks for helping with the website. This repo is the payment-page site; the payload engine lives in
[deshiQR](https://github.com/hello2himel/deshiQR).

## The hard rule: no real payment data

Never commit a real QR payload, account number, name, NPSB token, merchant screenshot or customer
address. The site's fixtures are synthetic. If you need a fixture, reuse the demo payload documented in
the library repo's `docs/demo-payloads.md` (DEMO STORE, dummy account) or generate synthetic values.

## Setup

Node >= 20. The site has no npm dependencies.

```sh
node site/scripts/dev-server.js    # http://localhost:8888
```

Sign-in/publishing need Supabase, or set `SITE_OFFLINE=true` when building config (see
[`docs/website.md`](./docs/website.md)). For auth against a real project, set `SUPABASE_URL` and
`SUPABASE_ANON_KEY` and run `node site/scripts/build-config.js` (Netlify does this automatically).

## Tests

```sh
node site/tests/qr.test.js
node site/tests/export.test.js
```

The Chromium e2e suite (`site/tests/e2e/run.js`, mocked Supabase) needs Chromium + `puppeteer-core`;
it covers online, offline and recovery flows. Run it before touching landing, auth, dashboard, pay or
standalone-export behaviour.

Regenerate themes with `node site/scripts/gen-themes.js` and commit `site/public/css/themes.css` —
CI fails if the generated file is stale.

## Conventions

- **Plain static site.** No bundler; keep HTML/CSS/JS working as static files. The only build is
  `site/scripts/build-config.js` writing the runtime config.
- **No inline scripts/styles** where CSP forbids them; the Netlify headers are strict. Use the existing
  `common.js` helpers (`h()`, `icon()`, escaping) instead of string-interpolated HTML.
- **Themes are generated.** Edit `site/scripts/gen-themes.js`, not `themes.css` by hand; colours are
  derived from each theme accent and must keep WCAG AA contrast.
- **The vendored engine is a copy.** `site/public/vendor/deshiqr.global.js` comes from the deshiQR repo;
  don't edit it by hand. To update it, copy the browser bundle from a deshiQR release/build and commit
  it; the site adapter is `site/public/js/payload.js`.
- **No money handling.** The site displays payment details and generates QR payloads; it must never
  claim to process, hold or confirm payments.
- Supabase schema changes go in `supabase/migrations/` as a new timestamped file (never edit applied
  migrations).

## Pull requests

- [ ] `node site/tests/qr.test.js` and `node site/tests/export.test.js` pass
- [ ] e2e passes if you touched a user flow
- [ ] `themes.css` regenerated if you touched the theme generator
- [ ] no real payment data, screenshots or secrets
- [ ] docs updated (`docs/website.md`, `site/README.md`) where behaviour changed
