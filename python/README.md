# deshiqr (Python)

[![PyPI](https://img.shields.io/pypi/v/deshiqr.svg)](https://pypi.org/project/deshiqr/)
[![Python versions](https://img.shields.io/pypi/pyversions/deshiqr.svg)](https://pypi.org/project/deshiqr/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

Parse, verify, derive and build **Bangla QR** (NPSB / EMVCo) payment payloads — the QR format printed
by bKash and accepted by Bangla-QR-capable wallets and banks in Bangladesh.

This is a faithful, standard-library-only port of the payload library in the zero-dependency
[`deshiqr`](https://www.npmjs.com/package/deshiqr) npm package
([`packages/deshiqr`](../packages/deshiqr)). One package per platform: npm `deshiqr` covers payload +
QR + the web component, and this Python package covers the payload only.

- **Zero runtime dependencies.** Python 3.9+, standard library only.
- Parse, verify (CRC-16/CCITT-FALSE) and decode payloads into structured data.
- Derive dynamic payloads (`with_amount`) and static ones (`to_static`) with byte-identical output to
  the TypeScript implementation.
- Thorough, non-throwing validation with stable error codes.
- Type hints throughout (`py.typed`).

deshiQR never touches money and never talks to a bank or wallet API. It works with the payload text
only.

## Install

```sh
pip install deshiqr
```

The library deliberately does **not** bundle a QR encoder — see [Render the QR](#render-the-qr) for the
two-line integration with a third-party library, or call the stateless
[amount→QR HTTP API](../docs/amount-qr.md) if you would rather receive an SVG from the server.

## Quickstart

```python
from deshiqr import (
    decode,
    decode_safe,
    format_taka,
    mask_account,
    new_reference,
    validate,
    with_amount,
)

# Synthetic demo payload from docs/demo-payloads.md — not a real merchant.
payload = (
    "00020101021126470014bd.org.bb.npsb0102020204200203110100000000053030505802"
    "BD5910DEMO STORE6005Dhaka63049C89"
)

qr = decode(payload)
print(qr.kind)                      # "static"
print(qr.merchant.name)             # "DEMO STORE"
print(qr.merchant.city)             # "Dhaka"
print(qr.merchant.institution)      # "bd.org.bb.npsb"
print(mask_account(qr.merchant.account))  # "01000•••000"
print(format_taka(500))             # "৳500"

# Derive a dynamic QR for 250.00 BDT with a generated 12-character reference.
reference = new_reference(prefix="ORD", length=12)   # e.g. "ORDk2Q9xZ1M4"
dynamic = with_amount(payload, 250, reference=reference)

dynamic_qr = decode(dynamic)
print(dynamic_qr.kind)              # "dynamic"
print(dynamic_qr.amount)            # 250.0
print(dynamic_qr.amount_text)       # "250.00"
print(dynamic_qr.reference)         # the generated 12-character reference

# Validation never raises: it collects errors and warnings.
report = validate(dynamic)
print(report.ok)                    # True
print([issue.code for issue in report.warnings])  # []

# Non-throwing decode alternative:
result = decode_safe(payload)
if result.ok:
    print(result.qr.checksum)       # "9C89"
else:
    print(result.error.code, result.error.message)
```

All example payloads are **synthetic** (fake account `01000000000`, `DEMO STORE`, dummy NPSB tokens).
The repo's data policy forbids committing real merchant or payment data; see
[`docs/demo-payloads.md`](../docs/demo-payloads.md).

## Render the QR

`deshiqr` only produces the payload string — that is the part bKash validates. To turn it into a
scannable image, use any QR encoder. Two popular choices:

### segno (SVG, no image dependencies)

```sh
pip install segno
```

```python
import segno
from deshiqr import with_amount, new_reference

payload = "00020101021126470014bd.org.bb.npsb0102020204200203110100000000053030505802BD5910DEMO STORE6005Dhaka63049C89"
dynamic = with_amount(payload, 250, reference=new_reference(prefix="ORD", length=12))

segno.make(dynamic, error="m").save("deshiqr-demo.svg", scale=4)
```

### qrcode (PNG)

```sh
pip install "qrcode[pil]"
```

```python
import qrcode
from deshiqr import with_amount

dynamic = with_amount(payload, 250, reference="ORDER12345")
qrcode.make(dynamic).save("deshiqr-demo.png")
```

Keep the encoder's error correction at **M** (or higher) and output at least ~256×256 px; print the QR
at a size phones can scan. `examples/derive_svg.py` in this directory is a runnable version of the segno
example.

## Deriving payloads

Derivation only changes the fields that may legally change: the amount, the point of initiation (tag
01), and the reference inside template 62. The account template, merchant name/city, MCC, currency,
country and the opaque NPSB tokens are preserved verbatim, then the payload is re-sealed with
CRC-16. That is why amount derivation is provider-agnostic: any valid Bangla QR payload works, without
provider-specific code.

```python
from deshiqr import build, to_static, with_amount

# Explicit reference
dynamic = with_amount(static_payload, 500, reference="DEMOQR0VZeK2MfbVRI6w36osd")

# Generate a reference from the existing prefix/length
dynamic = with_amount(static_payload, 250, reference_prefix="ORD", reference_length=12)

# Reuse the reference already in the payload
dynamic = with_amount(dynamic_payload, 777, keep_existing_reference=True)

# No reference at all
dynamic = with_amount(dynamic_payload, 900, reference_length=0)

# `reference=None` drops the reference too; omitting the argument keeps the
# TypeScript default (derive a new reference from the source payload's
# prefix/length when one is present, otherwise no reference).

# Back to a static QR (drops the amount and reference, tag 01 -> 11)
static = to_static(dynamic_payload)

# Static or dynamic depending on the amount
payload = build(static_payload, amount=250)   # dynamic
payload = build(dynamic_payload, amount=None) # static
```

The derivation rules are specified in
[`docs/architecture.md` §Derivation rules](../docs/architecture.md#derivation-rules), and the field-level
format in [`docs/format.md`](../docs/format.md).

## Checksums

```python
from deshiqr import crc16, verify_checksum

crc16("123456789")            # "29B1" — CRC-16/CCITT-FALSE anchor vector
verify_checksum(payload)      # True when the trailing tag-63 checksum validates
```

## Validation

`validate()` is strict about the checksum and required fields, and lenient about optional ones
(over-long names, non-BDT currency, unusual tokens and so on are warnings that never raise):

```python
from deshiqr import validate

report = validate(payload)
for issue in report.errors:
    print("error  ", issue.code, issue.message, issue.tag)
for issue in report.warnings:
    print("warning", issue.code, issue.message, issue.tag)

if report.ok:
    print(report.qr.merchant.name)
```

Every failure from the throwing API is a `DeshiQrError` with a stable `.code`: `EMPTY_PAYLOAD`,
`BAD_TLV`, `CHECKSUM_MISMATCH`, `MISSING_FIELD`, `NOT_A_BANGLA_QR`, `BAD_AMOUNT`, `BAD_REFERENCE`,
`UNSUPPORTED`.

## API overview

| Python name                                         | Purpose                                                     |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `parse(payload)`                                    | Split a payload into top-level `Field(tag, value)` records. |
| `encode_field` / `encode_fields`                    | Encode fields back to `TTLLVV…` text.                       |
| `decode(payload)` / `decode_safe(payload)`          | Verified, structured `DecodedQr` / non-throwing result.     |
| `verify_checksum(payload)`                          | CRC-16/CCITT-FALSE check.                                   |
| `validate(payload)` / `is_bangla_qr(payload)`       | Full `ValidationReport` / boolean.                          |
| `to_static`, `with_amount`, `build`                 | Derive static / dynamic payloads.                           |
| `reference_from(payload)`                           | Reference in tag 62/01, or `None`.                          |
| `new_reference(prefix="", length=25)`               | Cryptographically random payment reference.                 |
| `crc16(text)`                                       | CRC-16/CCITT-FALSE as four uppercase hex characters.        |
| `amount_to_field` / `parse_amount_field`            | `500` → `"500.00"` and back.                                |
| `format_taka` / `mask_account`                      | Display helpers: `"৳1,250.50"`, `"01000•••000"`.            |
| `institution_of(qr)` / `KNOWN_INSTITUTIONS`         | Known-institution metadata (NPSB today).                    |
| `TAGS`, `MAX_AMOUNT`, `MAX_FIELD_LENGTH`, `VERSION` | Constants.                                                  |

The dataclasses are `Field`, `MerchantDetails`, `Tokens`, `DecodedQr`, `DecodeResult`, `DeshiQrIssue`
and `ValidationReport`.

## Provider support

**bKash is verified today**: decoding has been validated against real bKash payloads and the tests pin
that behaviour. The parser is provider-agnostic, but support for other Bangla QR providers (Nagad,
Rocket, bank/NPSB apps) is **planned**, not asserted, until their real payloads are part of the test
suite. Amount derivation is provider-agnostic by construction (only tag `01`, `54` and the checksum
change), so the payloads this package derives can be paid from any app that accepts Bangla QR.

## Related docs and code

- [Payload format (`docs/format.md`)](../docs/format.md)
- [Architecture & internal contract (`docs/architecture.md`)](../docs/architecture.md)
- [Amount→QR HTTP API (`docs/amount-qr.md`)](../docs/amount-qr.md)
- [JavaScript/TypeScript package (`packages/deshiqr`)](../packages/deshiqr) — payload + QR + element
- [A QR in a Node/Express server](../examples/node-express/server.mjs) —
  `examples/node-express/server.mjs`

## Development

```sh
cd python
python3 -m unittest discover -s tests -v   # stdlib unittest, no pytest needed
python3 -m compileall -q src
```

The package is a port, not a reimplementation: the TypeScript sources in
`packages/deshiqr/src/core` are the source of truth for behaviour, error codes and messages.

## License

[MIT](../LICENSE) © Himel Das

**Not affiliated with bKash, Nagad, Rocket, NPSB or any bank or payment provider.** Bangla QR is an
open, publicly documented payment payload format; deshiQR is an independent toolkit for working with
it.
