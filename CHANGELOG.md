# Changelog

All notable changes to **DeshiPay** (the payment-page website) are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Repo split (2026-11-02).** The payload engine (npm/PyPI `deshiqr`, browser bundle, its docs and
> release workflows) now lives in its own repo: **[hello2himel/deshiQR](https://github.com/hello2himel/deshiQR)**.
> This repo is **DeshiPay**, the website. Entries below span the combined history; engine-only work
> from before the split is catalogued in the engine repo.

## [Unreleased]

### Added

- **Minimal motion across the site, with reduced-motion support.** Hero text/CTA and points rise in with a
  small stagger, the live demo fades in, feature cards lift on hover, FAQ answers fade open, the mobile
  menu/theme toggle have small fades/rotations, buttons nudge and their arrows slide, and customer pages
  rise in (head, help, card, footer). Below-the-fold feature/FAQ cards fade up on scroll via
  `site/public/js/motion.js` + `IntersectionObserver`; the content stays visible without JS, and
  `@media (prefers-reduced-motion: reduce)` disables every animation/transition (JS also skips the
  reveal setup), so reduced-motion visitors get the static page immediately.

### Added

- **More useful homepage below the fold.** The old three-step "How it works" strip is replaced by a
  six-card feature grid (real QR, your own link, any reason, themes, downloadable/hostable, no money
  handling), a six-question FAQ built with native `<details>` (no JS), and a closing "Your page is a
  minute away" CTA. The nav and footer link to `#features` / `#faq` instead of the removed `#how`.

### Added

- **Light/dark toggle in the nav.** A sun/moon button in the header lets visitors force light or dark
  regardless of their OS setting, remembers the choice in `localStorage` (`deshipay.mode`), and applies
  before first paint via a tiny `site/public/js/mode.js` (so there is no flash). The button is icon-only
  in the desktop bar and a labelled row inside the mobile hamburger menu; `gen-themes.js` now emits
  explicit `html[data-mode="light|dark"]` overrides for all ten themes so the toggle beats
  `prefers-color-scheme`.

### Changed

- **Footer disclaimer.** The footer blurb now opens with **"Not a payment processor."** and spells out
  what DeshiPay is: just a page that shows the live QR and wallet/bank details, with customers paying
  from their own banking app. It appears under the brand on every page.

### Changed

- **Customer-page footer is a real call to action.** Instead of the tiny "Made with DeshiPay" text, every
  customer page (and every downloaded standalone page) now ends with the DeshiPay logo + wordmark
  ("Made with DeshiPay") and a **Create your own page** button linking to the site that generated the
  page. It uses the page's theme colours and is hidden in the dashboard/landing previews as before.

### Changed

- **Contact email + report abuse.** The contact address is now
  **stargzr.science@gmail.com** everywhere (terms, privacy, contact/FAQ, security policy). Every page's
  footer has a **Report abuse** link in the Support column: a mailto with the subject pre-filled
  ("Report abuse on DeshiPay"), so a visitor can report an impersonating or abusive page from any page.

### Changed

- **Rebrand to DeshiPay, with a wider story.** The site (titles, header, footer, legal pages, customer
  page, exported standalone files) is now branded **DeshiPay**, and the copy no longer frames the
  product as a QR tool: it is a complete way to receive **payments, donations and support** for shops,
  freelancers, creators and causes. The live, amount-ready Bangla QR stays the headline method, with
  wallet and bank details beside it; the landing, login, terms, privacy, contact/FAQ, README and docs
  reflect that. The engine repo keeps its own name (`deshiQR`) and is linked as the QR engine.

- **Mobile navigation.** On narrow screens the header no longer packs `Sign in` / `Create page` (or the
  dashboard's `View page` / account / `Sign out`) into the bar: a hamburger button opens a menu with
  the nav links and actions, and closes on Escape, an outside click or after choosing an item. Desktop
  keeps the inline row; the menu is wired up by the new `site/public/js/nav.js` and is available on
  every page with a header (landing, login, dashboard, legal pages, 404), with `aria-expanded`/`aria-controls`.

- **Repo split: the engine moved out.** This repository is now **DeshiPay** (the payment-page site);
  the payload engine — npm/PyPI `deshiqr`, the TypeScript/Python packages, the browser bundle, its
  docs (format, API, demo payloads, Pages self-hosting), examples, cdn demo and release workflows —
  lives in the new public repo **[hello2himel/deshiQR](https://github.com/hello2himel/deshiQR)**.
  The site still vendors the engine's browser bundle, so deployment is unchanged; the netlify build,
  Supabase migrations and all site code stay here. Goodbye monorepo tooling: no pnpm workspace, no
  local library build, and CI now runs only the site suites plus a generated-themes freshness check.

### Added

- **The deshiQR website** — [`site/`](./site/), deployed at <https://deshipay.netlify.app>: payment
  pages for Bangla QR. A merchant drops any Bangla QR, picks a link, and customers visit
  `/<username>`, type an amount and get a ready-to-scan dynamic QR; wallet numbers and bank details
  can sit beside it. Static site (HTML/CSS/JS) on Netlify with accounts and page data on Supabase
  (email/password auth, Postgres + Row Level Security). Payload editing in the browser runs the
  vendored `deshiqr` bundle — the site has no payload engine of its own. Repo-root
  [`netlify.toml`](./netlify.toml) (`base = "site"`) and [`docs/website.md`](./docs/website.md)
  document the deploy; the site appends no new public functions to the package API.
- **Offline mode and standalone page downloads (website).** On every page load the site probes its
  Supabase backend (`/auth/v1/health`, with a `/rest/v1/` fallback; free-tier pauses answer HTTP 540).
  When the backend is paused, restricted, unreachable or not configured, the landing page offers a
  no-login "Create my page" CTA and the normal `/app` wizard runs locally (no username/link is asked;
  draft in `localStorage`), with a fifth Download step that saves the customer page as one self-contained
  `deshiqr-<name>.html` (~140 KB, inlined CSS, QR engine and page data; only Google Fonts
  external; the host/username line is hidden) that can be hosted anywhere and supports `?amount=`. When
  the backend is online the site behaves exactly as before, and the Share tab also offers the same HTML
  download. Payment pages opened by customers while the backend is down show a friendly "Temporarily
  unavailable" screen with a Try again button instead of a load error. See
  [`site/README.md`](./site/README.md#offline-mode-paused-supabase-and-the-standalone-download).
- **Tests/docs:** `site/tests/export.test.js` (standalone builder: inlining, escaping, contents) and an
  extended Chromium e2e covering the online journey, the offline CTA/wizard/download and the generated
  file; `docs/website.md` documents the operator side.

- **Database migrations from the repo.** The Supabase schema moved from `site/supabase/schema.sql` to
  versioned SQL migrations in [`supabase/migrations/`](./supabase/migrations/) (plus
  `supabase/config.toml`), so the Supabase **GitHub integration** can apply every new migration
  automatically when a commit lands on `main` — no manual SQL-editor step, no GitHub Action secrets.
  Add future schema changes as new `YYYYMMDDHHMMSS_name.sql` files. Setup instructions are in
  [`docs/website.md`](./docs/website.md#automatic-database-migrations).

- **Supabase project settings as code.** [`supabase/config.toml`](./supabase/config.toml) pins the
  production project's auth settings (site URL `https://deshipay.netlify.app`, `/app` redirect URLs,
  JWT expiry, sign-ups enabled, anonymous sign-ins off, email confirmations off until SMTP is set up)
  via a `[remotes.production]` block, plus local-development defaults. The Supabase GitHub integration
  applies these alongside the migrations, so most of the project configuration lives in the repo.

- **Legal and support pages, plus a real site footer.** The website now has Terms of service
  (`/terms`), Privacy policy (`/privacy`) and a Contact & FAQ page (`/contact`), served from
  `site/public/*.html` with pretty URLs (Netlify + dev-server rewrites), a static `sitemap.xml`, and
  a `/terms`-etc. entry in `robots.txt`. Every page (landing, dashboard, customer pages, 404 and the
  new pages) shares a useful footer with Product (home, how it works, create a page), Legal (terms,
  privacy) and Support (contact, open-source) links, plus the "not a payment processor" line.

- **The sign-in form moved off the homepage.** The landing page now shows just one "Create your page"
  arrow button under the hero text instead of the full sign-up/sign-in form (the form is its own page
  at `/login`, with the same sign-up / sign-in / reset flows). This declutters the homepage — one
  clear action, no card — and keeps it a landing page. `/login` is routed by Netlify and the dev
  server, and the footer's "Create a page" link points at it.

- **The top navbar now does something.** On the landing and info pages the bar carries real navigation
  — How it works, Demo and FAQ (anchor/route links) — plus Sign in and a compact Create page button;
  it hides the text links on narrow screens so the mobile bar stays clean. The demo section is now
  `#demo` so the nav can jump to it (with scroll-margin under the sticky bar).

### Fixed

- **Theme toggle vs. nested theme scopes.** Choosing light while the OS was dark (or vice versa) left
  the landing payment demo dark: PayView sets its own `data-theme` element, and the generated
  `html[data-mode=…]` overrides only matched `<html>`. `gen-themes.js` now also emits
  `html[data-mode=…] [data-theme=…]` rules, so an explicit choice reaches the demo card (and any
  preview) too.

### Fixed

- **Netlify secret scanning false positive on the public Supabase values.** The build writes
  `SUPABASE_URL` and the public anon key into `site/public/js/config.js`; on public repositories
  Netlify's sensitive-variable policy can fail the deploy with *"Secrets scanning found secrets in
  build"*. The repo-root `netlify.toml` now sets
  `SECRETS_SCAN_OMIT_KEYS = "SUPABASE_URL,SUPABASE_ANON_KEY"` (the anon key is public by design —
  RLS protects the data; the `service_role` key must never be exposed).

- **UTF-8 byte-length TLV support (real Bangla QR payloads).** EMVCo/NPSB payloads count each field's
  `LL` length in UTF-8 bytes, so payloads with non-ASCII values — a Bangla merchant name in tag `59`,
  a Bangla city in `60` — used to fail with `MISSING_FIELD`/`BAD_TLV`. The engine now parses by byte
  offsets (`TextEncoder`/`TextDecoder`), accepts and preserves byte-counted payloads, and still
  auto-detects and round-trips legacy character-counted payloads. Lengths, nested templates (`26`,
  `62`), duplicate-tag checks and the 99-unit field limit all use the detected unit; `update()` writes
  back with the same unit, and all-ASCII payloads are byte-identical to before. Mirrored in the
  Python package. See [`docs/format.md`](./docs/format.md#encoding).

### Changed

- **Pink → green rebrand (new default palette).** The website's colour scheme is now a deep "bottle"
  green: accent `#056B4E`, accent-text `#046046`, soft `#DAE9E4`, page `#E6F0ED`, line `#B9D6CD`,
  ink `#181D2B` — 6.5:1 white-on-accent and 6.5:1 link text, WCAG AA everywhere; dark-mode twin
  `#34D6A4` (9:1 on the dark page). Rationale: the 163° hue echoes the national-flag/taka security
  green, sits ~20° away from the "paid/success" green (so status is not painted in the brand colour),
  and is nobody else's colour in this market (bKash pink, Nagad orange, Rocket purple).
  - The `emerald` theme is refined in place (no new theme id/DB check migration) and becomes the
    default for the site, `/app`, `/login`, `/pay` fallbacks, exports, the landing demo and new
    database rows (`profiles.theme` default via a new migration). `rose` (and the rest) stay
    selectable — they are simply no longer the default.
  - Accessibility/consistency fixed at the same time: `--ok` no longer equals the accent
    (`#0D7A30`, 4.74:1 on its soft pill — fixes an existing AA fail; dark `#7CE08B`), the customer
    page's caution box is now neutral instead of "success green", the QR placeholder pattern is
    neutral, `<meta name="theme-color">` is green (with a dark variant) instead of pink, the favicon
    is green instead of bKash pink, and the Emerald picker swatch matches `#056B4E`.

### Fixed

- **The landing page demo is now the real payment page.** Instead of a static mock slip, the right-hand
  card mounts the actual customer-page component (`PayView`) exactly the way `pay.html` does, using the
  demo Bangla QR payload (NPSB account template, merchant name/city, provider token templates) as the
  base, plus demo wallet and bank details: the full page — QR / Wallet / Bank method tabs, amount +
  quick-amount chips, a real amount-bearing QR built by the site's engine and Save QR image (the
  page-only "How to pay" block and footer are left off the homepage demo). It starts at ৳1,500 and
  works with the paused/unreachable offline mode too.

- **Theme backgrounds now follow the theme accent.** The generated `themes.css` used to mix a shared
  lavender-white base with only ~5% of the accent, so most themes (especially green, blue and graphite)
  kept a pinkish-white page background. Every surface is now derived from the accent itself: rose →
  pinkish white, emerald → minty white, teal → pale teal, ocean → bluish white, violet → lavender
  white, amber → cream, olive → pale green, graphite → cool grey — with matching dark-mode backgrounds,
  borders, secondary buttons and soft tints. Contrast checks still pass for every theme.

## 0.1.0 — 2026-11-01

First public release. One job: **load a Bangla QR payload, edit any tag, and get the updated payload
back.** Early and deliberately small: no QR generation, no payload reading, no UI, no database.

### Added

- `deshiqr` — one dependency-free npm package at `packages/deshiqr` with exactly two public
  functions:
  - `update(payload, edits, options?) -> string` — applies aliases (`amount`, `currency`, `country`,
    `mcc`, `name`, `city`, `reference`, `customerLabel`, `account`, `institution`) or tag paths
    (`"54"`, `"62/01"`, `"26/03"`, …), removes tags with `null`, inserts new tags in ascending order,
    keeps tag `01` consistent with the amount, rejects edits to the checksum, and always re-seals
    `63` with CRC-16/CCITT-FALSE. Duplicate tags are rejected. `update(payload)` / `update(payload,
{})` is validate-only and returns the payload byte-identically.
  - `validate(payload, options?) -> { ok, errors, warnings }` — never throws; collects every error
    and warning.
  - Warning handling: `warnings: true | false | ["59", "62/01"]` (exact tag/path suppression) and
    `onWarning`; warning codes `MISSING_TAG`, `UNKNOWN_TAG`, `BAD_FIELD_VALUE`, `FIELD_TOO_LONG`,
    `UNKNOWN_CURRENCY`, `NON_BD_COUNTRY`, `UNKNOWN_INSTITUTION`, `UNKNOWN_MCC`, `STATIC_WITH_AMOUNT`,
    `DYNAMIC_WITHOUT_AMOUNT`, `RISKY_EDIT`. Error codes `EMPTY_PAYLOAD`, `UNSUPPORTED`, `BAD_TLV`,
    `MISSING_FIELD`, `CHECKSUM_MISMATCH`, `DUPLICATE_TAG`, `BAD_AMOUNT`, `BAD_TAG`, `BAD_VALUE`.
- One browser bundle for plain `<script src>` pages, no bundler required:
  `dist/deshiqr.global.js` → `window.DeshiQR` with `update` and `validate`. Served by jsDelivr/unpkg
  through npm and mirrored on GitHub Pages by `.github/workflows/pages.yml`;
  `scripts/check-globals.mjs` pins its behaviour in a browser-only sandbox.
- `python/` — zero-dependency Python 3.9+ package (`pip install deshiqr`) with the same two functions,
  the same edit keys (camelCase aliases stay camelCase), the same error/warning codes, dataclass
  options (`UpdateOptions`, `ValidateOptions`), `DeshiQrError`/`.code`, an `unittest` suite and PyPI
  trusted-publishing workflow.
- Documentation for the single purpose: `README.md`, [`docs/format.md`](./docs/format.md) (the full
  field table, checksum rule, worked edit), [`docs/api.md`](./docs/api.md) (functions, edit rules,
  warning/error codes), [`docs/self-hosting.md`](./docs/self-hosting.md) (GitHub Pages hosting),
  [`docs/demo-payloads.md`](./docs/demo-payloads.md), and one example per platform in
  [`examples`](./examples) (browser, Node, Python) plus the [`cdn`](./cdn) demo page.
- CI (typecheck, build, tests, browser-bundle check, Python 3.9 + 3.13) and release pipelines: npm
  with provenance for the single `deshiqr` package (`release.yml`), PyPI via trusted publishing
  (`release-python.yml`), and GitHub Pages browser-bundle publishing (`pages.yml`, on push to `main`).
- Provider-agnostic editing by construction: only the tags the caller edits, tag `01` (for amount
  edits) and the re-sealed checksum change; everything else — account template, name, city, currency,
  country, opaque token templates — is byte-identical. Pinned by tests on a synthetic non-bKash
  layout in both languages.

### Changed

- Final product scope is the payload editor only. There is no QR encoding or rendering, no web
  component, no payload reading/verification helpers, no reference generation, and no database or
  payment tooling. Render the returned payload with your own QR library.

### Security

- No real merchant data is committed anywhere; all fixtures are synthetic (account `01000000000`,
  `DEMO STORE`, dummy NPSB tokens).
- Edits are at the caller's risk: changing the account, institution or merchant name can mislead
  payers, so `update` surfaces a `RISKY_EDIT` warning; only edit payloads you own. Payloads are public
  data, but a swapped payload is a scam — verify where a payload came from.
- deshiQR does not take custody of funds, hold balances, route money, or act as a payment service
  provider. It does not confirm payments: a QR is an instruction to pay, not proof that money moved.



