# Bangla QR payload format

The QR printed by bKash (and accepted by other Bangla QR capable apps) is an EMVCo-style TLV
payload. deshiQR calls this a **Bangla QR**. This page is the field-level reference the library is
built against.

## Reference implementations

The format is language-neutral. This repo ships two implementations, one package per platform, both
pinned to the same synthetic fixtures in [`demo-payloads.md`](./demo-payloads.md):

- **JavaScript/TypeScript** — npm `deshiqr` (canonical): the payload library and the QR
  encoder/renderers are the same package. Also loadable as the browser global `window.DeshiQR` from
  `dist/deshiqr.global.js`.
- **Python** — `pip install deshiqr` ([`../python/`](../python/README.md)), a stdlib-only port of the
  payload library with the same API in snake_case. Render the QR with `segno`/`qrcode` or the HTTP API.

Other languages can implement this page directly: the only requirements are strict TLV parsing and
CRC-16/CCITT-FALSE over the literal `6304` prefix.

## Encoding

Every field is `TTLLVV…`:

| Part  | Bytes | Meaning                                   |
| ----- | ----- | ----------------------------------------- |
| `TT`  | 2     | two-digit tag, as ASCII digits            |
| `LL`  | 2     | two-digit **decimal** length of the value |
| `VV…` | `LL`  | value, ASCII                              |

There is no terminator and no escaping. The payload is the concatenation of the fields, ending with
the checksum field. Values that are themselves TLV trees (tags `26`, `62`, `80`, `81`) have a length
covering their whole subtree.

## Top-level fields

| Tag        | Name                         | Typical value             | Notes                                       |
| ---------- | ---------------------------- | ------------------------- | ------------------------------------------- |
| `00`       | Payload format indicator     | `01`                      | always `01`                                 |
| `01`       | Point of initiation          | `11` static, `12` dynamic | dynamic means an amount is present          |
| `26`       | Merchant account information | TLV subtree               | `00` = institution AID, `03` = account      |
| `52`       | Merchant category code       | `6016`                    | MCC; `6016` appears on financial transfers  |
| `53`       | Currency                     | `050`                     | ISO 4217 numeric, `050` = BDT               |
| `54`       | Amount                       | `500.00`                  | decimal string, 2 dp, dynamic payloads only |
| `58`       | Country                      | `BD`                      | ISO 3166-1 alpha-2                          |
| `59`       | Merchant name                | `DEMO STORE`              | up to 25 characters                         |
| `60`       | Merchant city                | `Dhaka`                   | up to 15 characters                         |
| `62`       | Additional data              | TLV subtree               | bill number, reference, labels              |
| `80`, `81` | NPSB token templates         | TLV subtrees              | opaque; preserve verbatim                   |
| `63`       | CRC checksum                 | `295D`                    | 4 uppercase hex chars                       |

### `26` account template

| Sub-tag | Meaning             | Example                                                           |
| ------- | ------------------- | ----------------------------------------------------------------- |
| `00`    | institution AID     | `bd.org.bb.npsb`                                                  |
| `01`    | template version    | `02`                                                              |
| `02`    | scheme/variant code | `2002`                                                            |
| `03`    | account identifier  | `01000000000` — it is also the last 11 digits of the tag 26 value |

### `62` additional data

| Sub-tag | Meaning                         | Notes                                                 |
| ------- | ------------------------------- | ----------------------------------------------------- |
| `01`    | bill number / payment reference | 25 chars in real bKash dynamic QRs (tag 62 length 35) |
| `06`    | customer label                  | `FT` in the sample bKash payloads                     |

### `80` / `81` token templates

Both are `00` = AID, `01` = 44-character base64 token in the payloads we have seen. These are opaque
scheme data. Never rewrite them; carry them verbatim into derived payloads.

## Checksum

CRC-16/CCITT-FALSE over every byte **before** the final four characters, with the literal prefix
`6304` included:

1. Build the payload with the checksum field prefix: `… + "6304"`.
2. `crc = crc16(payloadWithPrefix)` (init `0xFFFF`, polynomial `0x1021`, no reflection, no final
   XOR) — a 16-bit value.
3. Append the uppercase, zero-padded hex (`"29B1"`).

Verification: `crc16(payload.slice(0, -4)) === payload.slice(-4)`. Anchor vector:
`crc16("123456789") === "29B1"`.

## Deriving a payload (always the same four edits)

Starting from a verified static payload:

1. Set tag `01` to `12` (dynamic).
2. Insert tag `54` with the amount, positioned by ascending tag order (after `53`, before `58`).
3. Optionally add or replace tag `62` sub-tag `01` with a payment reference.
4. Re-seal with tag `63`; everything else is untouched.

Removing an amount is the inverse: drop `54`, drop `62/01`, set `01` back to `11`, re-seal.

## Real-world reality check

- Apps that scan Bangla QR expect the account, name and tokens to belong together. Changing the
  account number or name to a _different_ owner is not a supported use case; deshiQR derives amounts
  and references only, and keeps account/name/city/tokens exactly as issued.
- The provider stance lives in [`architecture.md`](./architecture.md#provider-stance). bKash decoding
  is verified today. Other providers are planned; the parser is provider-agnostic but we do not assert
  validated support until we have their real payloads in the test suite.
