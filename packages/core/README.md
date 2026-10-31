# deshiqr

Parse, verify and build **Bangla QR** payment payloads (the NPSB / EMVCo QR format used by bKash and
other Bangla QR capable apps).

- **Zero dependencies.** Runs in browsers, Node, Deno and edge runtimes.
- **Safe by default.** Every decode verifies the CRC-16 checksum and the required fields.
- **Verbatim derivation.** Derived payloads keep the account, name, city, MCC, currency and the
  opaque NPSB tokens exactly as issued; only the amount and reference are edited.

## Install

```sh
npm install deshiqr
# or: pnpm add deshiqr, bun add deshiqr
```

## Decode

```ts
import { decode, decodeSafe, validate, formatTaka, maskAccount } from "deshiqr";

const qr = decode(payload);
qr.merchant.name;      // "DEMO STORE"
qr.merchant.account;   // "01000000000" (full account — mask for display)
qr.merchant.city;      // "Dhaka"
qr.amount;             // 500 or null
qr.reference;          // "DEMOQR0VZeK2MfbVRI6w36osd" or null
qr.kind;               // "static" | "dynamic"

// Never let untrusted input throw at you:
const result = decodeSafe(payload);
if (!result.ok) console.warn(result.error.code, result.error.message);

// Collect every problem (this is what a setup wizard wants):
const report = validate(payload);
report.ok;        // boolean
report.errors;    // [{ code, message, tag? }]
report.warnings;  // e.g. unrecognised institution, non-BDT currency
```

`decode` throws a `DeshiQrError` with a stable `code`:
`EMPTY_PAYLOAD | BAD_TLV | CHECKSUM_MISMATCH | MISSING_FIELD | NOT_A_BANGLA_QR | BAD_AMOUNT |
BAD_REFERENCE | UNSUPPORTED`.

## Build a payload for an amount

```ts
import { withAmount, toStatic, newReference, referenceFrom } from "deshiqr";

// Static payload from a merchant QR, given an amount (500 BDT):
const payload = withAmount(staticBase, 500);

// With a reference the customer will see in their receipt:
const withRef = withAmount(staticBase, 500, { reference: newReference({ prefix: "FT80" }) });
// newReference() defaults to 25 characters — the bill-number shape bKash uses.

// Generate from the merchant's existing reference pattern:
const derived = withAmount(staticBase, 500, { referencePrefix: "ORD", referenceLength: 12 });

// Back to a static payload (drops amount and reference):
const base = toStatic(payload);

// Read the reference back:
referenceFrom(withRef);
```

`withAmount(payload, amount, options)`:

| Option | Meaning |
| --- | --- |
| `reference` | Explicit reference to embed. `null` means "no reference". |
| `referencePrefix` | Prefix for a freshly generated reference. |
| `referenceLength` | Total length of a generated reference. Defaults to 25, the length real bKash dynamic QRs use. |
| `referenceLength` | Total length of a generated reference. `0` disables it. |
| `keepExistingReference` | Reuse the source payload's reference unchanged. |

Amounts must be `0 < amount <= 99,999,999.99` with at most two decimals. The payload is re-sealed with
CRC-16/CCITT-FALSE automatically.

## Render the QR

`deshiqr` deliberately does not encode QR images — use any QR library:

```ts
import QRCode from "qrcode";
const svg = await QRCode.toString(withAmount(staticBase, 500), { type: "svg" });
```

For a zero-dependency encoder + SVG/terminal renderer, use the companion package
[`deshiqr-qr`](https://www.npmjs.com/package/deshiqr-qr).

## Payload format

The payload is a `TTLLVV…` TLV structure: tag 26 account template, 52 MCC, 54 amount, 59 name,
60 city, 62 additional data, 63 CRC-16/CCITT-FALSE. Field-level details are in
[`docs/format.md`](../../docs/format.md).

## Provider support (important)

The payload format is the shared **Bangla QR** standard, so a QR built with deshiqr can be paid from
any app that accepts Bangla QR. **Decoding and derivation are verified against real bKash payloads
today.** The parser is provider-agnostic, but support for Nagad, Rocket and bank-issued Bangla QR is
**planned and not yet claimed** — we do not mark a provider verified until its real payloads are in
the test suite. See the matrix in [`docs/architecture.md`](../../docs/architecture.md).

## Data policy

No real merchant or payment data is committed in this repository. All fixtures use a synthetic
account (`01000000000`), `DEMO STORE`, and dummy NPSB tokens.

## License

MIT © Himel Das
