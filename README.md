# deshiQR

**One job: give it a merchant's Bangla QR payload and an amount, get back the dynamic payload and the
QR.** A Bangla QR (the NPSB/EMVCo format printed by bKash, bank apps and other Bangla QR apps) is an
EMVCo-style TLV payload; charging a specific amount means setting the amount field and re-sealing the
checksum. deshiQR does exactly that — as zero-dependency libraries for JavaScript/TypeScript and
Python, a `<deshiqr-pay>` web component, and a stateless HTTP endpoint. It never holds funds, stores
data, or confirms payments.

[![CI](https://github.com/hello2himel/deshiQR/actions/workflows/ci.yml/badge.svg)](https://github.com/hello2himel/deshiQR/actions/workflows/ci.yml)
[![npm: deshiqr](https://img.shields.io/npm/v/deshiqr?label=deshiqr)](https://www.npmjs.com/package/deshiqr)
[![PyPI: deshiqr](https://img.shields.io/pypi/v/deshiqr?label=deshiqr)](https://pypi.org/project/deshiqr/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

```
00020101021226…5204601653030505802BD5910DEMO STORE6005Dhaka62…6304F835
│ │ │   │     │  │     │  │     │  └─── CRC-16/CCITT-FALSE
│ │ │   │     │  │     │  │     └────── merchant name, city
│ │ │   │     │  │     │  └──────────── BDT, BD
│ │ │   │     │  └───────────────────── NPSB account template
│ │ │   └───────────────────────────── static (11) / dynamic (12)
└─┴─────────────────────────────────── format version
```

## The API: payload + amount → QR

One job, one call. The `qr` function is stateless — no database, no secrets, no merchant records:

```http
POST /functions/v1/qr
{"payload": "00020101021126…", "amount": 500}

200 {"ok": true, "payload": "00020101021226…", "amount": 500, "amountText": "500.00",
     "reference": null, "qr_svg": "<svg …>"}
```

Checkout page: send the cart total, show the returned `qr_svg`:

```js
const res = await fetch("https://<project-ref>.supabase.co/functions/v1/qr", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ payload: merchantPayload, amount: cartTotal }),
});
const { payload, qr_svg } = await res.json();
qrImage.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr_svg);
```

No backend wanted? The same steps run in the browser — the library does payload + QR in one package:

```js
import { withAmount, encode, toSvg } from "deshiqr";

const payload = withAmount(merchantPayload, 500); // dynamic payload
qrImage.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(toSvg(encode(payload)));
```

Donation / "pay anything" page: drop in the web component and let the visitor type the amount:

```html
<script src="https://cdn.jsdelivr.net/npm/deshiqr@0.1.0/dist/deshiqr.global.js"></script>
<deshiqr-pay payload="00020101021126…" title="Support us" note="Pay any amount"></deshiqr-pay>
```

Full request/response contract, error codes and deploy notes:
[docs/amount-qr.md](./docs/amount-qr.md).

## Provider-agnostic by design

Derivation edits only two fields — tag `01` (`11` static → `12` dynamic) and tag `54` (the amount) —
then re-seals the CRC. The account template `26` (provider AID, account id, any provider sub-tags),
MCC `52`, currency `53`, country `58`, merchant name `59`, city `60` and the opaque token templates
`80`/`81` are carried over **byte for byte**. bKash, Nagad, Rocket and bank/NPSB QRs all work the same
way: changing the amount never requires understanding the provider. Proven by a synthetic non-bKash
fixture in
[`provider-agnostic.test.ts`](./packages/deshiqr/test/core/provider-agnostic.test.ts), the edge
function tests and `python/tests/test_provider_agnostic.py`.

What _is_ provider-specific is reading a payload (`decode`/`validate`): merchant semantics are
verified against bKash payloads only, and other providers are deliberately reported as unverified.
That never gates amount derivation — the `qr` API validates only TLV well-formedness and the CRC.

> Caveat: providers can change their format. Test a small amount in the provider app before shipping
> a pay page. deshiQR only encodes what the payer should send — it never confirms payment.

## Install

| Where                      | Install                       | How you call it                                                                           |
| -------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| Node, bundlers, TypeScript | `npm install deshiqr`         | `import { withAmount, encode, toSvg } from "deshiqr"`                                     |
| Web component              | the same package              | `import "deshiqr/element"`, then `<deshiqr-pay …>`                                        |
| Browser, no build step     | one `<script src>`            | `window.DeshiQR` (payload + QR; registers the element)                                    |
| Python 3.9+                | `pip install deshiqr`         | `from deshiqr import with_amount` (payload only; QR via the HTTP API or `segno`/`qrcode`) |
| Deno / Bun                 | `import … from "npm:deshiqr"` | the npm package resolves                                                                  |

Everything is zero-dependency and does no I/O. The main entry (`deshiqr`) is pure — payload library
plus QR encoder/renderers, no DOM side effects, so it is safe in Node, Deno, workers and edge
functions. The `<deshiqr-pay>` web component lives at the `deshiqr/element` subpath (importing it
registers the element), and the single browser bundle puts both behind one global.

> These packages are released from this repo on a `v*` tag (see
> [CONTRIBUTING.md](./CONTRIBUTING.md#releases)). If a version is not on the registry yet, build from
> source (`pnpm build` and `pip install ./python`) or use the Pages bundle URL below.

### Plain JS, no build step

```html
<script src="https://cdn.jsdelivr.net/npm/deshiqr@0.1.0/dist/deshiqr.global.js"></script>
<script>
  const payload = DeshiQR.withAmount(basePayload, 500, {
    reference: DeshiQR.newReference({ prefix: "FT80" }),
  });
  document.querySelector("#qr").innerHTML = DeshiQR.toSvg(DeshiQR.encode(payload), {
    margin: 4,
    scale: 8,
  });
</script>
```

The same file registers `<deshiqr-pay>`, so one tag is enough for a whole payment panel:

```html
<script src="https://cdn.jsdelivr.net/npm/deshiqr@0.1.0/dist/deshiqr.global.js"></script>
<deshiqr-pay payload="00020101021126…" title="Demo Store" presets="100,500,1000"></deshiqr-pay>
```

**GitHub-hosted URL (no npm publish needed).** The same bundle is published to GitHub Pages on every
`v*` tag (or manually from the Actions tab), see [`.github/workflows/cdn.yml`](./.github/workflows/cdn.yml):

```
https://hello2himel.github.io/deshiQR/deshiqr.global.js
```

`raw.githubusercontent.com` **cannot** be used in `<script src>`: it serves `text/plain` with
`X-Content-Type-Options: nosniff`, so browsers refuse to execute it. Use jsDelivr, unpkg or the Pages
URL above — or `raw.githack.com` if you need a URL pointing into the GitHub tree.

## Use it in your own app

| You need                                               | Use                                                                                                    | Backend                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------- |
| A QR for the cart total                                | `POST /functions/v1/qr` with the payload + amount, or `withAmount` + `encode` + `toSvg` in the browser | one stateless function, or none |
| The visitor types the amount (donation / pay anything) | `<deshiqr-pay>` from `deshiqr/element`, or the global bundle                                           | none                            |
| A payload (or a QR via `segno`/`qrcode`) in Python     | `pip install deshiqr` for the payload; the HTTP API for a rendered SVG                                 | none                            |

The API your app talks to is one stateless function you can deploy yourself; there is no deshiQR-hosted
service. See [Self-hosting](./docs/self-hosting.md). Use it for a checkout total, a donation amount,
"pay what you want", or any page that shows "pay ৳X".

## Repository layout

| Path                                                         | What                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [`packages/deshiqr`](./packages/deshiqr)                     | npm `deshiqr` — payload library + QR encoder and SVG/terminal renderers, zero deps.     |
|                                                              | The `<deshiqr-pay>` web component is the `deshiqr/element` subpath of the same package. |
| [`python`](./python)                                         | PyPI `deshiqr` — Python 3.9+ port of the payload library, stdlib only.                  |
| [`supabase/functions/qr`](./supabase/functions/qr)           | The stateless amount→QR HTTP endpoint (no database, no secrets).                        |
| [`supabase/functions/_vendor`](./supabase/functions/_vendor) | Generated copy of the library sources the edge function imports (`pnpm vendor:edge`).   |
| [`cdn`](./cdn)                                               | Demo page and source of the GitHub Pages browser bundle.                                |
| [`examples`](./examples)                                     | Checkout, vanilla `<deshiqr-pay>`, React and Node integrations.                         |
| [`docs`](./docs)                                             | Format, amount→QR API, embedding, self-hosting, architecture, demo payloads.            |
| [`scripts`](./scripts)                                       | Repo tooling: browser-bundle checks and edge-function vendoring.                        |

## Design decisions

- **One pure function.** `payload + amount → payload + QR` is computed offline; the HTTP endpoint is a
  thin stateless wrapper. No accounts, no database, no per-merchant builds, no storage.
- **Provider-agnostic derivation.** Only tag `01`, `54`, the checksum and an optional `62/01`
  reference are edited; everything else is byte-identical. That is a tested invariant, not a promise.
- **Payloads are public data.** The account number is printed on shop walls; the payload is not a
  secret. It is still not yours to swap: verify where the payload came from and compare the name the
  banking app shows with the shop's name before paying.
- **No funds, no confirmation.** deshiQR never takes custody of money, routes it, or proves it moved.
- **One package per platform.** npm `deshiqr` (payload + QR + element) and PyPI `deshiqr` (payload
  only). Synthetic fixtures only — no real merchant data in this repo, ever.

## Documentation

- [Payload format](./docs/format.md) — every tag, the checksum, how payloads are derived.
- [Amount→QR API](./docs/amount-qr.md) — one call: payload + amount → dynamic payload + QR SVG.
- [Embedding guide](./docs/embedding.md) — library, web component, and the stateless HTTP API.
- [Self-hosting](./docs/self-hosting.md) — deploy the `qr` function yourself.
- [Architecture & internal contract](./docs/architecture.md) — for contributors.
- [Demo payloads](./docs/demo-payloads.md) — the synthetic fixtures used in tests and docs.
- [Python package](./python/README.md) — `pip install deshiqr`, same payload API.
- [Security policy](./SECURITY.md) — what deshiQR does and does not protect.
- [Contributing](./CONTRIBUTING.md) — setup, conventions, releases.

## Status

`0.1.0` — early, usable, honest. Amount→QR is the primary surface and is provider-agnostic by
construction (it only edits the amount and re-seals the CRC); bKash is the only provider whose payload
_decoding_ is verified, and others are reported as unverified rather than asserted. Not done yet: real
payment confirmation and provider verification beyond bKash. The packages are published from this repo
on a `v*` tag; until a version is on the registry, use the GitHub Pages bundle or build from source.

## License

[MIT](./LICENSE) © Himel Das. Not affiliated with bKash, Nagad, Rocket or NPSB.
