"""Provider-agnostic amount derivation.

The amount is the only thing that changes: tag 01 goes static (11) to dynamic
(12) and tag 54 is inserted. Every provider-specific field — unknown institution
AID, MCC, tokens, additional-data sub-tags — is preserved verbatim.

The fixture below is a synthetic layout that is deliberately *not* the bKash /
NPSB shape (made-up AID, no token templates, no tag 62), so these tests prove the
derivation does not depend on any particular provider.
"""

from __future__ import annotations

import unittest

import _support  # noqa: F401

from deshiqr import (
    TAGS,
    Field,
    crc16,
    encode_fields,
    parse,
    validate,
    verify_checksum,
    with_amount,
)

GENERIC_STATIC = "00020101021126410022example.org.generic-qr0311017000000005204541153030505802BD5912GENERIC SHOP6006Sylhet6304818D"
GENERIC_DYNAMIC_1250_50 = "00020101021226410022example.org.generic-qr03110170000000052045411530305054071250.505802BD5912GENERIC SHOP6006Sylhet630480A2"


def _tlv(tag: str, value: str) -> str:
    return tag + str(len(value)).zfill(2) + value


class ProviderAgnosticDerivationTests(unittest.TestCase):
    def test_only_tag_01_and_54_change(self) -> None:
        derived = with_amount(GENERIC_STATIC, 1250.5, keep_existing_reference=True)
        self.assertEqual(derived, GENERIC_DYNAMIC_1250_50)
        self.assertTrue(verify_checksum(derived))

        before = [field for field in parse(GENERIC_STATIC) if field.tag != TAGS["CRC"]]
        after = [field for field in parse(derived) if field.tag != TAGS["CRC"]]
        self.assertEqual(
            [f for f in after if f.tag not in ("01", "54")],
            [f for f in before if f.tag != "01"],
        )
        self.assertEqual(next(f.value for f in after if f.tag == "01"), "12")
        self.assertEqual(next(f.value for f in after if f.tag == "54"), "1250.50")

    def test_unknown_institution_and_sub_tags_are_preserved(self) -> None:
        before = {field.tag: field.value for field in parse(GENERIC_STATIC)}
        after = {
            field.tag: field.value
            for field in parse(with_amount(GENERIC_STATIC, 1, keep_existing_reference=True))
        }
        for tag in ("26", "52", "53", "58", "59", "60"):
            self.assertEqual(after[tag], before[tag], f"tag {tag} changed")
        self.assertIn("example.org.generic-qr", after["26"])

    def test_payload_without_mcc_city_or_additional_data(self) -> None:
        body = encode_fields(
            [
                Field("00", "01"),
                Field("01", "11"),
                Field("26", _tlv("00", "bd.org.bb.npsb") + _tlv("03", "01700000000")),
                Field("53", "050"),
                Field("58", "BD"),
                Field("59", "MINIMAL"),
            ]
        )
        payload = body + "6304" + crc16(body + "6304")
        fields = parse(with_amount(payload, 42, keep_existing_reference=True))
        tags = [field.tag for field in fields]
        self.assertIn("54", tags)
        self.assertNotIn("52", tags)
        self.assertNotIn("60", tags)
        self.assertNotIn("62", tags)

    def test_other_provider_is_a_decode_warning_not_an_error(self) -> None:
        report = validate(GENERIC_STATIC)
        self.assertTrue(report.ok)
        self.assertTrue(
            any(issue.code == "UNSUPPORTED" and issue.tag == "26" for issue in report.warnings)
        )

    def test_derivation_reseals_and_keeps_crc_valid(self) -> None:
        # `with_amount` re-seals the payload: the output always has a valid CRC,
        # even if the input checksum was damaged (the HTTP API rejects those
        # before deriving; the library itself trusts its caller).
        derived = with_amount(GENERIC_STATIC[:-4] + "0000", 500)
        self.assertTrue(verify_checksum(derived))


if __name__ == "__main__":
    unittest.main()
