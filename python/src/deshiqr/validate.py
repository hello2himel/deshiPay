"""Non-throwing, thorough validation.

Mirrors ``packages/deshiqr/src/core/validate.ts``. Collects every problem instead of
stopping at the first one. Validation is strict about the checksum and required
fields, lenient about optional ones (collected as warnings, never raises).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field as dataclass_field
from typing import List, Optional

from .amount import MAX_AMOUNT
from .crc import crc16
from .decode import KNOWN_INSTITUTIONS, DecodedQr, decode
from .errors import DeshiQrCode, DeshiQrError
from .tlv import TAGS, Field, find_value, normalize, parse, parse_subfields

__all__ = [
    "DeshiQrIssue",
    "ValidationReport",
    "validate",
    "is_bangla_qr",
]

_AMOUNT_RE = re.compile(r"[0-9]{1,10}(?:\.[0-9]{1,2})?")
_REFERENCE_RE = re.compile(r"[\x20-\x7E]{1,32}")
_ACCOUNT_RE = re.compile(r"[0-9A-Za-z]{4,34}")
_CHECKSUM_RE = re.compile(r"[0-9A-Fa-f]{4}")


@dataclass
class DeshiQrIssue:
    """One validation problem: a stable ``code``, a message and an optional ``tag``."""

    code: DeshiQrCode
    message: str
    tag: Optional[str] = None


@dataclass
class ValidationReport:
    """Result of :func:`validate`."""

    #: No errors. Warnings are allowed.
    ok: bool
    errors: List[DeshiQrIssue] = dataclass_field(default_factory=list)
    warnings: List[DeshiQrIssue] = dataclass_field(default_factory=list)
    #: Best-effort decode; ``None`` when the payload could not be decoded at all.
    qr: Optional[DecodedQr] = None


def _issue(code: DeshiQrCode, message: str, tag: Optional[str] = None) -> DeshiQrIssue:
    return DeshiQrIssue(code=code, message=message, tag=tag)


def _safe_subfields(value: str) -> Optional[List[Field]]:
    try:
        return parse_subfields(value)
    except DeshiQrError:
        return None


def validate(payload: str) -> ValidationReport:
    """Non-throwing, thorough validation of a Bangla QR payload."""
    errors: List[DeshiQrIssue] = []
    warnings: List[DeshiQrIssue] = []

    def result(qr: Optional[DecodedQr]) -> ValidationReport:
        return ValidationReport(
            ok=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            qr=qr,
        )

    text = normalize(payload)
    if len(text) == 0:
        errors.append(_issue("EMPTY_PAYLOAD", "Paste a Bangla QR payload first."))
        return result(None)
    if len(text) > 4096:
        errors.append(_issue("UNSUPPORTED", "This is far too long to be a Bangla QR payload."))
        return result(None)

    try:
        fields = parse(text)
    except DeshiQrError as error:
        errors.append(_issue("BAD_TLV", error.message))
        return result(None)
    except Exception as error:  # pragma: no cover - defensive, mirrors `catch`
        errors.append(_issue("BAD_TLV", str(error) or "Malformed payload."))
        return result(None)

    # ---- checksum ---------------------------------------------------------
    last = fields[-1] if fields else None
    checksum_ok = False
    if last is None or last.tag != TAGS["CRC"]:
        errors.append(
            _issue(
                "MISSING_FIELD",
                "The payload does not end with a checksum (tag 63).",
                TAGS["CRC"],
            )
        )
    elif _CHECKSUM_RE.fullmatch(last.value) is None:
        errors.append(
            _issue(
                "BAD_TLV",
                "The checksum must be four hexadecimal characters.",
                TAGS["CRC"],
            )
        )
    elif crc16(text[:-4]) != last.value.upper():
        errors.append(
            _issue(
                "CHECKSUM_MISMATCH",
                "The checksum does not match, so this QR may be damaged or not a Bangla QR.",
                TAGS["CRC"],
            )
        )
    else:
        checksum_ok = True

    # ---- duplicates / ordering -------------------------------------------
    seen = set()
    for field in fields:
        if field.tag == TAGS["CRC"]:
            continue
        if field.tag in seen:
            warnings.append(
                _issue(
                    "BAD_TLV",
                    "Tag {} appears more than once.".format(field.tag),
                    field.tag,
                )
            )
        seen.add(field.tag)

    # ---- required and optional top-level fields --------------------------
    format_indicator = find_value(fields, TAGS["FORMAT"])
    if format_indicator is None:
        warnings.append(
            _issue(
                "MISSING_FIELD",
                "Missing the format indicator (tag 00).",
                TAGS["FORMAT"],
            )
        )
    elif format_indicator != "01":
        warnings.append(
            _issue(
                "UNSUPPORTED",
                'Unexpected format indicator "{}".'.format(format_indicator),
                TAGS["FORMAT"],
            )
        )

    initiation = find_value(fields, TAGS["INITIATION"])
    if initiation is None:
        errors.append(
            _issue(
                "MISSING_FIELD",
                "Missing the point-of-initiation tag (tag 01).",
                TAGS["INITIATION"],
            )
        )
    elif initiation not in ("11", "12"):
        errors.append(
            _issue(
                "UNSUPPORTED",
                'Unknown point of initiation "{}".'.format(initiation),
                TAGS["INITIATION"],
            )
        )

    account_value = find_value(fields, TAGS["ACCOUNT"])
    if account_value is None:
        errors.append(
            _issue(
                "NOT_A_BANGLA_QR",
                "Missing the account template (tag 26).",
                TAGS["ACCOUNT"],
            )
        )
    else:
        template = _safe_subfields(account_value)
        if template is None:
            errors.append(
                _issue(
                    "BAD_TLV",
                    "The account template (tag 26) is not valid TLV.",
                    TAGS["ACCOUNT"],
                )
            )
        else:
            institution = find_value(template, "00")
            account = find_value(template, "03")
            if not institution:
                errors.append(
                    _issue(
                        "NOT_A_BANGLA_QR",
                        "The account template has no institution identifier (tag 26/00).",
                        TAGS["ACCOUNT"],
                    )
                )
            elif institution not in KNOWN_INSTITUTIONS:
                warnings.append(
                    _issue(
                        "UNSUPPORTED",
                        'Unrecognised institution "{}". Decoding generically; support is not '
                        "verified for this provider yet.".format(institution),
                        TAGS["ACCOUNT"],
                    )
                )
            if not account:
                errors.append(
                    _issue(
                        "NOT_A_BANGLA_QR",
                        "The account template has no account identifier (tag 26/03).",
                        TAGS["ACCOUNT"],
                    )
                )
            elif _ACCOUNT_RE.fullmatch(account) is None:
                errors.append(
                    _issue(
                        "NOT_A_BANGLA_QR",
                        "The account identifier does not look valid.",
                        TAGS["ACCOUNT"],
                    )
                )

    name = find_value(fields, TAGS["NAME"])
    if name is None:
        errors.append(
            _issue(
                "NOT_A_BANGLA_QR",
                "The payload has no merchant name (tag 59).",
                TAGS["NAME"],
            )
        )
    elif len(name) == 0 or len(name) > 25:
        warnings.append(
            _issue(
                "BAD_TLV",
                "The merchant name should be 1–25 characters.",
                TAGS["NAME"],
            )
        )

    city = find_value(fields, TAGS["CITY"])
    if city is not None and len(city) > 15:
        warnings.append(
            _issue(
                "BAD_TLV",
                "The merchant city should be at most 15 characters.",
                TAGS["CITY"],
            )
        )

    currency = find_value(fields, TAGS["CURRENCY"])
    if currency is None:
        warnings.append(
            _issue(
                "MISSING_FIELD",
                "Missing the currency (tag 53).",
                TAGS["CURRENCY"],
            )
        )
    elif currency != "050":
        warnings.append(
            _issue(
                "UNSUPPORTED",
                'Currency is "{}", not BDT (050).'.format(currency),
                TAGS["CURRENCY"],
            )
        )

    country = find_value(fields, TAGS["COUNTRY"])
    if country is None:
        warnings.append(
            _issue(
                "MISSING_FIELD",
                "Missing the country (tag 58).",
                TAGS["COUNTRY"],
            )
        )
    elif country != "BD":
        warnings.append(
            _issue(
                "UNSUPPORTED",
                'Country is "{}", not BD.'.format(country),
                TAGS["COUNTRY"],
            )
        )

    # ---- amount ----------------------------------------------------------
    amount_text = find_value(fields, TAGS["AMOUNT"])
    if amount_text is not None:
        if _AMOUNT_RE.fullmatch(amount_text) is None:
            errors.append(
                _issue(
                    "BAD_AMOUNT",
                    'Invalid amount "{}".'.format(amount_text),
                    TAGS["AMOUNT"],
                )
            )
        else:
            amount = float(amount_text)
            if not (amount > 0) or amount > MAX_AMOUNT:
                errors.append(
                    _issue(
                        "BAD_AMOUNT",
                        'Amount "{}" is out of range.'.format(amount_text),
                        TAGS["AMOUNT"],
                    )
                )
        if initiation == "11":
            warnings.append(
                _issue(
                    "BAD_TLV",
                    "A static QR should not carry a fixed amount (tag 54).",
                    TAGS["AMOUNT"],
                )
            )
    elif initiation == "12":
        warnings.append(
            _issue(
                "BAD_TLV",
                "A dynamic QR usually carries an amount (tag 54).",
                TAGS["AMOUNT"],
            )
        )

    # ---- additional data / reference ------------------------------------
    additional_value = find_value(fields, TAGS["ADDITIONAL"])
    if additional_value is not None:
        additional = _safe_subfields(additional_value)
        if additional is None:
            errors.append(
                _issue(
                    "BAD_TLV",
                    "The additional data template (tag 62) is not valid TLV.",
                    TAGS["ADDITIONAL"],
                )
            )
        elif len(additional) == 0:
            warnings.append(
                _issue(
                    "BAD_TLV",
                    "The additional data template (tag 62) is empty.",
                    TAGS["ADDITIONAL"],
                )
            )
        else:
            reference = find_value(additional, "01")
            if reference is not None and _REFERENCE_RE.fullmatch(reference) is None:
                errors.append(
                    _issue(
                        "BAD_REFERENCE",
                        "The reference must be 1–32 printable ASCII characters.",
                        TAGS["ADDITIONAL"],
                    )
                )

    # ---- opaque NPSB tokens: warn only, never fail ----------------------
    for tag in (TAGS["TOKEN_80"], TAGS["TOKEN_81"]):
        value = find_value(fields, tag)
        if value is not None and _safe_subfields(value) is None:
            warnings.append(
                _issue(
                    "UNSUPPORTED",
                    "The token template (tag {}) is not TLV; it is preserved verbatim.".format(
                        tag
                    ),
                    tag,
                )
            )

    if len(text) > 800:
        warnings.append(
            _issue(
                "UNSUPPORTED",
                "This payload is unusually long; check it before publishing.",
            )
        )

    # ---- full decode for the structured result --------------------------
    qr: Optional[DecodedQr] = None
    if checksum_ok and len(errors) == 0:
        try:
            qr = decode(text)
        except DeshiQrError as error:
            errors.append(_issue(error.code, error.message, error.detail))
        except Exception as error:  # pragma: no cover - defensive
            errors.append(
                _issue("UNSUPPORTED", str(error) or "Unknown error.")
            )

    return result(qr)


def is_bangla_qr(payload: str) -> bool:
    """True when the payload is a checksum-valid Bangla QR with the required fields."""
    return validate(payload).ok
