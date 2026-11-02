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

- **Donate to DeshiPay page and links.** New `/deshipay` page (also in the sitemap) shows the DeshiPay
  donation methods: the Dutch-Bangla Bank details (Himel Das, 1251070048232, Bogura branch, routing
  090100378, SWIFT DBBLBDDH), bKash and Nagad personal numbers (01868 735269), and the DeshiPay Bangla
  QR. It uses the same PayView copy rows/How-to-pay layout without needing Supabase. “Donate” is now in
  the site nav and “Donate to DeshiPay” in the site-wide footer, plus the dashboard top actions.

### Added

- **Payments tab in the dashboard.** A published page now has a Payments tab with a **locked amount**
  (`?amount=`), a **preferred amount** (`?preferred=`, prefilled but editable on the customer page), and
  open/copy actions for each link. It also exports the A4/A5 poster with the set amount baked into the
  QR, so scanning opens the app at that amount; the amount is printed on the poster. Amounts are capped
  at ৳50,000. e2e covers the tab, both links, the editable `?preferred` page and decoding the
  amount-specific poster QR back to ৳750 (233 checks).

### Added

- **Printable A4/A5 poster.** The dashboard's Share tab and the no-account Download step now offer a
  self-contained SVG poster in A4 or A5 portrait, with Download and Print / Save as PDF. It uses the
  owner's static Bangla QR (not the page URL) and the site's branding/type, plus Google Play icons for
  bKash, Nagad, Rocket, upay, Citytouch, BRAC Bank Astha, EBL Skybanking, NexusPay and MTB Neo, and the
  Bangla QR mark; logos are embedded and attributed. e2e checks both formats, the preview, and decodes
  the poster QR to prove it is the merchant's amount-free payload (223 checks).

### Added

- **Tab deep links for payment pages.** Like the amount lock, a customer page can open on a chosen
  method tab: `/<username>?method=wallet`, `?method=bank` or `?method=qr` (combine with
  `?amount=500&method=bank`). The same works for downloaded standalone pages. Switching tabs updates the
  URL with `method` (removed on Scan QR) so the current view can be copied and shared; invalid or
  unavailable methods fall back to the first available tab. e2e covers wallet/bank deep links, the
  combination with a locked amount, and URL sync (200 checks).

### Added

- **Automatic push of auth config + email templates.** Added
  `.github/workflows/supabase-auth-config.yml`: once the repository has a `SUPABASE_ACCESS_TOKEN`
  secret, changes to `supabase/config.toml` or `supabase/templates/**` run `supabase config push`
  against production, applying email confirmations, OTP settings, auth URLs and the branded mail
  templates. Without the secret the job is a no-op; the GitHub integration alone only applies
  migrations.

### Added

- **Email + password sign-up verified by an emailed 6-digit code.** The unified `/login` form keeps
  email + password (existing accounts sign in), but a new account is created as unconfirmed and the
  card switches to a code screen; `verifyOtp(type: "signup")` confirms it and signs in. "Forgot
  password?" now sends a recovery **code**, verifies it, then shows a "choose a new password" step
  (`updateUser`) before signing in. Resend/change-email actions are included, with friendly expired
  or wrong-code messages.
- **Branded Supabase email templates.** `supabase/templates/` has confirmation, recovery, magic link,
  email change, invite and reauthentication emails in the site's design (green `#056B4E`, rounded white
  card, code box, "not a payment processor" footer). `config.toml` enables confirmations, sets
  `otp_length = 6` / `otp_expiry = 600`, and wires the subjects/content paths for local and production;
  `docs/website.md` explains applying them to the hosted project.

### Added

- **Create a page without login.** The login/signup card now has a persistent "No account needed? Create
  a page without login" link. It opens `/app?local=1`, which forces the same account-free wizard the
  paused-backend offline mode uses (name → QR → wallet/bank → look → Download, no username, no Supabase
  calls), labelled "No account" in the dashboard. The real offline fallback keeps working exactly as
  before for signed-out visitors.

