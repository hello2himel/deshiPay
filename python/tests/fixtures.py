"""Synthetic fixtures only.

No real merchant or payment data is used anywhere — see ``docs/demo-payloads.md``
in the repository root. Fake account ``01000000000`` (unassignable operator
prefix), ``DEMO STORE`` / ``Dhaka``, dummy NPSB tokens.
"""

from __future__ import annotations

import _support  # noqa: F401  (side effect: adds src/ to sys.path)

from deshiqr import Field, encode_fields, parse, seal

STATIC_PAYLOAD = (
    "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D"
)

DYNAMIC_PAYLOAD = (
    "00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62350125DEMOQR0VZeK2MfbVRI6w36osd0602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304F835"
)

MINIMAL_PAYLOAD = (
    "00020101021126470014bd.org.bb.npsb0102020204200203110100000000053030505802BD5910DEMO STORE6005Dhaka63049C89"
)

LONG_NAME_PAYLOAD = (
    "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204541153030505802BD5919DEMO SUPER SHOP LTD6010Chattogram630494E0"
)

#: Synthetic 25-character bill number — the length real bKash dynamic QRs use.
DUMMY_REFERENCE = "DEMOQR0VZeK2MfbVRI6w36osd"

DUMMY_TOKEN_A = "ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE="
DUMMY_TOKEN_B = "ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE="

#: Raw tag 80/81 field values (nested TLV: AID + token), preserved verbatim.
TAG80_VALUE = "0014bd.org.bb.npsb0144" + DUMMY_TOKEN_A
TAG81_VALUE = "0014bd.org.bb.npsb0144" + DUMMY_TOKEN_B

#: Corrupted checksum: last four characters replaced.
BAD_CHECKSUM_PAYLOAD = STATIC_PAYLOAD[:-4] + "0000"

#: Truncated TLV: no checksum, incomplete last field.
TRUNCATED_PAYLOAD = STATIC_PAYLOAD[:-12]

#: TLV that starts fine but declares more bytes than it has.
OVERLONG_FIELD = "0005AB"


def rebuild(payload, mutate=None):
    """Rewrite a payload: mutate its fields, then re-seal with a valid checksum."""
    fields = parse(payload)
    mutated = mutate(fields) if mutate is not None else None
    return seal(mutated if mutated is not None else fields)


def set_field(fields, tag, value):
    """Replace one field value or append it when missing."""
    for index, field in enumerate(fields):
        if field.tag == tag:
            fields[index] = Field(tag, value)
            return
    fields.append(Field(tag, value))


def remove_field(fields, tag):
    """Remove every field with a tag."""
    for index in range(len(fields) - 1, -1, -1):
        if fields[index].tag == tag:
            del fields[index]


def encode_subfields(fields):
    """Encode a list of fields as a nested template value."""
    return encode_fields(fields)
