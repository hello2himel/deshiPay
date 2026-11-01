# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The deshiQR website** — [`site/`](./site/), deployed at <https://deshiqr.netlify.app>: payment
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

### Fixed

- **UTF-8 byte-length TLV support (real Bangla QR payloads).** EMVCo/NPSB payloads count each field's
  `LL` length in UTF-8 bytes, so payloads with non-ASCII values — a Bangla merchant name in tag `59`,
  a Bangla city in `60` — used to fail with `MISSING_FIELD`/`BAD_TLV`. The engine now parses by byte
  offsets (`TextEncoder`/`TextDecoder`), accepts and preserves byte-counted payloads, and still
  auto-detects and round-trips legacy character-counted payloads. Lengths, nested templates (`26`,
  `62`), duplicate-tag checks and the 99-unit field limit all use the detected unit; `update()` writes
  back with the same unit, and all-ASCII payloads are byte-identical to before. Mirrored in the
  Python package. See [`docs/format.md`](./docs/format.md#encoding).

## [0.1.0] — 2026-11-01

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

[0.1.0]: https://github.com/hello2himel/deshiQR/releases/tag/v0.1.0
[Unreleased]: https://github.com/hello2himel/deshiQR/compare/v0.1.0...HEAD
