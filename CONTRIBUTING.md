# Contributing to deshiQR

Thanks for helping. This repo has one hard rule and a few conventions.

## The hard rule: no real payment data

Never commit a real QR payload, account number, name, NPSB token or merchant screenshot. The QR
payload is public in the physical world, but it is still someone's phone number and name, and this
repo is public.

When you need a new fixture:

1. Start from the structure in [`docs/format.md`](./docs/format.md).
2. Replace the account with `01000000000` (an unassignable operator prefix).
3. Replace name/city with `DEMO STORE` / `Dhaka`.
4. Replace NPSB tokens (tags 80/81) with a base64 string that literally says `deshiqr dummy ...`.
5. Recompute the CRC-16 with the library (`seal()` from `packages/core/src/build.ts` or the helpers in
   `docs/demo-payloads.md`).
6. Add a test that pins the behaviour, not just the bytes.

The canonical synthetic payloads live in [`docs/demo-payloads.md`](./docs/demo-payloads.md) and
`packages/core/test/fixtures.ts`.

## Setup

Requirements: Node >= 22.18, pnpm 12.

```sh
pnpm install
pnpm dev        # web app on http://localhost:5173
pnpm build      # packages + element + web app
pnpm test       # builds libraries, then runs every package's tests
pnpm typecheck
```

The web app runs in local/demo mode with no backend. To exercise Supabase features, copy the env vars
described in [`docs/self-hosting.md`](./docs/self-hosting.md).

## Repository conventions

- TypeScript strict mode; relative imports use explicit `.ts` extensions. Node runs and tests TS
  directly, bundlers rewrite on publish.
- `deshiqr`, `deshiqr-qr` and `deshiqr-element` have **zero runtime dependencies**. Don't add one
  without discussing it in an issue first.
- Tests use `node:test` + `node:assert/strict`. No test framework.
- Publishing is ESM + CJS + `.d.ts` via `tsup`. Source of truth is `src/`.
- UI copy must stay honest: **bKash decoding is verified today; other Bangla QR providers are
  planned/unverified.** Never claim a provider is supported without sanitised fixtures from it.

## Adding a provider

1. Get a real payload from that provider and **sanitise it** as described above.
2. Add it to `docs/demo-payloads.md`, `packages/core/test/fixtures.ts`, and a decode test.
3. If the provider uses a different institution AID (tag 26/00), add it to `KNOWN_INSTITUTIONS` in
   `packages/core/src/decode.ts` and set `verified: true` only once the tests cover it.
4. Update the provider matrix in `README.md` and `docs/architecture.md`, and the support note in the
   web app.
5. Keep the wording precise: "scan & pay with any Bangla QR app" is a property of the format;
   "decode/derive support" is what we claim for providers we've tested.

## Before opening a PR

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (core: 75+, qr: round-trip + cross-check, web: pure logic)
- [ ] `pnpm build` passes
- [ ] `node scripts/check-sql.mjs` passes if you touched SQL
- [ ] No real payment data anywhere in the diff
- [ ] If the public behaviour changed, update `README.md`, `docs/`, and `CHANGELOG.md`

## Releases

Maintainers only. Update versions, commit, then push a tag:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

The release workflow publishes `deshiqr`, `deshiqr-qr` and `deshiqr-element` to npm with provenance.
It requires the `NPM_TOKEN` repository secret. The demo app redeploys to GitHub Pages on every push
to `main`.

## Code of conduct

Be decent. Harassment, scams, or contributions that help impersonate merchants are not welcome.
