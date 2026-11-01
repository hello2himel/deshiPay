#!/usr/bin/env python3
"""Derive a dynamic Bangla QR payload and render it as an SVG with segno.

The ``deshiqr`` package intentionally does not bundle a QR encoder: it only
produces the payload string (which is the part a wallet verifies). This script
shows the two-line integration with a third-party encoder.

Run from the ``python/`` directory after installing the package and segno::

    pip install segno
    PYTHONPATH=src python3 examples/derive_svg.py

All data here is synthetic (docs/demo-payloads.md): fake account
``01000000000``, ``DEMO STORE`` and dummy NPSB tokens.
"""

from __future__ import annotations

from deshiqr import (
    decode,
    format_taka,
    mask_account,
    new_reference,
    with_amount,
)

# Static demo payload from docs/demo-payloads.md (synthetic).
STATIC_PAYLOAD = (
    "00020101021126470014bd.org.bb.npsb0102020204200203110100000000052046016530305058"
    "02BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0"
    "b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5v"
    "dCByZWFsISE=6304295D"
)

AMOUNT = 250
REFERENCE = new_reference(prefix="ORD", length=12)


def main() -> None:
    base = decode(STATIC_PAYLOAD)
    print("merchant :", base.merchant.name, "|", base.merchant.city)
    print("account  :", mask_account(base.merchant.account))
    print("scheme   :", base.merchant.institution)

    payload = with_amount(STATIC_PAYLOAD, AMOUNT, reference=REFERENCE)
    derived = decode(payload)
    print("kind     :", derived.kind)
    print("amount   :", format_taka(derived.amount or 0))
    print("reference:", derived.reference)
    print("checksum :", derived.checksum)

    try:
        import segno  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover - example only
        print("segno is not installed; run `pip install segno` to render the SVG.")
        return

    output = "deshiqr-demo.svg"
    segno.make(payload, error="m").save(output, scale=4)
    print("wrote    :", output)


if __name__ == "__main__":
    main()
