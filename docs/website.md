# The website (`site/`)

The repo ships a website: **<https://deshipay.netlify.app>**. It is the payment-page product built on
top of the `deshiqr` payload engine — the library docs ([format](./format.md), [API](./api.md)) still
describe the engine itself; this page is the operator guide for running and deploying the site.

The full site guide (user flows, customising themes/wallets, security details, troubleshooting) is
[`site/README.md`](../site/README.md).

## What it is

- A merchant signs up, drops any Bangla QR (bKash, Nagad, Rocket, Upay, any bank app — the QR image or
  the code text), picks a link such as `deshipay.netlify.app/shop`, and optionally adds wallet numbers
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
  public/terms.html       terms of service
  public/privacy.html     privacy policy
  public/contact.html     contact + FAQ
  public/404.html
  public/sitemap.xml      static sitemap
  public/css/             base, pay, studio, themes (generated)
  public/js/              auth, common, providers, reader, dashboard, payview, pay, payload
  public/vendor/          qrcode, jsQR, supabase-js, deshiqr.global.js (built from packages/deshiqr)
  scripts/                build-config.js, dev-server.js, gen-themes.js, refresh-engine.js
  tests/                  qr.test.js (engine adapter), e2e/ (optional browser smoke test)
netlify.toml              repo root: build/routing/headers for site/ (Netlify reads this;
                          /terms, /privacy, /contact pretty routes are rewritten to the html files)
```

The database schema and Supabase config live at the repo root, not inside `site/`:
`supabase/migrations/` (versioned SQL, applied by the Supabase GitHub integration) and
`supabase/config.toml`.

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
   `hello2himel/deshiQR`. Name the site **`deshipay`** so the URL is
   <https://deshipay.netlify.app>. Netlify picks up `netlify.toml` (`base = "site"`, for a monorepo).
2. **Environment variables** (*Site configuration → Environment variables*, production + deploy
   previews):

   | Variable            | Value                                          |
   | ------------------- | ---------------------------------------------- |
   | `SUPABASE_URL`      | `https://<project-ref>.supabase.co`            |
   | `SUPABASE_ANON_KEY` | your anon / publishable key (public by design) |
   | `GOOGLE_AUTH`       | `true` only if you enabled Google auth         |

   Both values are **public by design** (the anon key is shipped in the browser; Row Level Security
   protects the data). On public repositories Netlify's sensitive-variable policy may flag them once
   the build writes them into `site/public/js/config.js` and fail the build with *"Secrets scanning
   found secrets in build"*. The repo's [`netlify.toml`](../netlify.toml) sets
   `SECRETS_SCAN_OMIT_KEYS = "SUPABASE_URL,SUPABASE_ANON_KEY"` for that reason; if your site overrides
   build settings, add the same variable in *Site configuration → Environment variables* (all deploy
   contexts), or use `SECRETS_SCAN_OMIT_PATHS = "site/public/js/config.js"`. Never commit or expose the
   `service_role` key.

   The build fails with a clear message if the two required variables are missing — unless you
   deliberately deploy **without a database** by setting `SITE_OFFLINE=true` instead of the two
   Supabase variables. An offline-only deploy has no accounts and no hosted pages; visitors get the
   "Create my page" flow and can download standalone HTML files (the same fallback the site uses when
   Supabase is paused). Add the real Supabase variables and remove `SITE_OFFLINE` later to switch the
   accounts back on.
