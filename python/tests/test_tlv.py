"""TLV parsing/encoding edge cases."""

from __future__ import annotations

import unittest

import _support  # noqa: F401

from deshiqr import (
    MAX_FIELD_LENGTH,
    DeshiQrError,
    Field,
    encode_field,
    encode_fields,
    find_value,
    insert_field_sorted,
    parse,
    parse_subfields,
)
from fixtures import (
    DYNAMIC_PAYLOAD,
    LONG_NAME_PAYLOAD,
    MINIMAL_PAYLOAD,
    OVERLONG_FIELD,
    STATIC_PAYLOAD,
    TRUNCATED_PAYLOAD,
)

CODE = "BAD_TLV"


class TlvTests(unittest.TestCase):
    def assert_bad_tlv(self, fn, *args, message=None):
        with self.assertRaises(DeshiQrError) as caught:
            fn(*args)
        self.assertEqual(caught.exception.code, CODE)
        if message is not None:
            self.assertIn(message, str(caught.exception))

    def test_parse_splits_the_static_fixture(self):
        fields = parse(STATIC_PAYLOAD)
        self.assertEqual(
            [field.tag for field in fields],
            ["00", "01", "26", "52", "53", "58", "59", "60", "62", "80", "81", "63"],
        )
        self.assertEqual(find_value(fields, "59"), "DEMO STORE")
        self.assertEqual(find_value(fields, "60"), "Dhaka")
        self.assertEqual(find_value(fields, "53"), "050")
        self.assertEqual(find_value(fields, "63"), "295D")

    def test_encode_fields_round_trips_every_fixture(self):
        for payload in (STATIC_PAYLOAD, DYNAMIC_PAYLOAD, MINIMAL_PAYLOAD, LONG_NAME_PAYLOAD):
            self.assertEqual(encode_fields(parse(payload)), payload)

    def test_nested_templates_parse_into_their_subtrees(self):
        fields = parse(STATIC_PAYLOAD)
        account = parse_subfields(find_value(fields, "26"))
        self.assertEqual([field.tag for field in account], ["00", "01", "02", "03"])
        self.assertEqual(find_value(account, "00"), "bd.org.bb.npsb")
        self.assertEqual(find_value(account, "03"), "01000000000")

        additional = parse_subfields(find_value(fields, "62"))
        self.assertEqual(additional, [Field("06", "FT")])

        token = parse_subfields(find_value(fields, "80"))
        self.assertEqual(find_value(token, "00"), "bd.org.bb.npsb")
        self.assertEqual(len(find_value(token, "01")), 44)

    def test_parse_trims_surrounding_whitespace(self):
        self.assertEqual(len(parse("  " + STATIC_PAYLOAD + "  ")), 12)

    def test_empty_input_throws_empty_payload(self):
        for input_ in ("", "   ", "\n\t"):
            with self.assertRaises(DeshiQrError) as caught:
                parse(input_)
            self.assertEqual(caught.exception.code, "EMPTY_PAYLOAD")

    def test_non_string_input_throws_empty_payload(self):
        with self.assertRaises(DeshiQrError) as caught:
            parse(None)
        self.assertEqual(caught.exception.code, "EMPTY_PAYLOAD")

    def test_malformed_tlv_throws_bad_tlv_with_a_helpful_message(self):
        cases = (
            ("00", "truncated header"),
            ("0002", "missing value"),
            (OVERLONG_FIELD, "declares more bytes than present"),
            ("XX0201", "non-numeric tag"),
            ("0002A", "one character value"),
        )
        for payload, label in cases:
            with self.subTest(label=label):
                self.assert_bad_tlv(parse, payload)

    def test_truncated_real_payload_throws_bad_tlv(self):
        self.assert_bad_tlv(parse, TRUNCATED_PAYLOAD)

    def test_error_details_carry_tag_and_offset(self):
        with self.assertRaises(DeshiQrError) as caught:
            parse("XX0201")
        self.assertEqual(caught.exception.detail, "XX")

        with self.assertRaises(DeshiQrError) as caught:
            parse("00")
        self.assertEqual(caught.exception.detail, "offset=0")
        self.assertIn("offset 0", str(caught.exception))

    def test_encode_field_enforces_two_digit_tag_and_value_limit(self):
        self.assertEqual(encode_field(Field("59", "DEMO")), "5904DEMO")
        self.assertEqual(encode_field(Field("62", "")), "6200")
        self.assert_bad_tlv(encode_field, Field("5", "x"))
        self.assert_bad_tlv(
            encode_field, Field("59", "x" * (MAX_FIELD_LENGTH + 1))
        )
        self.assert_bad_tlv(encode_field, Field("59", 123))

    def test_encode_field_accepts_99_characters(self):
        self.assertEqual(encode_field(Field("59", "x" * 99)), "5999" + "x" * 99)

    def test_insert_field_sorted_keeps_ascending_numeric_tag_order(self):
        fields = [field for field in parse(MINIMAL_PAYLOAD) if field.tag != "63"]
        insert_field_sorted(fields, Field("54", "500.00"))
        tags = [field.tag for field in fields]
        self.assertGreater(tags.index("54"), tags.index("53"))
        self.assertLess(tags.index("54"), tags.index("58"))

        insert_field_sorted(fields, Field("62", "0602FT"))
        with_additional = [field.tag for field in fields]
        self.assertGreater(with_additional.index("62"), with_additional.index("60"))

    def test_insert_field_sorted_appends_when_greater_than_all(self):
        fields = [Field("00", "01"), Field("63", "0000")]
        insert_field_sorted(fields, Field("80", "x"))
        self.assertEqual(fields[-1].tag, "80")


if __name__ == "__main__":
    unittest.main()
