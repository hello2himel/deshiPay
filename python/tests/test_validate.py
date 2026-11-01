"""Non-throwing validation reports."""

from __future__ import annotations

import unittest

import _support  # noqa: F401

from deshiqr import (
    Field,
    DeshiQrIssue,
    ValidationReport,
    encode_fields,
    is_bangla_qr,
    validate,
)
from fixtures import (
    DYNAMIC_PAYLOAD,
    LONG_NAME_PAYLOAD,
    MINIMAL_PAYLOAD,
    STATIC_PAYLOAD,
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


def codes(issues):
    return [issue.code for issue in issues]


class ValidPayloadTests(unittest.TestCase):
    def test_every_valid_fixture_validates_cleanly(self):
        for payload in (STATIC_PAYLOAD, DYNAMIC_PAYLOAD, MINIMAL_PAYLOAD, LONG_NAME_PAYLOAD):
            report = validate(payload)
            self.assertTrue(report.ok)
            self.assertEqual(report.errors, [])
            self.assertIsNotNone(report.qr)
        self.assertTrue(is_bangla_qr(STATIC_PAYLOAD))

    def test_report_is_a_validation_report_with_issue_dataclasses(self):
        report = validate(STATIC_PAYLOAD)
        self.assertIsInstance(report, ValidationReport)
        self.assertEqual(report.errors, [])
        self.assertEqual(report.warnings, [])

    def test_warning_issues_are_dataclasses(self):
        report = validate(rebuild(STATIC_PAYLOAD, lambda fields: set_field(fields, "53", "840")))
        self.assertTrue(report.ok)
        self.assertIsInstance(report.warnings[0], DeshiQrIssue)
        self.assertEqual(report.warnings[0].tag, "53")


class ChecksumValidationTests(unittest.TestCase):
    def test_corrupted_checksum_blocks_the_decode(self):
        report = validate(STATIC_PAYLOAD[:-4] + "0000")
        self.assertFalse(report.ok)
        self.assertIsNone(report.qr)
        self.assertEqual(report.errors[0].code, "CHECKSUM_MISMATCH")
        self.assertFalse(is_bangla_qr(STATIC_PAYLOAD[:-4] + "0000"))

    def test_payload_without_a_checksum_field_is_an_error(self):
        report = validate(STATIC_PAYLOAD[:-8])
        self.assertFalse(report.ok)
        self.assertIsNone(report.qr)
        self.assertIn("MISSING_FIELD", codes(report.errors))

    def test_truncated_and_empty_payloads_are_reported_not_thrown(self):
        truncated = validate(STATIC_PAYLOAD[:-12])
        self.assertFalse(truncated.ok)
        self.assertIsNone(truncated.qr)
        self.assertIn("BAD_TLV", codes(truncated.errors))

        for input_ in ("", "   ", None):
            with self.subTest(input_=input_):
                empty = validate(input_)
                self.assertFalse(empty.ok)
                self.assertEqual(empty.errors[0].code, "EMPTY_PAYLOAD")


class FieldValidationTests(unittest.TestCase):
    def test_unrecognised_institution_is_a_warning(self):
        payload = rebuild(
            STATIC_PAYLOAD,
            lambda fields: set_field(fields, "26", encode_fields(_OTHER_INSTITUTION)),
        )
        report = validate(payload)
        self.assertTrue(report.ok)
        self.assertIsNotNone(report.qr)
        self.assertIn("UNSUPPORTED", codes(report.warnings))

    def test_static_qr_carrying_an_amount_is_a_warning(self):
        report = validate(rebuild(DYNAMIC_PAYLOAD, lambda fields: set_field(fields, "01", "11")))
        self.assertTrue(report.ok)
        self.assertIn("BAD_TLV", codes(report.warnings))

    def test_dynamic_qr_without_an_amount_is_a_warning(self):
        report = validate(rebuild(STATIC_PAYLOAD, lambda fields: set_field(fields, "01", "12")))
        self.assertTrue(report.ok)
        self.assertTrue(
            any(issue.code == "BAD_TLV" and issue.tag == "54" for issue in report.warnings)
        )

    def test_non_printable_reference_is_an_error(self):
        report = validate(
            rebuild(
                STATIC_PAYLOAD,
                lambda fields: set_field(fields, "62", "0107bad\x01ref"),
            )
        )
        self.assertFalse(report.ok)
        self.assertIn("BAD_REFERENCE", codes(report.errors))

    def test_non_bdt_currency_and_non_bd_country_are_warnings(self):
        def mutate(fields):
            set_field(fields, "53", "840")
            set_field(fields, "58", "US")

        report = validate(rebuild(STATIC_PAYLOAD, mutate))
        self.assertTrue(report.ok)
        unsupported = [issue for issue in report.warnings if issue.code == "UNSUPPORTED"]
        self.assertEqual(len(unsupported), 2)

    def test_over_long_merchant_name_is_a_warning(self):
        report = validate(
            rebuild(
                STATIC_PAYLOAD,
                lambda fields: set_field(fields, "59", "DEMO STORE WITH A VERY LONG NAME"),
            )
        )
        self.assertTrue(report.ok)
        self.assertTrue(
            any(issue.code == "BAD_TLV" and issue.tag == "59" for issue in report.warnings)
        )

    def test_missing_required_fields_are_errors(self):
        no_account = validate(rebuild(STATIC_PAYLOAD, lambda fields: remove_field(fields, "26")))
        self.assertFalse(no_account.ok)
        self.assertIn("NOT_A_BANGLA_QR", codes(no_account.errors))

        no_name = validate(rebuild(STATIC_PAYLOAD, lambda fields: remove_field(fields, "59")))
        self.assertFalse(no_name.ok)
        self.assertIn("NOT_A_BANGLA_QR", codes(no_name.errors))

    def test_unknown_point_of_initiation_is_an_error(self):
        report = validate(rebuild(STATIC_PAYLOAD, lambda fields: set_field(fields, "01", "99")))
        self.assertFalse(report.ok)
        self.assertIn("UNSUPPORTED", codes(report.errors))

    def test_empty_additional_data_template_is_a_warning(self):
        report = validate(rebuild(STATIC_PAYLOAD, lambda fields: set_field(fields, "62", "")))
        self.assertTrue(report.ok)
        self.assertTrue(
            any(issue.code == "BAD_TLV" and issue.tag == "62" for issue in report.warnings)
        )

    def test_duplicate_tags_are_a_warning(self):
        def mutate(fields):
            fields.insert(1, Field("59", "OTHER STORE"))

        report = validate(rebuild(STATIC_PAYLOAD, mutate))
        self.assertTrue(report.ok)
        self.assertTrue(any("more than once" in issue.message for issue in report.warnings))

    def test_absurdly_large_input_is_rejected_early(self):
        report = validate("0" * 5000)
        self.assertFalse(report.ok)
        self.assertEqual(report.errors[0].code, "UNSUPPORTED")

    def test_missing_format_indicator_is_a_warning(self):
        report = validate(rebuild(STATIC_PAYLOAD, lambda fields: remove_field(fields, "00")))
        self.assertTrue(report.ok)
        self.assertTrue(
            any(issue.code == "MISSING_FIELD" and issue.tag == "00" for issue in report.warnings)
        )

    def test_missing_currency_and_country_are_warnings(self):
        def mutate(fields):
            remove_field(fields, "53")
            remove_field(fields, "58")

        report = validate(rebuild(STATIC_PAYLOAD, mutate))
        self.assertTrue(report.ok)
        missing = [issue for issue in report.warnings if issue.code == "MISSING_FIELD"]
        self.assertEqual(len(missing), 2)

    def test_missing_city_is_not_a_warning(self):
        report = validate(rebuild(STATIC_PAYLOAD, lambda fields: remove_field(fields, "60")))
        self.assertTrue(report.ok)
        self.assertEqual(report.warnings, [])

    def test_token_templates_that_are_not_tlv_warn_but_do_not_fail(self):
        report = validate(rebuild(STATIC_PAYLOAD, lambda fields: set_field(fields, "80", "raw")))
        self.assertTrue(report.ok)
        self.assertTrue(
            any(issue.code == "UNSUPPORTED" and issue.tag == "80" for issue in report.warnings)
        )

    def test_very_long_payload_warns(self):
        def mutate(fields):
            for tag in ("70", "71", "72", "73", "74", "75"):
                set_field(fields, tag, "N" * 99)

        report = validate(rebuild(STATIC_PAYLOAD, mutate))
        self.assertTrue(report.ok)
        self.assertIn("UNSUPPORTED", codes(report.warnings))

    def test_bad_amount_is_an_error(self):
        report = validate(
            rebuild(DYNAMIC_PAYLOAD, lambda fields: set_field(fields, "54", "100000000.00"))
        )
        self.assertFalse(report.ok)
        self.assertIn("BAD_AMOUNT", codes(report.errors))


if __name__ == "__main__":
    unittest.main()
