"""Decoding payloads into structured details."""

from __future__ import annotations

import unittest

import _support  # noqa: F401

from deshiqr import (
    KNOWN_INSTITUTIONS,
    DeshiQrError,
    decode,
    decode_safe,
    encode_fields,
    Field,
    institution_of,
    parse,
    parse_subfields,
    verify_checksum,
)
from fixtures import (
    DUMMY_REFERENCE,
    DYNAMIC_PAYLOAD,
    LONG_NAME_PAYLOAD,
    MINIMAL_PAYLOAD,
    STATIC_PAYLOAD,
    TAG80_VALUE,
    TAG81_VALUE,
    rebuild,
    remove_field,
    set_field,
)

_OTHER_INSTITUTION = [
    Field("00", "example.org.bank"),
    Field("01", "02"),
    Field("02", "2002"),
    Field("03", "01000000000"),
]


def assert_code(testcase, code, fn, *args):
    with testcase.assertRaises(DeshiQrError) as caught:
        fn(*args)
    testcase.assertEqual(caught.exception.code, code)


class DecodeStaticTests(unittest.TestCase):
    def test_decodes_the_static_fixture(self):
        qr = decode(STATIC_PAYLOAD)
        self.assertEqual(qr.kind, "static")
        self.assertIsNone(qr.amount)
        self.assertIsNone(qr.amount_text)
        self.assertEqual(qr.currency, "BDT")
        self.assertEqual(qr.country, "BD")
        self.assertEqual(qr.merchant.name, "DEMO STORE")
        self.assertEqual(qr.merchant.city, "Dhaka")
        self.assertEqual(qr.merchant.account, "01000000000")
        self.assertEqual(qr.merchant.institution, "bd.org.bb.npsb")
        self.assertEqual(qr.merchant.mcc, "6016")
        self.assertIsNone(qr.reference)
        self.assertEqual(qr.customer_label, "FT")
        self.assertEqual(qr.tokens.tag80, TAG80_VALUE)
        self.assertEqual(qr.tokens.tag81, TAG81_VALUE)
        self.assertEqual(qr.checksum, "295D")
        self.assertEqual(len(qr.account_template), 4)
        self.assertEqual(len(qr.fields), 12)
        self.assertEqual(qr.payload, STATIC_PAYLOAD)

    def test_decodes_a_minimal_payload_without_mcc_tokens_or_additional_data(self):
        qr = decode(MINIMAL_PAYLOAD)
        self.assertIsNone(qr.merchant.mcc)
        self.assertEqual(qr.merchant.city, "Dhaka")
        self.assertIsNone(qr.tokens.tag80)
        self.assertIsNone(qr.tokens.tag81)
        self.assertEqual(qr.additional_data, [])
        self.assertIsNone(qr.reference)

    def test_decodes_the_long_name_fixture(self):
        qr = decode(LONG_NAME_PAYLOAD)
        self.assertEqual(qr.merchant.name, "DEMO SUPER SHOP LTD")
        self.assertEqual(qr.merchant.city, "Chattogram")
        self.assertEqual(qr.merchant.mcc, "5411")

    def test_trims_surrounding_whitespace(self):
        self.assertEqual(decode("  " + STATIC_PAYLOAD + "  ").payload, STATIC_PAYLOAD)


class DecodeDynamicTests(unittest.TestCase):
    def test_decodes_the_dynamic_fixture(self):
        qr = decode(DYNAMIC_PAYLOAD)
        self.assertEqual(qr.kind, "dynamic")
        self.assertEqual(qr.amount, 500)
        self.assertEqual(qr.amount_text, "500.00")
        self.assertEqual(qr.reference, DUMMY_REFERENCE)
        self.assertEqual(len(qr.reference), 25)
        self.assertEqual(qr.customer_label, "FT")
        self.assertEqual(len(qr.fields), 13)

    def test_decodes_the_amount_as_a_number(self):
        qr = decode(rebuild(DYNAMIC_PAYLOAD, lambda fields: set_field(fields, "54", "1234.50")))
        self.assertEqual(qr.amount, 1234.5)
        self.assertEqual(qr.amount_text, "1234.50")


class InstitutionTests(unittest.TestCase):
    def test_npsb_is_the_only_verified_institution_today(self):
        qr = decode(STATIC_PAYLOAD)
        self.assertEqual(institution_of(qr), KNOWN_INSTITUTIONS["bd.org.bb.npsb"])
        self.assertTrue(institution_of(qr)["verified"])
        self.assertEqual(len(KNOWN_INSTITUTIONS), 1)

    def test_unknown_institution_decodes_generically(self):
        unknown = rebuild(
            STATIC_PAYLOAD,
            lambda fields: set_field(fields, "26", encode_fields(_OTHER_INSTITUTION)),
        )
        qr = decode(unknown)
        self.assertEqual(qr.merchant.institution, "example.org.bank")
        self.assertIsNone(institution_of(qr))
        self.assertTrue(verify_checksum(unknown))

    def test_unknown_currency_falls_back_to_the_raw_numeric_code(self):
        qr = decode(rebuild(STATIC_PAYLOAD, lambda fields: set_field(fields, "53", "999")))
        self.assertEqual(qr.currency, "999")

    def test_known_currency_map(self):
        qr = decode(rebuild(STATIC_PAYLOAD, lambda fields: set_field(fields, "53", "840")))
        self.assertEqual(qr.currency, "USD")


