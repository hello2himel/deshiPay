# The website (`site/`)

The repo ships a website: **<https://deshiqr.netlify.app>**. It is the payment-page product built on
top of the `deshiqr` payload engine — the library docs ([format](./format.md), [API](./api.md)) still
describe the engine itself; this page is the operator guide for running and deploying the site.

The full site guide (user flows, customising themes/wallets, security details, troubleshooting) is
[`site/README.md`](../site/README.md).

## What it is

- A merchant signs up, drops any Bangla QR (bKash, Nagad, Rocket, Upay, any bank app — the QR image or
  the code text), picks a link such as `deshiqr.netlify.app/shop`, and optionally adds wallet numbers
  and bank details.
- Customers open `/shop`, type an amount (Bangla digits work) and get a ready-to-scan dynamic QR with
  the amount baked in. Wallet numbers and bank lines are tap-to-copy.
- The page only shows payment details. There is no payment confirmation or money handling of any
  kind. Payload editing happens in the browser.

## Architecture

```
site/                     static site (plain HTML/CSS/JS, no bundler, no dependencies)
  public/index.html       landing page + sign up / sign in
  public/app.html         dashboard (served at /app)
  public/pay.html         customer page (served at /<username>)
  public/404.html
  public/css/             base, pay, studio, themes (generated)
  public/js/              auth, common, providers, reader, dashboard, payview, pay, payload
  public/vendor/          qrcode, jsQR, supabase-js, deshiqr.global.js (built from packages/deshiqr)
  scripts/                build-config.js, dev-server.js, gen-themes.js, refresh-engine.js
  tests/                  qr.test.js (engine adapter), e2e/ (optional browser smoke test)
  supabase/schema.sql     tables, Row Level Security, public functions
netlify.toml              repo root: build/routing/headers for site/ (Netlify reads this)
```

- **Hosting — Netlify.** The repo-root [`netlify.toml`](../netlify.toml) sets `base = "site"`,
  `publish = "public"`, build command `node scripts/build-config.js`, plus the redirects (`/app`,
  `/favicon.ico`, `/:username` → `pay.html`, in that order) and the security headers/CSP and cache
  headers. The site itself has no build step.
- **Auth and data — Supabase.** Email/password auth (optionally Google), Postgres with Row Level
  Security. The public customer page never reads the table directly: it calls `get_public_page()`, a
  `SECURITY DEFINER` function that returns only public fields for published pages.
