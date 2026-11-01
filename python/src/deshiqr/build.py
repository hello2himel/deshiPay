"""Derive and build Bangla QR payloads.

Mirrors ``packages/deshiqr/src/core/build.ts``.

Derivation always applies the same edits to a verified payload:

1. drop tag 63 and any existing tag 54;
2. ``to_static`` sets tag 01 to ``11`` and drops sub-tag 01 from template 62;
3. ``with_amount`` sets tag 01 to ``12``, inserts tag 54 with the amount in
   ascending tag order, and adds/replaces template 62 sub-tag 01 when a reference
   is requested;
4. everything else (template 26, MCC 52, currency 53, country 58, name 59, city 60,
   NPSB tokens 80/81, other 62 sub-tags) is preserved verbatim;
5. re-seal with ``"6304"`` + the uppercase CRC-16/CCITT-FALSE.
"""

from __future__ import annotations

import math
import re
from typing import Any, List, Optional

from .amount import MAX_AMOUNT, amount_to_field
from .crc import crc16
from .errors import DeshiQrError
from .reference import new_reference
from .tlv import (
    TAGS,
    Field,
    encode_fields,
    find_field,
    find_value,
    insert_field_sorted,
    normalize,
    parse,
    parse_subfields,
)

__all__ = [
    "assert_reference",
    "seal",
    "to_static",
    "with_amount",
    "build",
    "reference_from",
]

_REFERENCE_RE = re.compile(r"[\x20-\x7E]{1,32}")


class _Unset:
    """Type of the "argument was omitted" sentinel."""

    __slots__ = ()

    def __repr__(self) -> str:
        return "UNSET"


#: Sentinel that distinguishes an omitted ``reference`` keyword from an explicit
#: ``None``. This mirrors the TS library, where ``undefined`` means "derive
#: automatically" and ``null`` means "drop the reference". See the module and
#: README notes for details.
UNSET: Any = _Unset()


def assert_reference(reference: str) -> None:
    """Validate an explicit reference before it is embedded in a payload."""
    if not isinstance(reference, str) or _REFERENCE_RE.fullmatch(reference) is None:
        raise DeshiQrError(
            "BAD_REFERENCE",
            "A reference must be 1–32 printable ASCII characters.",
            reference if isinstance(reference, str) else None,
        )


def seal(fields: List[Field]) -> str:
    """Re-assemble fields into a sealed payload (drops any old tag 63 first)."""
    body = (
        encode_fields([field for field in fields if field.tag != TAGS["CRC"]])
        + TAGS["CRC"]
        + "04"
    )
    return body + crc16(body)


def _fields_without_checksum(payload: str) -> List[Field]:
    fields = parse(payload)
    if fields and fields[-1].tag == TAGS["CRC"]:
        fields.pop()
    return fields


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _require_reference(existing_prefix: Optional[str], length: int) -> Optional[str]:
    target = length
    if target <= 0:
        return None
    if existing_prefix and len(existing_prefix) > target:
        # Never grow a payload past the reference length it was issued with.
        return existing_prefix[:target]
    return new_reference(prefix=existing_prefix or "", length=target)


def to_static(payload: str) -> str:
    """Reduce a payload to its static (no amount, no reference) form.

    Keeps account, name, city, MCC, currency, NPSB tokens and every other field
    verbatim, exactly as the original setup app did.
    """
    fields = _fields_without_checksum(payload)
    out: List[Field] = []

    for field in fields:
        if field.tag == TAGS["AMOUNT"]:
            continue

        if field.tag == TAGS["INITIATION"]:
            out.append(Field(field.tag, "11"))
            continue

        if field.tag == TAGS["ADDITIONAL"]:
            try:
                sub = parse_subfields(field.value)
            except DeshiQrError:
                raise DeshiQrError(
                    "BAD_TLV",
                    "The additional data template (tag 62) is not valid TLV.",
                    TAGS["ADDITIONAL"],
                ) from None
            kept = [item for item in sub if item.tag != "01"]
            if kept:
                out.append(Field(field.tag, encode_fields(kept)))
            continue

        out.append(field)

    if find_field(out, TAGS["INITIATION"]) is None:
        raise DeshiQrError(
            "MISSING_FIELD",
            "Missing the point-of-initiation tag (tag 01).",
            TAGS["INITIATION"],
        )

    return seal(out)


def _resolve_reference(
    existing_reference: Optional[str],
    reference: Any,
    reference_prefix: Optional[str],
    reference_length: Optional[int],
    keep_existing_reference: bool,
) -> Optional[str]:
    if reference is not UNSET:
        if reference is not None:
            assert_reference(reference)
            return reference
        # Explicitly requested: no reference.
        return None

    if keep_existing_reference and existing_reference:
        return existing_reference

    if reference_prefix is not None:
        prefix = reference_prefix
    elif existing_reference:
        prefix = existing_reference[:10]
    else:
        prefix = ""

    if reference_length is not None:
        length = reference_length
    elif existing_reference:
        length = len(existing_reference)
    else:
        length = 0

    return _require_reference(prefix, length)