3. **Database — automatically from this repo.** One-time: Supabase → *Project Settings →
   Integrations → GitHub*, authorize the repository, set **Working directory** to `.` and enable
   **Deploy to production** (and *Automatic branching* if you want preview databases per branch).
   Every push to `main` then applies the SQL files in
   [`supabase/migrations/`](../supabase/migrations/) that the project hasn't applied yet.
   Manual alternative: paste those files, in filename order, into *SQL Editor* once. See
   [Automatic database migrations](#automatic-database-migrations).
4. **Supabase Auth URLs** (*Authentication → URL Configuration*):
   - **Site URL:** `https://deshipay.netlify.app`
   - **Redirect URLs:** `https://deshipay.netlify.app/app` and `http://localhost:8888/app`

   These are used by confirmation and password-reset emails.
5. **Deploy.** Push to `main` (or *Deploys → Trigger deploy*). The build writes
   `site/public/js/config.js` from the environment variables and publishes `site/public`. Smoke-test
   `/`, `/app`, `/<username>` and `/favicon.ico` against the live URL.
6. Optional: add a custom domain in Netlify → *Domain management*; then update the Supabase Site URL
   and redirect URLs to the custom domain.

## Automatic database migrations

The schema is versioned in [`supabase/migrations/`](../supabase/migrations/) and
[`supabase/config.toml`](../supabase/config.toml); `supabase/` sits at the repo root (the integration's
**Working directory** is `.`).

- **One-time setup:** Supabase Dashboard → *Project Settings → Integrations → GitHub* → **Authorize
  GitHub** → choose `hello2himel/deshiQR` → set **Working directory** to `.` → enable **Deploy to
  production** (optional: *Automatic branching* for preview databases on GitHub branches). No GitHub
  Action or secrets are needed; Supabase watches the repo and runs the migrations itself.
- **Changing the schema:** add a new file `supabase/migrations/YYYYMMDDHHMMSS_short_name.sql` (never
  edit a migration that has already been applied), then push/merge to `main`. Supabase applies the
  files it hasn't seen and records them in the project's migration history. See the Supabase
  [GitHub integration docs](https://supabase.com/docs/guides/deployment/branching/github-integration).
- **Checks:** with *Automatic branching* you can make the Supabase status check required on PRs, so a
  bad migration is caught before it reaches `main`. Without branching, test the SQL on a throwaway
  project/branch first.
- **Local / CLI alternative:** `supabase start` for a local stack, and `supabase link` +
  `supabase db push` to apply the same migrations from a machine. The `SITE_OFFLINE` site build and
  the website are unaffected by migrations.

## Supabase project settings (as code)

Besides the schema, the project's auth configuration is versioned in
[`supabase/config.toml`](../supabase/config.toml):

| Setting | Value |
| --- | --- |
| `project_id` / production remote | `wbnkjhlaitoetaztukiy` (production project ref) |
| Auth `site_url` | `https://deshipay.netlify.app` |
| Redirect URLs | `https://deshipay.netlify.app/app`, `http://localhost:8888/app` |
| JWT expiry | 3600 s (1 hour) |
| Sign-ups | enabled (email provider) |
| Anonymous sign-ins | disabled |
| Email confirmations | **off** for now (sign-up lands straight in the dashboard; turn on after custom SMTP is configured) |
| Email change confirmation | confirm on both old and new address |
| Local defaults | `site_url = http://localhost:8888` for `supabase start` |

Top-level sections are local-development defaults; `[remotes.production]` overrides them for the
production project when the GitHub integration deploys. Change a setting by editing the file and
pushing to `main` — no dashboard clicking for these values.

**One-time steps that still need the dashboard** (the integration is a GitHub ↔ Supabase link, so it
must be authorized by the project owner):

1. *Project Settings → Integrations → GitHub* → authorize `hello2himel/deshiQR`, set **Working
   directory** `.`, enable **Deploy to production** (optionally *Automatic branching* for PR preview
   databases and required migration checks).
2. Confirm the resulting **Authentication → URL Configuration** shows the site URL and redirects
   above. If the `[remotes.production]` block was skipped (e.g. the project ref changed), set those
   three values by hand.
3. Netlify: `SUPABASE_URL` + `SUPABASE_ANON_KEY` (public anon/publishable key only) and
   `SECRETS_SCAN_OMIT_KEYS=SUPABASE_URL,SUPABASE_ANON_KEY`; deploy.

**Nothing else needs configuring:** the app uses no Storage buckets, Realtime channels, Edge Functions,
Database Webhooks or cron jobs. Postgres, RLS and the public RPC functions come from
`supabase/migrations/`. Email delivery uses Supabase's built-in sender (rate limited) until you add
SMTP. Google sign-in is optional and needs an OAuth client + `GOOGLE_AUTH=true`; never put the
`service_role` key in the site, Netlify, or the repo.

Verify after the first integration run: `select * from supabase_migrations.schema_migrations;` should
list `20261101120000`. Free-tier projects pause when idle — the site already handles that with the
offline mode described above.

## Local development

From the repo root:

```bash
pnpm dev:site      # http://localhost:8888 — mimics the Netlify routing (/app, /<username>)
pnpm build:site    # build the library, then vendor its browser bundle into site/public/vendor/
pnpm test:site     # site suites: engine adapter + standalone export (node site/tests/qr.test.js && .../export.test.js)
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

## Offline mode and the standalone export

The site does not hard-depend on Supabase for a visitor to create a page. On every page load it probes
the configured project once (`Deshi.checkBackend()` in `site/public/js/common.js`, cached per page):

- no `SUPABASE_URL` / `SUPABASE_ANON_KEY` → offline (no request);
- otherwise `GET <project>/auth/v1/health` (4 s timeout), falling back to `GET <project>/rest/v1/` with
  the anon key if that request fails at the network/CORS level (4 s timeout);
- `540` → **paused** (Supabase free tier auto-pause), `402` → **restricted** (fair-use limits), any
  other HTTP answer → **online**, both probes unreachable → **offline**.

**Online**: everything behaves as documented above; the Share tab additionally offers *Download your
page as HTML* for any published page.

**Offline** (`paused`, `restricted`, `unreachable` or `not-configured`): the landing page shows a
**“Create your page”** CTA instead of the sign-in form (no accounts involved, and no database-status
line), and its points/how-it-works copy switches from “claim your address” to “download it and host it
yourself”. Customers opening a published page while the backend is down get a **“Temporarily
unavailable”** screen — an apology and a **Try again** button that re-checks the backend and loads the
page when it is back — rather than a load error. The CTA opens `/app` with
the same onboarding wizard, running locally: step 1 asks only for the name/business name and an optional
note — no link/username is requested, because the file will be hosted at an address this site doesn't
know — and the small host/username line is hidden in the offline preview and the downloaded file. The
draft lives in `localStorage` (`deshiqr.local.v1`), and the wizard ends with a fifth **Download** step
(the file name comes from the name, e.g. `deshiqr-rahim-traders.html`). People can also open `/app`
directly.

The download is a **single self-contained HTML file** (`deshiqr-<name>.html`, the name slugified, ~140 KB) containing the
customer page, all CSS, the vendored `deshiqr` engine, `payload.js`, PayView and the page data embedded
as `window.DESHIQR_PAGE`. The only external reference is the Google Fonts stylesheet (system/Bengali
font fallbacks still work); everything else works from `file://` or any static host (Netlify Drop,
GitHub Pages, ordinary upload). It behaves like `/<username>`: `?amount=500` locks the amount. The small
“Made with DeshiQR” footer points at the site origin the file was generated on.

Things an operator should know:

- **Generating requires the site to be up**: the browser fetches the site's own CSS/JS to inline them.
  The generated file then works independently and survives the site being down.
- **Exported copies are frozen** — editing the page in the dashboard does not update an already
  downloaded file; download a fresh copy after changes. Pages published on Supabase are unaffected and
  keep updating live.
- The health probe uses the configured Supabase host. A custom (non-`*.supabase.co`) API domain would be
  blocked by the CSP `connect-src` in the repo-root `netlify.toml` and the site would read as offline;
  add the host there if you need one.
- With real placeholder config in local development, the site deliberately looks like an offline/paused
  deployment — set the environment variables (or edit `site/public/js/config.js`) to test the online
  flow, and mock/abort the probe to test offline behaviour (see the e2e in `site/tests/e2e/run.js`).

```bash
# optional browser test: online journey + offline CTA/wizard/download + standalone file
mkdir -p /tmp/deshiqr-e2e && (cd /tmp/deshiqr-e2e && npm i --no-save puppeteer-core)
NODE_PATH=/tmp/deshiqr-e2e/node_modules CHROME=/path/to/chrome node site/tests/e2e/run.js
```

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
  Level Security in the migrations is what protects the data — never put the `service_role` key in the
  site or in Netlify env vars.
- No secrets belong in the repo. `.env` files stay ignored; the site needs no secret to run.
- The customer page is driven by `get_public_page()` (published pages, public fields only); all user
  text is rendered as text, never as HTML, and there are no inline scripts (hence the CSP).
- Anyone can claim any free page name, and a page shows whatever name is in the uploaded QR — the
  customer page tells payers to check the name in their app before paying. See
  [`site/README.md`](../site/README.md#security-notes) for the impersonation/reporting discussion and
  the reserved-name list (kept in both `supabase/migrations/` and `site/public/js/common.js`).

## CI

The `verify` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) builds the library, then
runs `node site/scripts/refresh-engine.js --check` and `pnpm test:site` alongside the existing
typecheck/build/bundle checks, so a stale vendored engine or a broken site adapter fails CI. The
Python matrix job is unaffected. The site tests need no dependencies and no network.

## Related

- [`site/README.md`](../site/README.md) — full site guide: user flows, customising, tests,
  troubleshooting.
- [`netlify.toml`](../netlify.toml) — routing, headers/CSP, cache headers.
- [`supabase/migrations/`](../supabase/migrations/) — versioned schema: tables, policies, reserved names.
- [Format](./format.md), [API](./api.md) — the payload engine the site edits with.
- [SECURITY.md](../SECURITY.md) — the library's security posture.

Known limitation: this environment has no Netlify or Supabase credentials, so the deploy described
above is not performed from the repo — it is a manual, one-time operator step.
