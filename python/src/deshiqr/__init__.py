"""deshiqr — parse, verify and build Bangla QR (NPSB / EMVCo) payment payloads.

Zero dependencies, standard library only, Python 3.9+.

This package is a faithful port of the ``deshiqr`` npm package (``packages/deshiqr/src/core``).
Decoding is verified against real bKash payloads today; the parser is
provider-agnostic, but support for other Bangla QR providers is not claimed until
their real payloads are in the test suite.

Example::

    from deshiqr import decode, with_amount, new_reference, format_taka

    qr = decode(payload)
    print(qr.merchant.name, format_taka(qr.amount or 0))
    dynamic = with_amount(payload, 250, reference=new_reference(prefix="ORD", length=12))
"""

from __future__ import annotations

from typing import Final

from .amount import (
    MAX_AMOUNT,
    amount_to_field,
    format_taka,
    mask_account,
    parse_amount_field,
)
from .build import (
    assert_reference,
    build,
    reference_from,
    seal,
    to_static,
    with_amount,
)
from .crc import crc16
from .decode import (
    CURRENCIES,
    KNOWN_INSTITUTIONS,
    DecodedQr,
    DecodeResult,
    MerchantDetails,
    Tokens,
    decode,
    decode_safe,
    institution_of,
)
from .errors import CODES, DeshiQrCode, DeshiQrError
from .reference import DEFAULT_REFERENCE_LENGTH, new_reference
from .tlv import (
    MAX_FIELD_LENGTH,
    TAGS,
    Field,
    encode_field,
    encode_fields,
    find_field,
    find_value,
    insert_field_sorted,
    normalize,
    parse,
    parse_subfields,
)
from .validate import DeshiQrIssue, ValidationReport, is_bangla_qr, validate

#: Package version. Kept in sync with ``pyproject.toml``.
VERSION: Final = "0.1.0"

__version__ = VERSION


def verify_checksum(payload: str) -> bool:
    """True for any payload whose checksum validates."""
    text = payload.strip() if isinstance(payload, str) else ""
    if len(text) < 8:
        return False
    checksum = text[-4:]
    if len(checksum) != 4 or any(
        character not in "0123456789abcdefABCDEF" for character in checksum
    ):
        return False
    return crc16(text[:-4]) == checksum.upper()


__all__ = [
    # errors
    "DeshiQrError",
    "DeshiQrCode",
    "CODES",
    # constants
    "VERSION",
    "MAX_AMOUNT",
    "MAX_FIELD_LENGTH",
    "DEFAULT_REFERENCE_LENGTH",
    "TAGS",
    "KNOWN_INSTITUTIONS",
    "CURRENCIES",
    # TLV
    "Field",
    "normalize",
    "parse",
    "encode_field",
    "encode_fields",
    "find_field",
    "find_value",
    "parse_subfields",
    "insert_field_sorted",
    # checksum / verification
    "crc16",
    "verify_checksum",
    # decoding
    "MerchantDetails",
    "Tokens",
    "DecodedQr",
    "DecodeResult",
    "decode",
    "decode_safe",
    "institution_of",
    # amounts
    "amount_to_field",
    "parse_amount_field",
    "format_taka",
    "mask_account",
    # derivation
    "seal",
    "assert_reference",
    "to_static",
    "with_amount",
    "build",
    "reference_from",
    "new_reference",
    # validation
    "DeshiQrIssue",
    "ValidationReport",
    "validate",
    "is_bangla_qr",
]
