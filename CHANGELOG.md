# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  through npm and mirrored on GitHub Pages by `.github/workflows/cdn.yml`;
  `scripts/check-globals.mjs` pins its behaviour in a browser-only sandbox.
- `python/` — zero-dependency Python 3.9+ package (`pip install deshiqr`) with the same two functions,
  the same edit keys (camelCase aliases stay camelCase), the same error/warning codes, dataclass
  options (`UpdateOptions`, `ValidateOptions`), `DeshiQrError`/`.code`, an `unittest` suite and PyPI
  trusted-publishing workflow.
- `update` edge function — the stateless HTTP API: `POST /functions/v1/update` with
  `{ payload, edits?, warnings? }` → `{ ok: true, payload, warnings }`, or
  `{ ok: false, error: { code, message, tag? } }`. No database, no secrets, CORS `*` by default
  (`DESHIQR_CORS_ORIGIN`), 16 KB request-body limit. `pnpm check:api` runs its request-independent
  tests.
- Documentation for the single purpose: `README.md`, [`docs/format.md`](./docs/format.md) (the full
  field table, checksum rule, worked edit), [`docs/api.md`](./docs/api.md) (functions, edit rules,
  warning/error codes, HTTP contract), [`docs/self-hosting.md`](./docs/self-hosting.md),
  [`docs/demo-payloads.md`](./docs/demo-payloads.md), and one example per platform in
  [`examples`](./examples) (browser, Node, Python, `curl`) plus the [`cdn`](./cdn) demo page.
- CI (typecheck, build, tests, browser-bundle check, HTTP-function logic, Python 3.9 + 3.13) and
  release pipelines: npm with provenance for the single `deshiqr` package (`release.yml`), PyPI via
  trusted publishing (`release-python.yml`), and GitHub Pages browser-bundle publishing (`cdn.yml`).
- Provider-agnostic editing by construction: only the tags the caller edits, tag `01` (for amount
  edits) and the re-sealed checksum change; everything else — account template, name, city, currency,
  country, opaque token templates — is byte-identical. Pinned by tests on a synthetic non-bKash
  layout in both languages and the HTTP function.

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