def with_amount(
    payload: str,
    amount: float,
    reference: Any = UNSET,
    reference_prefix: Optional[str] = None,
    reference_length: Optional[int] = None,
    keep_existing_reference: bool = False,
) -> str:
    """Derive a dynamic payload for the given amount.

    - strips any old amount and reference, sets tag 01 to ``12``
    - inserts the amount in ascending tag order
    - embeds an explicit reference, or generates one from the source reference
      prefix/length, or leaves the reference out
    - preserves everything else verbatim and re-seals with CRC-16

    ``reference=None`` explicitly drops the reference (like TS ``reference: null``);
    omitting it keeps the TS default (keep an existing reference's prefix/length
    when the source payload had one, otherwise no reference). ``reference=""`` is
    invalid and raises ``BAD_REFERENCE``.
    """
    if not _is_number(amount) or not math.isfinite(float(amount)) or amount <= 0:
        raise DeshiQrError(
            "BAD_AMOUNT",
            "Amount must be a finite number greater than zero.",
        )
    if amount > MAX_AMOUNT:
        raise DeshiQrError(
            "BAD_AMOUNT",
            "Amount must not exceed {}.".format(MAX_AMOUNT),
        )

    amount_field = amount_to_field(amount)
    fields = _fields_without_checksum(payload)

    existing_reference: Optional[str] = None
    for field in fields:
        if field.tag == TAGS["ADDITIONAL"]:
            try:
                existing_reference = find_value(parse_subfields(field.value), "01")
            except DeshiQrError:
                raise DeshiQrError(
                    "BAD_TLV",
                    "The additional data template (tag 62) is not valid TLV.",
                    TAGS["ADDITIONAL"],
                ) from None
            break

    if any(field.tag == TAGS["AMOUNT"] for field in fields):
        for index in range(len(fields) - 1, -1, -1):
            if fields[index].tag == TAGS["AMOUNT"]:
                del fields[index]

    resolved_reference = _resolve_reference(
        existing_reference,
        reference,
        reference_prefix,
        reference_length,
        keep_existing_reference,
    )

    # Point of initiation: static -> dynamic.
    initiation_index = None
    for index, field in enumerate(fields):
        if field.tag == TAGS["INITIATION"]:
            initiation_index = index
            break
    if initiation_index is not None:
        fields[initiation_index] = Field(TAGS["INITIATION"], "12")
    else:
        insert_field_sorted(fields, Field(TAGS["INITIATION"], "12"))

    # Amount in ascending tag order (after 53, before 58).
    insert_field_sorted(fields, Field(TAGS["AMOUNT"], amount_field))

    # Reference inside the additional data template.
    subfields: List[Field] = []
    existing_additional = find_field(fields, TAGS["ADDITIONAL"])
    if existing_additional is not None:
        try:
            subfields.extend(
                item
                for item in parse_subfields(existing_additional.value)
                if item.tag != "01"
            )
        except DeshiQrError:
            raise DeshiQrError(
                "BAD_TLV",
                "The additional data template (tag 62) is not valid TLV.",
                TAGS["ADDITIONAL"],
            ) from None

    if resolved_reference is not None:
        subfields.insert(0, Field("01", resolved_reference))

    if subfields:
        value = encode_fields(subfields)
        index = None
        for position, field in enumerate(fields):
            if field.tag == TAGS["ADDITIONAL"]:
                index = position
                break
        if index is not None:
            fields[index] = Field(TAGS["ADDITIONAL"], value)
        else:
            insert_field_sorted(fields, Field(TAGS["ADDITIONAL"], value))
    elif find_field(fields, TAGS["ADDITIONAL"]) is not None:
        for position, field in enumerate(fields):
            if field.tag == TAGS["ADDITIONAL"]:
                del fields[position]
                break

    return seal(fields)


def build(
    base: str,
    amount: Optional[float] = None,
    reference: Any = UNSET,
    reference_prefix: Optional[str] = None,
    reference_length: Optional[int] = None,
    keep_existing_reference: bool = False,
) -> str:
    """General derivation entry point: amount present -> dynamic, else static."""
    if amount is None:
        return to_static(base)
    return with_amount(
        base,
        amount,
        reference=reference,
        reference_prefix=reference_prefix,
        reference_length=reference_length,
        keep_existing_reference=keep_existing_reference,
    )


def reference_from(payload: str) -> Optional[str]:
    """Reference embedded in a payload, or ``None``."""
    try:
        fields = parse(normalize(payload))
        additional = find_value(fields, TAGS["ADDITIONAL"])
        if additional is None:
            return None
        return find_value(parse_subfields(additional), "01")
    except Exception:
        return None
