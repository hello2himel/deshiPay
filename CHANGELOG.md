# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-11-01

First public release. One job: a merchant's Bangla QR payload + an amount → the dynamic payload and
the QR. Early, usable, honest.

### Added

- `deshiqr` — one dependency-free npm package at `packages/deshiqr` covering the whole JavaScript
  surface:
  - **Payload library** (main entry): strict TLV parse, CRC-16/CCITT-FALSE verify, `decode` /
    `decodeSafe`, `validate` with errors + warnings, `toStatic`, `withAmount`, `build`, reference
    generation, amount formatting and account masking.
  - **QR encoder + renderers** (main entry): QR Code encoder (ISO/IEC 18004, versions 1–40, EC levels
    L/M/Q/H, automatic version and mask selection) with self-contained SVG, SVG path and terminal
    renderers. Cross-checked against an independent encoder and decoded back with jsQR.
  - **`<deshiqr-pay>` web component** at the `deshiqr/element` subpath: amount presets, references,
    theming, events, PNG download, and no network requirement when given a payload. The main entry
    stays pure — importing `deshiqr` has no DOM side effects.
  - Verified against real bKash payload shapes (25-character bill number in tag 62/01, NPSB account
    template, opaque tags 80/81 preserved verbatim), including corruption, oversized, malformed and
    unknown-provider cases.
- One browser bundle for plain `<script src>` pages, no bundler required:
  `dist/deshiqr.global.js` → `window.DeshiQR`, exposing the payload library, the QR encoder/renderers
  and a working `<deshiqr-pay>` (registered automatically). Served by jsDelivr/unpkg through npm and
  mirrored on GitHub Pages by `.github/workflows/cdn.yml` for use without npm.
  `scripts/check-globals.mjs` pins its behaviour in a browser-only sandbox.
- `python/` — zero-dependency Python 3.9+ port of the payload library (`pip install deshiqr`):
  `decode`, `with_amount`, `build`, `to_static`, `new_reference`, `validate`, the same error codes and
  derivation rules, with a stdlib `unittest` suite and PyPI trusted-publishing workflow. The Python
  package is payload-only: render the QR with `segno`/`qrcode` or the HTTP API.
- `qr` edge function — **the amount→QR API**: `POST` a merchant's Bangla QR payload + an amount and get
  the dynamic payload and QR SVG back. Stateless (no database, no secrets, no merchant lookup), generic
  TLV + CRC validation only, so it works with any provider. The provider-agnostic guarantee (only tag
  `01`, `54`, the checksum and an optional `62/01` reference change; everything else is byte-identical)
  is pinned by tests on a synthetic non-bKash layout in the library, the edge function and the Python
  port; `pnpm check:qr-api` runs them in CI.
- Documentation for the single purpose: `README.md`, `docs/amount-qr.md` (contract, checkout and
  donation snippets, error codes, deploy), `docs/embedding.md` (library, web component, HTTP API),
  `docs/format.md`, `docs/architecture.md`, `docs/self-hosting.md` (deploy the `qr` function only),
  `docs/demo-payloads.md`, `python/README.md`, and examples including `examples/checkout.html`.
- CI (typecheck, build, tests, browser-bundle checks, amount→QR API logic, Python 3.9 + 3.13) and
  release pipelines: npm with provenance for the single `deshiqr` package (`release.yml`), PyPI via
  trusted publishing (`release-python.yml`), and GitHub Pages browser-bundle publishing (`cdn.yml`).
- Provider stance: bKash decoding **verified**; Nagad, Rocket and bank Bangla QR **planned** (the
  parser is provider-agnostic but support is not asserted until real payloads are tested).

### Security

- No real merchant data is committed anywhere; all fixtures are synthetic (account `01000000000`,
  `DEMO STORE`, dummy NPSB tokens).
- deshiQR edits payloads only. It does not take custody of funds, hold balances, route money, or act
  as a payment service provider.
- No payment confirmation in this release: a QR is an instruction to pay, not proof that money moved.
  Provider APIs (or manual reconciliation in your own system) remain the confirmation path.

[0.1.0]: https://github.com/hello2himel/deshiQR/releases/tag/v0.1.0