class DecodeErrorTests(unittest.TestCase):
    def test_checksum_mismatch(self):
        corrupted = STATIC_PAYLOAD[:-4] + "0000"
        assert_code(self, "CHECKSUM_MISMATCH", decode, corrupted)

    def test_missing_checksum_field(self):
        without_checksum = STATIC_PAYLOAD[:-8]
        assert_code(self, "MISSING_FIELD", decode, without_checksum)

    def test_invalid_checksum_hex(self):
        payload = STATIC_PAYLOAD[:-4] + "ZZZZ"
        assert_code(self, "BAD_TLV", decode, payload)

    def test_missing_account_template_or_name(self):
        no_account = rebuild(STATIC_PAYLOAD, lambda fields: remove_field(fields, "26"))
        assert_code(self, "NOT_A_BANGLA_QR", decode, no_account)
        no_name = rebuild(STATIC_PAYLOAD, lambda fields: remove_field(fields, "59"))
        assert_code(self, "NOT_A_BANGLA_QR", decode, no_name)

    def test_account_template_without_institution_or_account(self):
        without_institution = rebuild(
            STATIC_PAYLOAD,
            lambda fields: set_field(
                fields, "26", encode_fields([Field("01", "02"), Field("03", "01000000000")])
            ),
        )
        assert_code(self, "NOT_A_BANGLA_QR", decode, without_institution)
        without_account = rebuild(
            STATIC_PAYLOAD,
            lambda fields: set_field(
                fields, "26", encode_fields([Field("00", "bd.org.bb.npsb"), Field("01", "02")])
            ),
        )
        assert_code(self, "NOT_A_BANGLA_QR", decode, without_account)

    def test_unknown_point_of_initiation(self):
        unknown_poi = rebuild(STATIC_PAYLOAD, lambda fields: set_field(fields, "01", "99"))
        assert_code(self, "UNSUPPORTED", decode, unknown_poi)

    def test_bad_amount_field(self):
        bad_amount = rebuild(DYNAMIC_PAYLOAD, lambda fields: set_field(fields, "54", "5,00"))
        assert_code(self, "BAD_AMOUNT", decode, bad_amount)

    def test_bad_additional_template(self):
        payload = rebuild(STATIC_PAYLOAD, lambda fields: set_field(fields, "62", "not tlv"))
        assert_code(self, "BAD_TLV", decode, payload)

    def test_empty_payload(self):
        assert_code(self, "EMPTY_PAYLOAD", decode, "   ")

    def test_error_exposes_code_message_and_detail(self):
        with self.assertRaises(DeshiQrError) as caught:
            decode("nonsense")
        error = caught.exception
        self.assertEqual(error.code, "BAD_TLV")
        self.assertIsInstance(error.message, str)
        self.assertEqual(str(error), error.message)
        self.assertIsNotNone(error.detail)

    def test_error_codes_are_the_documented_strings(self):
        from deshiqr import CODES

        self.assertEqual(
            CODES,
            (
                "EMPTY_PAYLOAD",
                "BAD_TLV",
                "CHECKSUM_MISMATCH",
                "MISSING_FIELD",
                "NOT_A_BANGLA_QR",
                "BAD_AMOUNT",
                "BAD_REFERENCE",
                "UNSUPPORTED",
            ),
        )


class DecodeSafeTests(unittest.TestCase):
    def test_returns_a_result_instead_of_throwing(self):
        ok = decode_safe(STATIC_PAYLOAD)
        self.assertTrue(ok.ok)
        self.assertEqual(ok.qr.merchant.name, "DEMO STORE")
        self.assertIsNone(ok.error)

        bad = decode_safe("not a qr")
        self.assertFalse(bad.ok)
        self.assertIsNone(bad.qr)
        self.assertIsInstance(bad.error, DeshiQrError)
        self.assertEqual(bad.error.code, "BAD_TLV")


class AccountTemplateTests(unittest.TestCase):
    def test_account_template_subtree_is_exposed(self):
        qr = decode(STATIC_PAYLOAD)
        self.assertEqual(
            [field.tag for field in qr.account_template], ["00", "01", "02", "03"]
        )
        self.assertEqual(qr.account_template, parse_subfields(qr.fields[2].value))


if __name__ == "__main__":
    unittest.main()