### Added

- **Avatar icons instead of just the first letter.** The Look step of onboarding (and the dashboard's
  Look tab) now has an avatar picker: "your initials" or ~40 hand-drawn line icons (shop, bag, coffee,
  camera, mic, palette, bike, and so on). The choice is saved as `profiles.avatar` (new migration) and
  returned by `get_public_page()`, shown in the live preview, on the customer page and in downloaded
  standalone pages (which now also inline `js/avatars.js`). Existing pages fall back to the monogram.
  The picker is a radio group with 46px tap targets and scrolls on small screens; export tests and
  e2e cover it.

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

- **“No commission, no cut” is now a site-wide trust point.** Added it to the hero descriptive copy
  (“We’re not a payment processor. We never touch the money and take no cut or commission.”), renamed the money feature card, updated the
  cost FAQ, contact and terms copy, added the line to every footer, and added it to the PayView caution
  on customer/donate pages.

### Changed

- **Home hero demo and /deshipay share one data source.** Both now render `deshipay-data.js`, so the
  live hero demo and the donation page show the same name, message, theme, quick amounts, Bangla QR,
  bKash/Nagad numbers and DBBL bank details. The hero demo is therefore back to QR + Wallet + Bank with
  the real DeshiPay accounts.

### Changed

- **Works-with strip in the hero and below How to pay; PayView QR icons removed.** The app marks sit
  under the home hero buttons, and on payment pages in a “Works with … and any bank app” strip directly
  below How to pay (including the donate page). The strip is bKash, Nagad, Rocket, upay, Citytouch, BRAC Bank Astha,
  EBL Skybanking and MTB Neo; all use the same rounded app tiles.
  Removed the 5×2 app-icon grid from under the QR; the A5 poster generated from a payment page still
  includes the icons.

### Changed

- **Richer home hero.** The hero now has a secondary “See a live page” jump link, a “Works with” strip of
  official app marks, and no longer forces an empty full viewport on phones, so the live payment demo
  peeks into the first screen. Desktop keeps the full-height split with the demo card beside the copy.

### Changed

- **Homepage live demo now uses DeshiPay’s own details.** The hero PayView demo is titled DeshiPay and its
  bank tab shows the real Dutch-Bangla Bank account (Himel Das, 1251070048232, Bogura, routing 090100378,
  SWIFT DBBLBDDH); the dummy wallet numbers were removed, leaving the live QR and bank method. The demo
  still starts at ৳1,500 and remains fully interactive.

### Changed

- **“Save A5 poster” on the payment page.** The button below the QR now renders the current payment
  page as the A5 print poster and downloads it as a 300 dpi PNG (1748×2480), instead of saving a bare QR
  image. It includes the amount-specific QR/headline when an amount is set, the supported app icons, and
  the full footer; static pages keep the amount-free QR. Exports carry `poster.js` so standalone pages
  can do the same.

### Changed

- **Report abuse beside the payment-page CTA.** The customer page footer now shows a “Report abuse”
  button next to “Create your own page”, pre-addressed to the contact email with the page username in
  the subject; the actions wrap on narrow screens.

### Changed

- **Supported app icons under the customer QR.** The payment page now shows the ten supported app marks
  (bKash, Nagad, Rocket, upay, Citytouch, BRAC Bank Astha, EBL Skybanking, NexusPay, MTB Neo, Bangla QR)
  below the QR, in the same rounded/bare treatment as the poster. The compact `pay-icons.js` asset is
  loaded by live pages and embedded in standalone exports, so downloaded pages carry the icons too.
  e2e checks all ten icons and the three unrounded marks.

### Changed

- **Amount inputs are capped at ৳50,000.** Customer-page amount fields, quick amounts, `?amount=` locks and
  the dashboard's "link with an amount" all enforce a ৳50,000 ceiling (the QR engine can still carry more,
  but the product policy is 50k). Above it: a clear "above the page limit" message, the static QR stays
  visible, quick amounts over the cap are hidden, presets over the cap are dropped, and an over-limit
  `?amount=` link opens normally instead of locking. e2e checks the refusal (202 checks).