- **Payload editing — this repo's engine.** `site/public/vendor/deshiqr.global.js` is a byte-for-byte
  copy of `packages/deshiqr/dist/deshiqr.global.js`; `site/public/js/payload.js` is the thin site
  adapter (reads the uploaded QR's metadata, calls `DeshiQR.update` / `DeshiQR.validate`). The copy is
  refreshed by `site/scripts/refresh-engine.js` and checked in CI.

## Deploying

Netlify credentials are not part of the repo — the steps below are the one-time setup. Netlify reads
the repo-root `netlify.toml`; do not override the build command or publish directory in the UI.

1. **Create the Netlify site.** Netlify → *Add new site → Import an existing project* → GitHub →
   `hello2himel/deshiQR`. Name the site **`deshiqr`** so the URL is
   <https://deshiqr.netlify.app>. Netlify picks up `netlify.toml` (`base = "site"`, for a monorepo).
2. **Environment variables** (*Site configuration → Environment variables*, production + deploy
   previews):

   | Variable            | Value                                          |
   | ------------------- | ---------------------------------------------- |
   | `SUPABASE_URL`      | `https://<project-ref>.supabase.co`            |
   | `SUPABASE_ANON_KEY` | your anon / publishable key (public by design) |
   | `GOOGLE_AUTH`       | `true` only if you enabled Google auth         |

   The build fails with a clear message if the two required variables are missing.
3. **Database.** In Supabase → *SQL Editor → New query*, paste all of
   [`site/supabase/schema.sql`](../site/supabase/schema.sql) and run it (safe to re-run). It creates
   the tables, RLS policies, username rules and the public functions.
4. **Supabase Auth URLs** (*Authentication → URL Configuration*):
   - **Site URL:** `https://deshiqr.netlify.app`
   - **Redirect URLs:** `https://deshiqr.netlify.app/app` and `http://localhost:8888/app`

   These are used by confirmation and password-reset emails.
5. **Deploy.** Push to `main` (or *Deploys → Trigger deploy*). The build writes
   `site/public/js/config.js` from the environment variables and publishes `site/public`. Smoke-test
   `/`, `/app`, `/<username>` and `/favicon.ico` against the live URL.
6. Optional: add a custom domain in Netlify → *Domain management*; then update the Supabase Site URL
   and redirect URLs to the custom domain.

## Local development

From the repo root:

```bash
pnpm dev:site      # http://localhost:8888 — mimics the Netlify routing (/app, /<username>)
pnpm build:site    # build the library, then vendor its browser bundle into site/public/vendor/
pnpm test:site     # the site engine tests: node site/tests/qr.test.js
pnpm check:site    # verify the vendored bundle matches packages/deshiqr/dist
```

Supabase config for local work: either edit `site/public/js/config.js` by hand (the committed file
has placeholders), or export the variables and run the site's build script — it writes the same file:

```bash
export SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=your-anon-key
node site/scripts/build-config.js
```

A plain static server will show `/app` and `/<username>` as 404: those routes need the rewrites, so
use the dev server (`site/scripts/dev-server.js`), `netlify dev` (Netlify CLI), or the Netlify deploy
preview. The site's own commands (`node site/scripts/dev-server.js`, etc.) also work when run from
inside `site/`.

## Refreshing the vendored engine

The site does not import the library as a package; it vendors the IIFE bundle so it stays a static
site with no build step. After any change to `packages/deshiqr`:

```bash
pnpm build && node site/scripts/refresh-engine.js
# or just:
pnpm build:site
```

This copies `packages/deshiqr/dist/deshiqr.global.js` (and its source map) into
`site/public/vendor/`. Commit the refreshed files — Netlify deploys exactly what is in the repo, and
CI (`node site/scripts/refresh-engine.js --check`) fails if the vendored copy is stale.

## Security notes

- The **anon key is public by design**: it ends up in `site/public/js/config.js` in the browser. Row
  Level Security in `schema.sql` is what protects the data — never put the `service_role` key in the
  site or in Netlify env vars.
- No secrets belong in the repo. `.env` files stay ignored; the site needs no secret to run.
- The customer page is driven by `get_public_page()` (published pages, public fields only); all user
  text is rendered as text, never as HTML, and there are no inline scripts (hence the CSP).
- Anyone can claim any free page name, and a page shows whatever name is in the uploaded QR — the
  customer page tells payers to check the name in their app before paying. See
  [`site/README.md`](../site/README.md#security-notes) for the impersonation/reporting discussion and
  the reserved-name list (kept in both `site/supabase/schema.sql` and `site/public/js/common.js`).

## CI

The `verify` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) builds the library, then
runs `node site/scripts/refresh-engine.js --check` and `pnpm test:site` alongside the existing
typecheck/build/bundle checks, so a stale vendored engine or a broken site adapter fails CI. The
Python matrix job is unaffected. The site tests need no dependencies and no network.

## Related

- [`site/README.md`](../site/README.md) — full site guide: user flows, customising, tests,
  troubleshooting.
- [`netlify.toml`](../netlify.toml) — routing, headers/CSP, cache headers.
- [`site/supabase/schema.sql`](../site/supabase/schema.sql) — tables, policies, reserved names.
- [Format](./format.md), [API](./api.md) — the payload engine the site edits with.
- [SECURITY.md](../SECURITY.md) — the library's security posture.

Known limitation: this environment has no Netlify or Supabase credentials, so the deploy described
above is not performed from the repo — it is a manual, one-time operator step.
