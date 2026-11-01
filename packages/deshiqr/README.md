# deshiqr

**Bangla QR** toolkit in one zero-dependency npm package: parse, verify and build NPSB / EMVCo
payment payloads, encode QR Codes (SVG + terminal), and embed a `<deshiqr-pay>` payment panel.

- **One package, three surfaces** — payload library and QR engine in the main entry, the web
  component behind the `deshiqr/element` subpath, and a single browser bundle for plain `<script>`.
- **Zero dependencies.** Runs in browsers, Node, Deno and edge runtimes.
- **Safe by default.** Every decode verifies the CRC-16 checksum and the required fields.
- **Verbatim derivation.** Derived payloads keep the account, name, city, MCC, currency and the
  opaque NPSB tokens exactly as issued; only the amount and reference are edited.
- **QR encoding from scratch** against ISO/IEC 18004 (byte mode, versions 1–40, L/M/Q/H) with
  deterministic, script-free SVG output.

```sh
npm install deshiqr
```

| Import                   | What you get                            | DOM side effects                |
| ------------------------ | --------------------------------------- | ------------------------------- |
| `deshiqr`                | payload library + QR encoder/renderers  | none                            |
| `deshiqr/element`        | `<deshiqr-pay>` custom element (ESM)    | registers the element on import |
| `dist/deshiqr.global.js` | everything behind one global, `DeshiQR` | registers the element           |

`dist/index.js` (ESM), `dist/index.cjs` (CommonJS) and `dist/index.d.ts` (types) ship in the box.
A zero-dependency **Python** port with the same API is published as `pip install deshiqr` (see
[`python/`](../../python/README.md)).

## Payload: decode and derive

```ts
import { decode, decodeSafe, validate, withAmount, toStatic, newReference } from "deshiqr";

const qr = decode(payload);
qr.merchant.name; // "DEMO STORE"
qr.merchant.city; // "Dhaka"
qr.amount; // 500 or null
qr.reference; // "DEMOQR0VZeK2MfbVRI6w36osd" or null
qr.kind; // "static" | "dynamic"

// Never let untrusted input throw at you:
const result = decodeSafe(payload);
if (!result.ok) console.warn(result.error.code, result.error.message);

// Collect every problem at once (never throws):
validate(payload); // { ok, errors: [{ code, message, tag? }], warnings, qr }

// Given the merchant's static payload and an amount (500 BDT):
const derived = withAmount(payload, 500, {
  reference: newReference({ prefix: "FT80" }), // 25-character bill number by default
});

// Back to a static payload (drops the amount and reference):
toStatic(derived);
```

