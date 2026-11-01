"""TLV (``TT LL VV…``) parsing and encoding for Bangla QR payloads.

Mirrors ``packages/deshiqr/src/core/tlv.ts``. Parsing is strict: a malformed payload raises
``DeshiQrError`` with code ``BAD_TLV`` instead of silently truncating. There is no
recursion — nested templates (tags 26, 62, 80, 81) are plain values; call
:func:`parse` again on them (or use :func:`parse_subfields`) to read their subtree.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional

from .errors import DeshiQrError


class _Tags(dict):
    """Tag lookup that also supports ``TAGS.AMOUNT`` attribute access."""

    def __getattr__(self, name: str) -> str:
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name) from None


#: Well-known Bangla QR / EMVCo top-level tags.
TAGS: Dict[str, str] = _Tags(
    FORMAT="00",
    INITIATION="01",
    ACCOUNT="26",
    MCC="52",
    CURRENCY="53",
    AMOUNT="54",
    COUNTRY="58",
    NAME="59",
    CITY="60",
    ADDITIONAL="62",
    CRC="63",
    TOKEN_80="80",
    TOKEN_81="81",
)

#: The format allows at most 99 characters per field value.
MAX_FIELD_LENGTH = 99

_TAG_RE = re.compile(r"[0-9]{2}")
_LENGTH_RE = re.compile(r"[0-9]{2}")


def normalize(payload: object) -> str:
    """Strip surrounding whitespace. Payloads are pasted from chats and screenshots."""
    return payload.strip() if isinstance(payload, str) else ""


@dataclass
class Field:
    """A single ``TT LL VV…`` field."""

    tag: str
    value: str


def parse(payload: str) -> List[Field]:
    """Parse a Bangla QR payload into top-level fields.

    Strict: malformed TLV raises ``DeshiQrError(BAD_TLV)`` rather than truncating.
    """
    text = normalize(payload)
    if len(text) == 0:
        raise DeshiQrError("EMPTY_PAYLOAD", "The payload is empty.")

    fields: List[Field] = []
    offset = 0
    text_length = len(text)

    while offset < text_length:
        if offset + 4 > text_length:
            raise DeshiQrError(
                "BAD_TLV",
                "Truncated field header at offset {}.".format(offset),
                "offset={}".format(offset),
            )

        tag = text[offset : offset + 2]
        if _TAG_RE.fullmatch(tag) is None:
            raise DeshiQrError(
                "BAD_TLV",
                'Invalid tag "{}" at offset {}.'.format(tag, offset),
                tag,
            )

        raw_length = text[offset + 2 : offset + 4]
        if _LENGTH_RE.fullmatch(raw_length) is None:
            raise DeshiQrError(
                "BAD_TLV",
                'Invalid length "{}" for tag {} at offset {}.'.format(raw_length, tag, offset),
                tag,
            )

        length = int(raw_length)
        value_start = offset + 4
        value_end = value_start + length

        if value_end > text_length:
            raise DeshiQrError(
                "BAD_TLV",
                "Tag {} claims {} characters but only {} remain.".format(
                    tag, length, text_length - value_start
                ),
                tag,
            )

        fields.append(Field(tag, text[value_start:value_end]))
        offset = value_end

    return fields


def encode_field(field: Field) -> str:
    """Encode one field as ``TTLLVV…``. Values are limited to 99 characters."""
    tag = field.tag
    value = field.value
    if not isinstance(tag, str) or _TAG_RE.fullmatch(tag) is None:
        raise DeshiQrError(
            "BAD_TLV",
            'Tag must be two digits, got "{}".'.format(tag),
            tag if isinstance(tag, str) else None,
        )
    if not isinstance(value, str):
        raise DeshiQrError(
            "BAD_TLV",
            "Value for tag {} must be a string.".format(tag),
            tag,
        )
    if len(value) > MAX_FIELD_LENGTH:
        raise DeshiQrError(
            "BAD_TLV",
            "Value for tag {} is {} characters; the format allows at most {}.".format(
                tag, len(value), MAX_FIELD_LENGTH
            ),
            tag,
        )
    return tag + "{:02d}".format(len(value)) + value


def encode_fields(fields: List[Field]) -> str:
    """Encode a list of fields back into a payload body."""
    out = []
    for field in fields:
        out.append(encode_field(field))
    return "".join(out)


def find_field(fields: List[Field], tag: str) -> Optional[Field]:
    """First occurrence of a tag, or ``None``."""
    for field in fields:
        if field.tag == tag:
            return field
    return None


def find_value(fields: List[Field], tag: str) -> Optional[str]:
    """Value of the first occurrence of a tag, or ``None``."""
    field = find_field(fields, tag)
    return field.value if field is not None else None


def parse_subfields(value: str) -> List[Field]:
    """Parse a nested template value, returning ``[]`` when the value is empty."""
    if len(value) == 0:
        return []
    return parse(value)


def insert_field_sorted(fields: List[Field], field: Field) -> None:
    """Insert a field so the payload stays in ascending numeric tag order."""
    for index, existing in enumerate(fields):
        if int(existing.tag) > int(field.tag):
            fields.insert(index, field)
            return
    fields.append(field)
