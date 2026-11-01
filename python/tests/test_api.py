"""The public API surface matches the documented deshiqr contract."""

from __future__ import annotations

import unittest

import _support  # noqa: F401

import deshiqr


PUBLIC_NAMES = (
    "crc16",
    "parse",
    "encode_field",
    "encode_fields",
    "decode",
    "decode_safe",
    "verify_checksum",
    "is_bangla_qr",
    "validate",
    "to_static",
    "with_amount",
    "build",
    "reference_from",
    "new_reference",
    "amount_to_field",
    "parse_amount_field",
    "format_taka",
    "mask_account",
    "institution_of",
    "KNOWN_INSTITUTIONS",
    "VERSION",
    "MAX_AMOUNT",
    "TAGS",
)


class PublicApiTests(unittest.TestCase):
    def test_documented_names_are_exported(self):
        for name in PUBLIC_NAMES:
            self.assertTrue(hasattr(deshiqr, name), name)
            self.assertIn(name, deshiqr.__all__, name)

    def test_version(self):
        self.assertEqual(deshiqr.VERSION, "0.1.0")
        self.assertEqual(deshiqr.__version__, deshiqr.VERSION)

    def test_max_amount(self):
        self.assertEqual(deshiqr.MAX_AMOUNT, 99_999_999.99)

    def test_tags_match_the_format(self):
        self.assertEqual(
            dict(deshiqr.TAGS),
            {
                "FORMAT": "00",
                "INITIATION": "01",
                "ACCOUNT": "26",
                "MCC": "52",
                "CURRENCY": "53",
                "AMOUNT": "54",
                "COUNTRY": "58",
                "NAME": "59",
                "CITY": "60",
                "ADDITIONAL": "62",
                "CRC": "63",
                "TOKEN_80": "80",
                "TOKEN_81": "81",
            },
        )
        self.assertEqual(deshiqr.TAGS["AMOUNT"], "54")
        self.assertEqual(deshiqr.TAGS.AMOUNT, "54")

    def test_known_institution_shape(self):
        npsb = deshiqr.KNOWN_INSTITUTIONS["bd.org.bb.npsb"]
        self.assertEqual(npsb["id"], "npsb")
        self.assertEqual(npsb["label"], "NPSB Bangla QR")
        self.assertIs(npsb["verified"], True)

    def test_dataclasses_are_exported(self):
        from deshiqr import DecodedQr, DecodeResult, DeshiQrIssue, Field, MerchantDetails, Tokens
        from deshiqr import ValidationReport

        self.assertTrue(hasattr(Field("00", "01"), "tag"))
        self.assertTrue(hasattr(MerchantDetails("A", None, "1", "i", None), "institution"))
        self.assertTrue(hasattr(Tokens(), "tag80"))
        self.assertTrue(hasattr(DecodedQr, "__dataclass_fields__"))
        self.assertTrue(hasattr(DecodeResult(True), "ok"))
        self.assertTrue(hasattr(DeshiQrIssue("BAD_TLV", "m"), "code"))
        self.assertTrue(hasattr(ValidationReport(True), "warnings"))

    def test_error_codes_are_stable_strings(self):
        codes = (
            "EMPTY_PAYLOAD",
            "BAD_TLV",
            "CHECKSUM_MISMATCH",
            "MISSING_FIELD",
            "NOT_A_BANGLA_QR",
            "BAD_AMOUNT",
            "BAD_REFERENCE",
            "UNSUPPORTED",
        )
        self.assertEqual(deshiqr.CODES, codes)
        for code in codes:
            error = deshiqr.DeshiQrError(code, "message", "detail")
            self.assertEqual(error.code, code)
            self.assertEqual(error.detail, "detail")
            self.assertEqual(str(error), "message")
            self.assertEqual(error.message, "message")


if __name__ == "__main__":
    unittest.main()