`withAmount(payload, amount, options)` options: `reference` (explicit; `null` = no reference),
`referencePrefix` + `referenceLength` (generated reference), `keepExistingReference` (reuse the
source payload's reference). Amounts must be `0 < amount <= 99,999,999.99` with at most two decimals;
the payload is re-sealed with CRC-16/CCITT-FALSE automatically.

`decode` throws a `DeshiQrError` with a stable `code`:
`EMPTY_PAYLOAD | BAD_TLV | CHECKSUM_MISMATCH | MISSING_FIELD | NOT_A_BANGLA_QR | BAD_AMOUNT |
BAD_REFERENCE | UNSUPPORTED`.

## QR: encode and render

```ts
import { encode, toSvg, toSvgPath, toTerminal, getVersionCapacity } from "deshiqr";

const matrix = encode("https://pay.example.com/#/p/demo-store"); // level M by default
const svg = toSvg(matrix, { scale: 8, margin: 4, title: "Demo Store — scan to pay" });
const path = toSvgPath(matrix, { margin: 4, dark: "#111" }); // a <path> for your own SVG
console.log(toTerminal(matrix)); // Unicode half-block preview

getVersionCapacity(1, "L"); // 17 bytes
getVersionCapacity(40, "L"); // 2953 bytes
```

`encode(text, { level, version, minVersion, mask, eager })` returns a `QrMatrix` (`size`, `version`,
`level`, `mask`, row-major `data`, `get(x, y)`). `toSvg` output is deterministic: no ids, timestamps or
random values, and `shape-rendering="crispEdges"` keeps modules sharp.

## `<deshiqr-pay>` web component

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/deshiqr@0.1.0/dist/element.js"></script>
<deshiqr-pay payload="00020101021126…" title="Demo Store" presets="100,500,1000"></deshiqr-pay>
```

```js
import "deshiqr/element"; // registers <deshiqr-pay>
import { DeshiQrPay, defineDeshiQrPay } from "deshiqr/element";
```

Shadow DOM, no framework, no runtime dependencies. Given a `payload` it works fully offline — the QR
is generated in the browser; `config-url` (optional) fetches a small JSON config.

| Attribute       | Description                                                                       |
| --------------- | --------------------------------------------------------------------------------- |
| `payload`       | Static Bangla QR payload. Required unless `config-url` is used.                   |
| `config-url`    | URL returning JSON `{ base_payload, title, note, presets, ref_prefix, ref_len }`. |
| `amount`        | Pre-set amount in BDT. Omit to show an amount input.                              |
| `lock-amount`   | Hide the amount input and use `amount`.                                           |
| `reference`     | Explicit reference (bill number) to embed.                                        |
| `ref-prefix`    | Prefix for a generated reference.                                                 |
| `ref-length`    | Generated reference length (1–32). Omit or `0` for none.                          |
| `title`, `note` | Headline and supporting text.                                                     |
| `presets`       | Comma-separated quick amounts, e.g. `100,500,1000`.                               |
| `theme`         | `auto` (default), `light` or `dark`.                                              |
| `size`          | QR size in CSS pixels (default `280`, min `96`, max `1024`).                      |
| `bare`          | Remove the card chrome, for embedding into your own layout.                       |

```js
const el = document.querySelector("deshiqr-pay");
el.setAmount(500); // number or null
el.getPayload(); // current dynamic payload ("" until an amount is set)
el.getSvg(); // current QR as an SVG string
await el.downloadPng("pay.png");
el.refresh(); // re-read attributes and re-render
```

Events (`deshiqr-ready`, `deshiqr-change`, `deshiqr-error`) bubble and are composed; details live in
`event.detail` (`{ payload, amount, reference }` or `{ code, message }`).

Theming is through CSS custom properties on the host: `--dq-accent`, `--dq-accent-2`,
`--dq-qr-size`, `--dq-radius`, `--dq-font` (all `--dq-*` variables in `src/element/styles.ts`).

## Plain `<script>`: one bundle, one global

No bundler, no npm — the single IIFE bundle bundles the payload library, the QR engine and the element
registration behind `DeshiQR`:

```html
<script src="https://cdn.jsdelivr.net/npm/deshiqr@0.1.0/dist/deshiqr.global.js"></script>
<script>
  // Payload + QR:
  const payload = DeshiQR.withAmount(staticBase, 500, { reference: DeshiQR.newReference() });
  const svg = DeshiQR.toSvg(DeshiQR.encode(payload));
  // <deshiqr-pay> is already registered:
  document.body.insertAdjacentHTML("beforeend", `<deshiqr-pay payload="${payload}"></deshiqr-pay>`);
</script>
```

`unpkg` and `jsdelivr` fields in `package.json` both point at `dist/deshiqr.global.js`, so
`https://unpkg.com/deshiqr` serves the bundle directly. Self-hosting it is recommended for production.

## Limits (on purpose)

- **Byte mode only**, no ECI designator: input is UTF-8, which is what virtually every scanner expects
  (Bangla text included). No numeric/alphanumeric/Kanji mode, no micro QR, no structured append, no FNC1.
- The renderers return strings; rasterization (PNG) is left to the caller — or to
  `<deshiqr-pay>`'s "Save QR" button in the browser.

## Provider support and data policy

Every QR built here is a standard **Bangla QR** payload, so any app that accepts Bangla QR can pay it.
Decoding and derivation are **verified against real bKash payloads today**; the parser is
provider-agnostic, but support for Nagad, Rocket and bank-issued Bangla QR is **planned and not yet
claimed** — a provider is only marked verified once its real payloads are pinned in the test suite.

No real merchant or payment data is committed in this repository. All fixtures use a synthetic account
(`01000000000`), `DEMO STORE`, and dummy NPSB tokens.

## Development

```sh
pnpm install
pnpm build:libs   # tsup: dist/index.js|.cjs|.d.ts, dist/element.js|.d.ts, dist/deshiqr.global.js
pnpm test         # node --test: payload + QR + element (144 tests)
pnpm typecheck
pnpm check:globals # loads the browser bundle in a bare sandbox (no Node, no DOM)
```

Tests live in `test/core`, `test/qr` and `test/element`, mirroring `src/core`, `src/qr`, `src/element`.
The QR suite uses `qrcode` and `jsqr` as **dev-only test oracles** — they are never imported by `src/`
or bundled. Repository-wide docs are in [`docs/`](../../docs/).

## License

MIT © Himel Das. Not affiliated with bKash, Nagad, Rocket or NPSB. "QR Code" is a registered trademark
of DENSO WAVE INCORPORATED.