### Changed

- **QR blur-in on every refresh.** The "develop" blur/fade animation (previously only on the first QR
  draw) now replays whenever the QR is rebuilt: typing an amount, tapping a quick amount, clearing the
  amount back to the static QR, or any other redraw. Reduced-motion users still get the QR without the
  animation.

### Changed

- **Empty amount shows the static QR.** On a payment page (or standalone export) with no amount entered, the
  QR panel now renders the owner's amount-free Bangla QR instead of an empty placeholder, with the note
  "No amount set. Scan this QR and type the amount in your payment app, or enter one above for a
  ready-made QR." Typing an amount (or tapping a quick amount) still swaps in the amount-bearing QR;
  Save QR image works for the static QR too. e2e decodes both states (194 checks).

### Changed

- **Dashboard action bar sits under the form.** The fixed bottom bar (Back / Continue / Publish) is now
  in normal flow inside the form column, directly below the panel, with the site footer underneath it.
  No more empty fixed-bar padding or footer appearing above the buttons; mobile and desktop both put the
  actions immediately after the form fields. e2e asserts the bar is in flow and below the panel.

### Changed

- **One sign-in / sign-up form.** `/login` no longer has separate signup and signin modes. A single
  email + password form (with "Continue") first tries to sign in; if the credentials are invalid it
  tries to create the account, so new visitors are signed up and returning visitors are signed in
  without choosing a mode. An existing email with the wrong password gets a clear "that email and
  password don’t match" message plus the "Forgot password?" link; the no-login flow stays below.

### Changed

- **New DeshiPay mark everywhere.** The supplied rounded-tile mark (white cut-out shape) replaces the old
  drawn square in the header on every page, the footer brand, the pay-page header, the customer-page
  "Made with DeshiPay" line and the favicon; standalone exports get it too. It is recoloured to the
  site's accessible brand green (light `#056B4E`, dark `#34D6A4`, with the on-accent colour for the
  cut-out) instead of the raw `#00C060`, whose white-on-green is only ~1.95:1. The shape is untouched;
  the accent-derived fill keeps it consistent with buttons, links and the theme system. The assets are
  also available as `site/public/mark.svg` (tile) and `mark-square.svg`.

### Changed

- **Look step uses picker rows + sheets.** Avatar, colour and quick amounts are now compact rows that
  always show the current choice (e.g. "Avatar · Shop", "Colour · Coffee", "Quick amounts ·
  100, 500, 1000, 5000"). Tapping a row opens a modal sheet with the full list (or the quick-amount
  editor): a proper `role="dialog"` with `aria-modal`, Escape/overlay close and focus returned to the
  row; on phones it becomes a bottom sheet. The lists are no longer permanently on the page.

### Changed

- **Full-height homepage hero.** The first landing section (hero copy/CTA and the live demo) now fills
  at least `100svh` minus the sticky nav height (`100vh` fallback), with its content vertically centred
  and the demo aligned to it, so the first screen is a complete hero instead of a short strip. The
  points/features continue below the fold. Mobile and desktop are both covered by e2e height checks.

### Changed

- **Reserved usernames expanded from 68 to 216.** The list now also protects route/anchor names
  (`features`, `faq`, `demo`, `login`, `checkout`...), auth/system words, support/moderation/reporting
  addresses (`abuse`, `report`, `dmca`, `trust-safety`...), platform/brand variants
  (`deshipay`, `deshi-pay`, `deshi-qr`, `takaqr`...), payment providers (`bkash`, `nagad`, `rocket`,
  `upay`, `paypal`, `stripe`, `visa`, ...) and local bank names, so they cannot be used to impersonate
  a route or a brand. A new migration recreates `is_reserved_username()` for existing projects, and
  `site/tests/reserved.test.js` (now in CI) fails if the site's `RESERVED` and the database list drift.

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



