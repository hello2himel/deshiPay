# Contributing to deshiQR

Thanks for helping. This repo has one hard rule, a few conventions, and one invariant that must not
regress.

## The hard rule: no real payment data

Never commit a real QR payload, account number, name, NPSB token or merchant screenshot. The QR
payload is public in the physical world, but it is still someone's phone number and name, and this
repo is public.

When you need a new fixture:

1. Start from the structure in [`docs/format.md`](./docs/format.md).
2. Replace the account with `01000000000` (an unassignable operator prefix).
3. Replace name/city with `DEMO STORE` / `Dhaka`.
4. Replace NPSB tokens (tags 80/81) with a base64 string that literally says `deshiqr dummy ...`.
5. Recompute the CRC-16 with the library (`seal()` from `packages/deshiqr/src/core/build.ts`, or the
   payloads in [`docs/demo-payloads.md`](./docs/demo-payloads.md)).
6. Add a test that pins the behaviour, not just the bytes.

The canonical synthetic payloads live in [`docs/demo-payloads.md`](./docs/demo-payloads.md) and
`packages/deshiqr/test/core/fixtures.ts`.

## Setup

Requirements: Node >= 22.18, pnpm 12. Python >= 3.9 for the Python package.

```sh
pnpm install
pnpm build          # the single npm package (payload + QR + element) and the browser bundle
pnpm test           # builds, then runs the payload, QR and element test suites
pnpm typecheck
pnpm check:globals  # verifies the <script src> bundle after a build
pnpm check:qr-api   # tests the stateless amount→QR edge function logic

cd python && python3 -m unittest discover -s tests -v   # Python port
```

`pnpm format` runs Prettier (printWidth 110) over the repo.

The repo ships libraries, an element and one HTTP endpoint; there is nothing else to run. To exercise
the HTTP API, deploy the `qr` function as described in
[`docs/self-hosting.md`](./docs/self-hosting.md).

## Repository conventions

- **One npm package, one Python package.** Everything JavaScript/TypeScript ships from
  `packages/deshiqr` as `deshiqr`: the payload library and QR encoder/renderers in the main entry
  (`src/core`, `src/qr`), the `<deshiqr-pay>` web component behind the `deshiqr/element` subpath
  (`src/element`), and one IIFE browser bundle (`src/global.ts` → `dist/deshiqr.global.js`, global
  `DeshiQR`). Do not add a second public package name.
- `deshiqr` has **zero runtime dependencies** in both languages. Don't add one without discussing it
  in an issue first.
- The main entry must stay pure — no DOM access, no element registration, no network — so it can run in
  Node, Deno, workers and edge functions. DOM work belongs in `src/element`.
- `python/` is a zero-dependency port of `src/core`. Behaviour changes must land in both, with the
  TypeScript package as the source of truth.
- TypeScript strict mode; relative imports use explicit `.ts` extensions. Node runs and tests TS
  directly, bundlers rewrite on publish.
- Tests use `node:test` + `node:assert/strict` (Python: `unittest`). No test framework. Tests live in
  `packages/deshiqr/test/{core,qr,element}/`.
- Edge functions live in `supabase/functions/<name>/`. Keep request-independent logic in a `*-core.ts`
  module with no Deno globals, so it can be tested with `node --test` (the `qr` function:
  `qr-core.ts` + `qr-core.test.mts`). Vendored library copies come from `pnpm vendor:edge`;
  regenerate and commit them whenever `src/core` or `src/qr` changes.
- **The amount→QR path is provider-agnostic by contract:** only tag `01`, `54` and the checksum (plus
  an optional `62/01` reference) may change. If a change would require provider-specific logic, keep it
  in decode/validate, not in derivation, and re-pin the guarantee with
  `packages/deshiqr/test/core/provider-agnostic.test.ts` (the synthetic non-bKash layout).
- Public copy must stay honest: **bKash decoding is verified today; other Bangla QR providers are
  planned/unverified.** Never assert a provider is supported without sanitised fixtures from it.

## Adding a provider

1. Get a real payload from that provider and **sanitise it** as described above.
2. Add it to `docs/demo-payloads.md`, `packages/deshiqr/test/core/fixtures.ts`, and a decode test.
3. If the provider uses a different institution AID (tag 26/00), add it to `KNOWN_INSTITUTIONS` in
   `packages/deshiqr/src/core/decode.ts` and set `verified: true` only once the tests cover it.
4. Update the provider table in [`README.md`](./README.md#provider-agnostic-by-design) and
   [`docs/architecture.md`](./docs/architecture.md#provider-stance).
5. Keep the wording precise: "scan & pay with any Bangla QR app" is a property of the format;
   "decode support" is what we assert for providers we have tested.

## Before opening a PR

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (payload, QR and element suites — 144 tests today)
- [ ] `pnpm build` passes
- [ ] `pnpm check:globals` passes if you touched `packages/deshiqr` (it runs after a build)
- [ ] `pnpm check:qr-api` passes if you touched `supabase/functions/qr/` or derivation
- [ ] `pnpm vendor:edge` was re-run and committed if `src/core` or `src/qr` changed
- [ ] `cd python && python3 -m unittest discover -s tests -v` passes if you touched `python/`
- [ ] No real payment data anywhere in the diff
- [ ] If public behaviour changed, update `README.md`, `docs/`, and `CHANGELOG.md`

## Releases

Maintainers only. Update the version in `packages/deshiqr/package.json` and `python/pyproject.toml`
(keep `VERSION` in `packages/deshiqr/src/core/index.ts` in sync), commit, then push a tag:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

The tag triggers three workflows:

- `release.yml` — publishes the single npm package `deshiqr` with provenance (needs the `NPM_TOKEN`
  repository secret).
- `release-python.yml` — builds and publishes the Python package to PyPI using trusted publishing
  (configure the PyPI project's trusted publisher for this repo, environment `pypi`).
- `cdn.yml` — publishes `dist/deshiqr.global.js` to GitHub Pages so the `<script src>` URL resolves
  (enable Pages with "GitHub Actions" as the source once).

## Code of conduct

Be decent. Harassment, scams, or contributions that help impersonate merchants are not welcome.
