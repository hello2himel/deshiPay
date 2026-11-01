"""Internal TLV helpers: strict parsing, encoding and path handling.

Mirrors ``packages/deshiqr/src/core/tlv.ts`` exactly. Bangla QR payloads are
EMVCo-style TLV strings: ``TT LL VV…`` with two decimal digits for both tag and
length. Templates carry a nested TLV value. Parsing is strict: malformed input
raises :class:`~deshiqr.errors.DeshiQrError` with code ``BAD_TLV`` instead of
silently truncating.

This module is internal. Only the two public functions are supported API.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

from .errors import DeshiQrError

#: The format allows at most 99 characters per field value.
MAX_VALUE_LENGTH = 99

#: Tag that always holds the checksum, and is always re-sealed after edits.
CRC_TAG = "63"

_TAG_RE = re.compile(r"^[0-9]{2}$")
_LENGTH_RE = re.compile(r"^[0-9]{2}$")


@dataclass
class Field:
    """A single ``TT LL VV…`` field. ``tag`` is always two digits."""

    tag: str
    value: str


def normalize(payload: object) -> str:
    """Trim surrounding whitespace; non-string payloads become ``""``."""
    return payload.strip() if isinstance(payload, str) else ""


def is_tag_path(value: object) -> bool:
    """True when ``value`` is a valid tag path such as ``"54"`` or ``"62/01"``."""
    from .fields import TAG_PATH_RE

    return isinstance(value, str) and TAG_PATH_RE.fullmatch(value) is not None


def path_components(path: str) -> List[str]:
    """Split a validated tag path into its two-digit components."""
    return path.split("/")


def is_hex_checksum(value: object) -> bool:
    """True when ``value`` looks like a four-hex-digit checksum."""
    return isinstance(value, str) and re.fullmatch(r"[0-9A-Fa-f]{4}", value) is not None


def parse(payload: object) -> List[Field]:
    """Parse a TLV string into fields, preserving order.

    Normalizes (trims) the input like the JavaScript implementation; empty input
    raises ``EMPTY_PAYLOAD`` and malformed input raises ``BAD_TLV``.
    """
    text = normalize(payload)
    if len(text) == 0:
        raise DeshiQrError("EMPTY_PAYLOAD", "The payload is empty.")

    fields: List[Field] = []
    offset = 0
    total = len(text)

    while offset < total:
        if offset + 4 > total:
            raise DeshiQrError(
                "BAD_TLV",
                "Malformed payload: truncated field at offset {}.".format(offset),
            )

        tag = text[offset : offset + 2]
        if _TAG_RE.fullmatch(tag) is None:
            raise DeshiQrError(
                "BAD_TLV",
                'Malformed payload: invalid tag "{}" at offset {}.'.format(tag, offset),
                tag,
            )

        raw_length = text[offset + 2 : offset + 4]
        if _LENGTH_RE.fullmatch(raw_length) is None:
            raise DeshiQrError(
                "BAD_TLV",
                'Malformed payload: invalid length "{}" for tag {} at offset {}.'.format(
                    raw_length, tag, offset
                ),
                tag,
            )

        length = int(raw_length)
        value_start = offset + 4
        value_end = value_start + length
        if value_end > total:
            raise DeshiQrError(
                "BAD_TLV",
                "Malformed payload: tag {} claims {} characters but only {} remain.".format(
                    tag, length, total - value_start
                ),
                tag,
            )

        fields.append(Field(tag, text[value_start:value_end]))
        offset = value_end

    return fields


def parse_subfields(value: str) -> List[Field]:
    """Parse a nested template value; an empty value is an empty (valid) template."""
    if len(value) == 0:
        return []
    return parse(value)


def parse_template(value: str, path: str) -> List[Field]:
    """Parse a template value, raising ``BAD_TLV`` tagged with ``path`` on failure."""
    try:
        return parse_subfields(value)
    except DeshiQrError:
        raise DeshiQrError(
            "BAD_TLV",
            "Malformed payload: tag {} is not a valid TLV template.".format(path),
            path,
        ) from None


def encode_field(field: Field) -> str:
    """Encode one field as ``TTLLVV…``."""
    tag = field.tag
    value = field.value
    if not isinstance(tag, str) or _TAG_RE.fullmatch(tag) is None:
        raise DeshiQrError(
            "BAD_TLV",
            'Malformed payload: invalid tag "{}".'.format(tag),
            str(tag),
        )
    if not isinstance(value, str):
        raise DeshiQrError(
            "BAD_VALUE",
            "Value for tag {} must be a string.".format(tag),
            tag,
        )
    if len(value) > MAX_VALUE_LENGTH:
        raise DeshiQrError(
            "BAD_VALUE",
            "Value for tag {} is longer than {} characters.".format(tag, MAX_VALUE_LENGTH),
            tag,
        )
    return tag + "{:02d}".format(len(value)) + value


def encode_fields(fields: List[Field]) -> str:
    """Encode a list of fields back into a TLV string."""
    return "".join(encode_field(field) for field in fields)


def find_field(fields: List[Field], tag: str) -> Optional[Field]:
    """First field with ``tag``, or ``None``."""
    for field in fields:
        if field.tag == tag:
            return field
    return None


def find_value(fields: List[Field], tag: str) -> Optional[str]:
    """Value of the first field with ``tag``, or ``None``."""
    field = find_field(fields, tag)
    return field.value if field is not None else None


def remove_all(fields: List[Field], tag: str) -> None:
    """Remove every field with ``tag``, in place."""
    fields[:] = [field for field in fields if field.tag != tag]


def insert_sorted(fields: List[Field], field: Field) -> None:
    """Insert ``field`` in ascending numeric tag order at its level."""
    target = int(field.tag)
    for index, existing in enumerate(fields):
        if int(existing.tag) > target:
            fields.insert(index, field)
            return
    fields.append(field)
