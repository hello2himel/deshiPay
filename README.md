# deshiQR

**Bangla QR payment payloads, made boring.** Parse, verify, derive and embed the QR format used by
bKash and other Bangla QR apps — with a static-first web app on top.

[![CI](https://github.com/hello2himel/deshiQR/actions/workflows/ci.yml/badge.svg)](https://github.com/hello2himel/deshiQR/actions/workflows/ci.yml)
[![npm: deshiqr](https://img.shields.io/npm/v/deshiqr?label=deshiqr)](https://www.npmjs.com/package/deshiqr)
[![npm: deshiqr-qr](https://img.shields.io/npm/v/deshiqr-qr?label=deshiqr-qr)](https://www.npmjs.com/package/deshiqr-qr)
[![npm: deshiqr-element](https://img.shields.io/npm/v/deshiqr-element?label=deshiqr-element)](https://www.npmjs.com/package/deshiqr-element)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Demo](https://img.shields.io/badge/demo-hello2himel.github.io%2FdeshiQR-7c3aed)](https://hello2himel.github.io/deshiQR/)

A bKash personal QR is an **EMVCo-style TLV payload** (the NPSB "Bangla QR" scheme). To turn it into a
payment page with an amount, a reference, and a printable poster, you only need to edit two fields
and re-seal the checksum. deshiQR does exactly that — in a few hundred lines of dependency-free TypeScript — and
then gives you the hosted pages, the embeddable widget, the invoice API and the database schema to
run it for many merchants.

```
00020101021226…5204601653030505802BD5909…6206…63041A2B
│ │ │   │     │  │     │  │     │    └─ CRC-16/CCITT-FALSE
│ │ │   │     │  │     │  │     └────── merchant name, city
│ │ │   │     │  │     │  └──────────── BDT, BD
│ │ │   │     │  └───────────────────── NPSB account template
│ │ │   └───────────────────────────── static (11) / dynamic (12)
└─┴─────────────────────────────────── format version
```

## Provider support

Every QR deshiQR builds is a standard **Bangla QR** payload, so it can be paid from **any app that
accepts Bangla QR**. Decoding and derivation are verified against real payloads for one provider
today; the parser is provider-agnostic, but we do not claim support we have not tested.

| Provider | Scan & pay a deshiQR QR | Decode / derive in deshiQR | Notes |
| --- | --- | --- | --- |
| bKash | Yes | **Verified today** | Tested against real bKash QRs |
| Nagad | Yes, if the app accepts Bangla QR | Planned | Waiting on real sample payloads |
| Rocket | Yes, if the app accepts Bangla QR | Planned | Waiting on real sample payloads |
| Bank / NPSB apps | Yes, if the app accepts Bangla QR | Planned | Shared `bd.org.bb.npsb` template |
| Other Bangla QR wallets | Depends on the app | Planned | Generic parser, unverified |

"Verified" means real payloads from that provider are decoded and pinned by tests. Adding a provider
means adding sanitised fixtures — see [`docs/demo-payloads.md`](./docs/demo-payloads.md) and
[CONTRIBUTING.md](./CONTRIBUTING.md).

## What it is / what it is not

**Is:** a payload toolkit, a static web app for pay pages and posters, an embeddable web component, a
Supabase schema with RLS, and an invoice edge function for per-order amounts.

**Is not:** a payment processor. deshiQR never takes custody of funds, never routes money, and does
not confirm that a customer actually paid. It is not connected to bKash's merchant API. The honest
confirmation path is manual (merchant marks an invoice paid in the dashboard); see the
[roadmap](./docs/roadmap.md) for the upgrade path. Being a payment service provider in Bangladesh
requires a licence — read [SECURITY.md](./SECURITY.md) before building a business on top.

## Quick start

### 1. No code: make a payment page

Open the [demo app](https://hello2himel.github.io/deshiQR/) → **Set up** → drop a screenshot of your
bKash QR (or paste the payload text) → add a title, quick amounts and a note → get a shareable link, a
printable A4 poster and an embed snippet. The link works with no account and no backend; the QR is
generated in the browser.

### 2. Embed the part you need

```sh
npm install deshiqr        # payload library, zero dependencies
npm install deshiqr-qr     # optional: QR encoder + SVG/terminal renderer
npm install deshiqr-element # optional: <deshiqr-pay> web component
```

```ts
import { decode, withAmount, newReference, formatTaka } from "deshiqr";

const qr = decode(basePayload);                 // verifies CRC + required fields
const payload = withAmount(qr.payload, 500, {
  reference: newReference({ prefix: "FT80" }),
});

formatTaka(500);                                // "৳500"
qr.merchant.name;                               // name exactly as issued
```

```html
<script type="module" src="https://unpkg.com/deshiqr-element"></script>

<deshiqr-pay
  payload="00020101021126…"
  title="Demo Store"
  note="Pay before 6pm"
  presets="100,500,1000"
></deshiqr-pay>
```

See [docs/embedding.md](./docs/embedding.md) for the element attributes, events, methods and the
invoice API, and [docs/format.md](./docs/format.md) for the payload specification.

### 3. Self-host the full thing

Static web app + Supabase (optional, for accounts, hosted merchant pages and invoices) + Netlify:

```sh
pnpm install
pnpm build          # packages + web app
pnpm dev            # local web app (demo mode, no backend needed)
pnpm test           # 100+ tests incl. QR round-trips and RLS checks
```

Follow [docs/self-hosting.md](./docs/self-hosting.md): create a Supabase project, apply
`supabase/schema.sql`, deploy the `invoice` function, then point Netlify at this repo with the two
`VITE_SUPABASE_*` env vars. Custom domains and wildcard subdomains are covered there too.

## Repository layout

| Path | What |
| --- | --- |
| [`packages/core`](./packages/core) | `deshiqr` — TLV parse, CRC verify, decode, derive payloads. Zero deps. |
| [`packages/qr`](./packages/qr) | `deshiqr-qr` — QR encoder (v1–40, L/M/Q/H, auto mask) + SVG/terminal renderers. Zero deps. |
| [`packages/element`](./packages/element) | `deshiqr-element` — `<deshiqr-pay>` custom element (ESM + IIFE bundle). |
| [`apps/web`](./apps/web) | `@deshiqr/web` — static Vite app: landing, setup wizard, pay pages, invoices, dashboard. |
| [`supabase`](./supabase) | Schema, RLS policies, seed data, `invoice` edge function. |
| [`examples`](./examples) | Vanilla HTML, React and Node/Express integrations. |
| [`docs`](./docs) | Format, embedding, API, self-hosting, security, roadmap, architecture. |

## Design decisions

- **No per-merchant builds.** The QR is a pure function of the stored static payload; it is computed
  in the browser. Deploying a site per signup buys nothing. Printable posters are generated on demand.
- **Static-first.** The web app runs with no backend in demo/local mode. Supabase is an upgrade, not
  a requirement. Nothing is rendered on a server, so hosting is free and fast.
- **Payloads are public data.** The account number is printed on shop walls; the payload is not a
  secret. Row Level Security still protects merchant accounts, drafts and invoices.
- **Never custody funds.** No wallets, no balances, no payout rails — just payloads.
- **Synthetic fixtures only.** No real merchant data in this repo, ever.

## Built with deshiQR

**Chanasta** — [github.com/hello2himel/chanasta](https://github.com/hello2himel/chanasta) — is the flagship
consumer of this engine: a Bangla-first "buy me a coffee" (চা + নাস্তা) where supporters send money
directly to a creator's own bKash/Nagad/Rocket/bank account. Chanasta displays payment info and stores
self-reported "I sent it" claims; it never processes or holds money. It vendors a pinned copy of
`deshiqr` + `deshiqr-qr` and is a good reference for building a product on top of this library.

The embeddable browser bundle is also published from this repo's Pages site until the npm release:
`https://hello2himel.github.io/deshiQR/element/deshiqr-element.global.js` (IIFE, global `DeshiQrElement`).

## Documentation

- [Payload format](./docs/format.md) — every tag, the checksum, how payloads are derived.
- [Embedding guide](./docs/embedding.md) — library, web component, REST invoice API.
- [HTTP API](./docs/api.md) — invoice creation/claim endpoints, errors, rate limits.
- [Self-hosting](./docs/self-hosting.md) — Supabase + Netlify, env vars, custom domains.
- [Security](./SECURITY.md) and [threat model](./docs/security.md) — impersonation, squatting, PSP rules.
- [Architecture & internal contract](./docs/architecture.md) — for contributors.
- [Roadmap](./docs/roadmap.md) — providers, payment confirmation, verification, domains.

## Status

`0.1.0` — early, usable, honest. bKash QR decoding is verified; hosted pages, embeds, invoices and
the schema are functional. What is deliberately not done yet: real payment confirmation, provider
verification beyond bKash, wildcard subdomain automation and merchant identity checks. See the
[roadmap](./docs/roadmap.md).

## License

[MIT](./LICENSE) © Himel Das. Not affiliated with bKash, Nagad, Rocket or NPSB.
