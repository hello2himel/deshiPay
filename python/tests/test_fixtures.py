"""The synthetic fixtures from docs/demo-payloads.md behave as documented."""

from __future__ import annotations

import unittest

import _support  # noqa: F401

from deshiqr import (
    crc16,
    decode,
    decode_safe,
    encode_fields,
    parse,
    reference_from,
    to_static,
    validate,
    verify_checksum,
    with_amount,
)
from fixtures import (
    BAD_CHECKSUM_PAYLOAD,
    DUMMY_REFERENCE,
    DYNAMIC_PAYLOAD,
    LONG_NAME_PAYLOAD,
    MINIMAL_PAYLOAD,
    STATIC_PAYLOAD,
    TRUNCATED_PAYLOAD,
    rebuild as reseal,
    remove_field,
)


class DemoPayloadTests(unittest.TestCase):
    def test_all_documented_fixtures_have_valid_checksums(self):
        for payload in (STATIC_PAYLOAD, DYNAMIC_PAYLOAD, MINIMAL_PAYLOAD, LONG_NAME_PAYLOAD):
            self.assertTrue(verify_checksum(payload))
            self.assertEqual(payload[-4:], crc16(payload[:-4]))

    def test_static_fixture_is_a_clean_static_qr(self):
        report = validate(STATIC_PAYLOAD)
        self.assertTrue(report.ok)
        self.assertEqual(report.errors, [])
        qr = decode(STATIC_PAYLOAD)
        self.assertEqual(qr.kind, "static")
        self.assertIsNone(qr.amount)
        self.assertEqual(qr.merchant.account, "01000000000")
        self.assertEqual(qr.merchant.institution, "bd.org.bb.npsb")
        self.assertEqual(qr.merchant.name, "DEMO STORE")
        self.assertEqual(qr.merchant.city, "Dhaka")

    def test_dynamic_fixture_is_a_clean_dynamic_qr(self):
        report = validate(DYNAMIC_PAYLOAD)
        self.assertTrue(report.ok)
        qr = decode(DYNAMIC_PAYLOAD)
        self.assertEqual(qr.kind, "dynamic")
        self.assertEqual(qr.amount, 500)
        self.assertEqual(qr.reference, DUMMY_REFERENCE)
        self.assertEqual(len(qr.reference), 25)
        # tag 62 is 35 characters long in the bKash bill-number shape.
        tag62 = [field for field in qr.fields if field.tag == "62"][0]
        self.assertEqual(tag62.value, "0125" + DUMMY_REFERENCE + "0602FT")
        self.assertEqual(len(tag62.value), 35)

    def test_minimal_and_longer_name_fixtures_decode(self):
        minimal = decode(MINIMAL_PAYLOAD)
        self.assertIsNone(minimal.merchant.mcc)
        self.assertEqual(minimal.additional_data, [])

        longer = decode(LONG_NAME_PAYLOAD)
        self.assertEqual(longer.merchant.name, "DEMO SUPER SHOP LTD")
        self.assertEqual(longer.merchant.city, "Chattogram")
        self.assertEqual(longer.merchant.mcc, "5411")

    def test_dynamic_fixture_derives_from_the_static_fixture(self):
        self.assertEqual(to_static(DYNAMIC_PAYLOAD), STATIC_PAYLOAD)
        self.assertEqual(
            with_amount(STATIC_PAYLOAD, 500, reference=DUMMY_REFERENCE), DYNAMIC_PAYLOAD
        )
        self.assertEqual(reference_from(DYNAMIC_PAYLOAD), DUMMY_REFERENCE)

    def test_round_trip_through_parse_and_encode(self):
        for payload in (STATIC_PAYLOAD, DYNAMIC_PAYLOAD, MINIMAL_PAYLOAD, LONG_NAME_PAYLOAD):
            self.assertEqual(encode_fields(parse(payload)), payload)


class InvalidFixtureTests(unittest.TestCase):
    def test_corrupted_checksum(self):
        corrupted = STATIC_PAYLOAD[:-4] + "0000"
        self.assertEqual(corrupted, BAD_CHECKSUM_PAYLOAD)
        self.assertFalse(verify_checksum(corrupted))
        self.assertFalse(decode_safe(corrupted).ok)
        self.assertEqual(decode_safe(corrupted).error.code, "CHECKSUM_MISMATCH")
        report = validate(corrupted)
        self.assertFalse(report.ok)
        self.assertIsNone(report.qr)

    def test_truncated_tlv(self):
        self.assertEqual(TRUNCATED_PAYLOAD, STATIC_PAYLOAD[:-12])
        self.assertFalse(verify_checksum(TRUNCATED_PAYLOAD))
        self.assertFalse(decode_safe(TRUNCATED_PAYLOAD).ok)
        self.assertEqual(decode_safe(TRUNCATED_PAYLOAD).error.code, "BAD_TLV")

    def test_missing_account(self):
        no_account = reseal(STATIC_PAYLOAD, lambda fields: remove_field(fields, "26"))
        self.assertTrue(verify_checksum(no_account))
        result = decode_safe(no_account)
        self.assertFalse(result.ok)
        self.assertEqual(result.error.code, "NOT_A_BANGLA_QR")

    def test_whitespace_padded_payload_still_decodes(self):
        self.assertEqual(decode("\n\t " + STATIC_PAYLOAD + " \n").payload, STATIC_PAYLOAD)


if __name__ == "__main__":
    unittest.main()
