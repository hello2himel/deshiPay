"""Decode Bangla QR payloads into structured merchant/payment details.

Mirrors ``packages/deshiqr/src/core/decode.ts``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field as dataclass_field
from typing import Dict, List, Optional

from .amount import MAX_AMOUNT
from .crc import crc16
from .errors import DeshiQrError
from .tlv import (
    TAGS,
    Field,
    find_value,
    normalize,
    parse,
    parse_subfields,
)

__all__ = [
    "MAX_AMOUNT",
    "CURRENCIES",
    "KNOWN_INSTITUTIONS",
    "MerchantDetails",
    "Tokens",
    "DecodedQr",
    "DecodeResult",
    "decode",
    "decode_safe",
    "institution_of",
]

_AMOUNT_RE = re.compile(r"[0-9]{1,10}(?:\.[0-9]{1,2})?")
_CHECKSUM_RE = re.compile(r"[0-9A-Fa-f]{4}")

#: ISO 4217 numeric codes seen in Bangla QR payloads.
CURRENCIES: Dict[str, str] = {
    "050": "BDT",
    "356": "INR",
    "764": "THB",
    "840": "USD",
    "978": "EUR",
}

#: Institutions (tag 26 sub-tag 00) we know about.
#:
#: ``verified: True`` means deshiQR's decoder has been validated against real
#: payloads from that scheme and the tests pin the behaviour. Today only the NPSB
#: Bangla QR scheme (the one bKash issues) is verified. The parser is generic, but
#: we do not claim support for providers we have not seen real payloads from.
KNOWN_INSTITUTIONS: Dict[str, Dict[str, object]] = {
    "bd.org.bb.npsb": {"id": "npsb", "label": "NPSB Bangla QR", "verified": True},
}


@dataclass
class MerchantDetails:
    """Merchant (payee) details, taken verbatim from the QR."""

    name: str
    city: Optional[str]
    account: str
    institution: str
    mcc: Optional[str]


@dataclass
class Tokens:
    """Opaque NPSB token templates, preserved verbatim."""

    tag80: Optional[str] = None
    tag81: Optional[str] = None


@dataclass
class DecodedQr:
    """A verified, decoded Bangla QR payload."""

    payload: str
    kind: str  # "static" | "dynamic"
    amount: Optional[float]
    amount_text: Optional[str]
    currency: Optional[str]
    country: Optional[str]
    merchant: MerchantDetails
    reference: Optional[str]
    customer_label: Optional[str]
    additional_data: List[Field] = dataclass_field(default_factory=list)
    account_template: List[Field] = dataclass_field(default_factory=list)
    tokens: Tokens = dataclass_field(default_factory=Tokens)
    fields: List[Field] = dataclass_field(default_factory=list)
    checksum: str = ""


@dataclass
class DecodeResult:
    """Non-throwing decode result (the Python shape of ``decodeSafe``)."""

    ok: bool
    qr: Optional[DecodedQr] = None
    error: Optional[DeshiQrError] = None


def institution_of(qr: DecodedQr) -> Optional[Dict[str, object]]:
    """Known-institution metadata for a decoded QR, or ``None``."""
    return KNOWN_INSTITUTIONS.get(qr.merchant.institution)


def _read_amount(fields: List[Field]) -> "tuple[Optional[float], Optional[str]]":
    text = find_value(fields, TAGS["AMOUNT"])
    if text is None:
        return None, None
    if _AMOUNT_RE.fullmatch(text) is None:
        raise DeshiQrError("BAD_AMOUNT", 'Invalid amount "{}".'.format(text), text)
    value = float(text)
    if not (value > 0) or value > MAX_AMOUNT:
        raise DeshiQrError("BAD_AMOUNT", 'Amount "{}" is out of range.'.format(text), text)
    return value, text


def _read_account(fields: List[Field]) -> "tuple[str, str, List[Field]]":
    template_value = find_value(fields, TAGS["ACCOUNT"])
    if template_value is None:
        raise DeshiQrError(
            "NOT_A_BANGLA_QR",
            "Missing the account template (tag 26).",
            TAGS["ACCOUNT"],
        )

    try:
        template = parse_subfields(template_value)
    except DeshiQrError:
        raise DeshiQrError(
            "BAD_TLV",
            "The account template (tag 26) is not valid TLV.",
            TAGS["ACCOUNT"],
        ) from None

    institution = find_value(template, "00")
    account = find_value(template, "03")

    if not institution:
        raise DeshiQrError(
            "NOT_A_BANGLA_QR",
            "The account template has no institution identifier (tag 26/00).",
            TAGS["ACCOUNT"],
        )
    if not account:
        raise DeshiQrError(
            "NOT_A_BANGLA_QR",
            "The account template has no account identifier (tag 26/03).",
            TAGS["ACCOUNT"],
        )

    return account, institution, template


def decode(payload: str) -> DecodedQr:
    """Decode a payload, verifying its checksum and required fields.

    Raises :class:`DeshiQrError` on any problem; use :func:`decode_safe` or
    :func:`deshiqr.validate` for a non-throwing surface.
    """
    text = normalize(payload)
    fields = parse(text)

    checksum_field = fields[-1] if fields else None
    if checksum_field is None or checksum_field.tag != TAGS["CRC"]:
        raise DeshiQrError(
            "MISSING_FIELD",
            "The payload does not end with a checksum (tag 63).",
            TAGS["CRC"],
        )
    if _CHECKSUM_RE.fullmatch(checksum_field.value) is None:
        raise DeshiQrError(
            "BAD_TLV",
            "The checksum must be four hexadecimal characters.",
            TAGS["CRC"],
        )
    expected = checksum_field.value.upper()
    if crc16(text[:-4]) != expected:
        raise DeshiQrError(
            "CHECKSUM_MISMATCH",
            "The checksum does not match. This QR may be damaged or not a Bangla QR.",
            TAGS["CRC"],
        )

    initiation = find_value(fields, TAGS["INITIATION"])
    if initiation is None:
        raise DeshiQrError(
            "MISSING_FIELD",
            "Missing the point-of-initiation tag (tag 01).",
            TAGS["INITIATION"],
        )
    if initiation not in ("11", "12"):
        raise DeshiQrError(
            "UNSUPPORTED",
            'Unknown point of initiation "{}".'.format(initiation),
            initiation,
        )

    name = find_value(fields, TAGS["NAME"])
    if not name:
        raise DeshiQrError(
            "NOT_A_BANGLA_QR",
            "The payload has no merchant name (tag 59).",
            TAGS["NAME"],
        )

    account, institution, template = _read_account(fields)
    amount, amount_text = _read_amount(fields)

    additional_data: List[Field] = []
    reference: Optional[str] = None
    customer_label: Optional[str] = None
    additional_value = find_value(fields, TAGS["ADDITIONAL"])
    if additional_value is not None:
        try:
            additional_data = parse_subfields(additional_value)
        except DeshiQrError:
            raise DeshiQrError(
                "BAD_TLV",
                "The additional data template (tag 62) is not valid TLV.",
                TAGS["ADDITIONAL"],
            ) from None
        reference = find_value(additional_data, "01")
        customer_label = find_value(additional_data, "06")

    raw_currency = find_value(fields, TAGS["CURRENCY"])
    currency = None if raw_currency is None else CURRENCIES.get(raw_currency, raw_currency)

    return DecodedQr(
        payload=text,
        kind="dynamic" if initiation == "12" else "static",
        amount=amount,
        amount_text=amount_text,
        currency=currency,
        country=find_value(fields, TAGS["COUNTRY"]),
        merchant=MerchantDetails(
            name=name,
            city=find_value(fields, TAGS["CITY"]),
            account=account,
            institution=institution,
            mcc=find_value(fields, TAGS["MCC"]),
        ),
        reference=reference,
        customer_label=customer_label,
        additional_data=additional_data,
        account_template=template,
        tokens=Tokens(
            tag80=find_value(fields, TAGS["TOKEN_80"]),
            tag81=find_value(fields, TAGS["TOKEN_81"]),
        ),
        fields=fields,
        checksum=expected,
    )


def decode_safe(payload: str) -> DecodeResult:
    """Non-throwing decode."""
    try:
        return DecodeResult(ok=True, qr=decode(payload))
    except DeshiQrError as error:
        return DecodeResult(ok=False, error=error)
    except Exception as error:  # pragma: no cover - defensive, mirrors `catch`
        message = str(error) or "Unknown error"
        return DecodeResult(ok=False, error=DeshiQrError("UNSUPPORTED", message))
