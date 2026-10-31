# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-11-01

First public release. Early, usable, honest.

### Added

- `deshiqr` — dependency-free Bangla QR payload library: strict TLV parse, CRC-16/CCITT-FALSE
  verify, `decode`/`decodeSafe`, `validate` with errors + warnings, `toStatic`, `withAmount`, `build`,
  reference generation, amount formatting and account masking.
  - Verified against real bKash payload shapes (25-character bill number in tag 62/01, NPSB account
    template, opaque tags 80/81 preserved verbatim).
  - 75 tests, including corruption, oversized, malformed and unknown-provider cases.
- `deshiqr-qr` — dependency-free QR Code encoder (versions 1–40, EC levels L/M/Q/H, automatic version
  and mask selection) with SVG, path and terminal renderers. Cross-checked against an independent
  encoder and decoded back with jsQR.
- `deshiqr-element` — `<deshiqr-pay>` web component (ESM + IIFE) with amount presets, references,
  theming, events, PNG download, and no network requirement when given a payload.
- `@deshiqr/web` — static-first Vite app: landing page, setup wizard (paste payload or decode a QR
  screenshot), hosted pay pages (`/p/:slug`, `/@:slug`), self-contained links with no backend,
  invoice pages, printable A4 posters, embed snippets, Supabase magic-link dashboard, and a
  local/demo mode.
- `supabase/` — schema with CRC-validating constraints, RLS policies, public read views, invoice
  claiming RPC, rate-limit helper, seed data, and the `invoice` edge function (create/read/claim).
- Provider support matrix: bKash decoding **verified**; Nagad, Rocket and bank Bangla QR **planned**
  (parser is provider-agnostic but support is not claimed until real payloads are tested).
- Documentation: payload format, embedding guide, invoice API, self-hosting (Supabase + Netlify),
  security/threat model, roadmap.
- CI (typecheck, build, tests, SQL/RLS verification), GitHub Pages demo deployment, and an npm release
  workflow with provenance.

### Security

- No real merchant data is committed anywhere; all fixtures are synthetic.
- deshiQR does not take custody of funds and is not a payment service provider.
- Payment confirmation is manual in this release. bKash merchant API integration (or a licensed
  gateway) is on the roadmap.

[0.1.0]: https://github.com/hello2himel/deshiQR/releases/tag/v0.1.0
