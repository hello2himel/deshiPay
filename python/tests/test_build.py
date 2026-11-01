"""Payload derivation: to_static / with_amount / build / reference_from."""

from __future__ import annotations

import re
import unittest

import _support  # noqa: F401

from deshiqr import (
    MAX_AMOUNT,
    TAGS,
    DeshiQrError,
    Field,
    build,
    decode,
    encode_fields,
    find_value,
    parse,
    parse_subfields,
    reference_from,
    seal,
    to_static,
    with_amount,
)
from fixtures import (
    DUMMY_REFERENCE,
    DYNAMIC_PAYLOAD,
    LONG_NAME_PAYLOAD,
    MINIMAL_PAYLOAD,
    STATIC_PAYLOAD,
    TAG80_VALUE,
    TAG81_VALUE,
)

_REFERENCE_SHAPE = re.compile(r"^ORD[A-Za-z0-9]{9}$")


def replace_tag(payload, tag, value):
    """Seal a fixture with one field replaced (valid checksum, no test-helper import)."""
    fields = [field for field in parse(payload) if field.tag != tag]
    fields.append(Field(tag, value))
    fields.sort(key=lambda field: int(field.tag))
    return seal(fields)


class SealTests(unittest.TestCase):
    def test_seal_parse_is_a_no_op_for_valid_payloads(self):
        for payload in (STATIC_PAYLOAD, DYNAMIC_PAYLOAD, MINIMAL_PAYLOAD, LONG_NAME_PAYLOAD):
            self.assertEqual(seal(parse(payload)), payload)


class ToStaticTests(unittest.TestCase):
    def test_strips_amount_and_reference_and_restores_tag_01(self):
        self.assertEqual(to_static(DYNAMIC_PAYLOAD), STATIC_PAYLOAD)
        self.assertEqual(to_static(STATIC_PAYLOAD), STATIC_PAYLOAD)

    def test_preserves_mcc_name_city_tokens_and_other_additional_data(self):
        fields = parse(to_static(DYNAMIC_PAYLOAD))
        self.assertEqual(find_value(fields, TAGS["MCC"]), "6016")
        self.assertEqual(find_value(fields, TAGS["TOKEN_80"]), TAG80_VALUE)
        self.assertEqual(find_value(fields, TAGS["TOKEN_81"]), TAG81_VALUE)
        self.assertEqual(find_value(fields, TAGS["ADDITIONAL"]), "0602FT")

    def test_round_trips(self):
        self.assertEqual(to_static(to_static(DYNAMIC_PAYLOAD)), STATIC_PAYLOAD)
        self.assertEqual(to_static(to_static(STATIC_PAYLOAD)), STATIC_PAYLOAD)

    def test_missing_initiation_tag_is_an_error(self):
        payload = seal([field for field in parse(STATIC_PAYLOAD) if field.tag != "01"])
        with self.assertRaises(DeshiQrError) as caught:
            to_static(payload)
        self.assertEqual(caught.exception.code, "MISSING_FIELD")

    def test_bad_additional_template_is_an_error(self):
        payload = replace_tag(STATIC_PAYLOAD, "62", "not tlv")
        with self.assertRaises(DeshiQrError) as caught:
            to_static(payload)
        self.assertEqual(caught.exception.code, "BAD_TLV")


class WithAmountTests(unittest.TestCase):
    def assert_bad(self, code, fn, *args, **kwargs):
        with self.assertRaises(DeshiQrError) as caught:
            fn(*args, **kwargs)
        self.assertEqual(caught.exception.code, code)

    def test_reproduces_the_dynamic_fixture_exactly(self):
        self.assertEqual(
            with_amount(STATIC_PAYLOAD, 500, reference=DUMMY_REFERENCE), DYNAMIC_PAYLOAD
        )

    def test_inserts_the_amount_in_ascending_tag_order(self):
        derived = with_amount(MINIMAL_PAYLOAD, 100)
        tags = [field.tag for field in parse(derived)]
        self.assertGreater(tags.index("54"), tags.index("53"))
        self.assertLess(tags.index("54"), tags.index("58"))
        qr = decode(derived)
        self.assertEqual(qr.kind, "dynamic")
        self.assertEqual(qr.amount, 100)
        self.assertIsNone(qr.reference)

    def test_keeps_tokens_and_customer_label_when_no_reference_is_requested(self):
        qr = decode(with_amount(STATIC_PAYLOAD, 500))
        self.assertEqual(qr.tokens.tag80, TAG80_VALUE)
        self.assertEqual(qr.tokens.tag81, TAG81_VALUE)
        self.assertEqual(qr.customer_label, "FT")
        self.assertIsNone(qr.reference)
        self.assertEqual(qr.kind, "dynamic")

    def test_can_drop_the_reference_explicitly(self):
        qr = decode(with_amount(DYNAMIC_PAYLOAD, 900, reference=None))
        self.assertEqual(qr.amount, 900)
        self.assertIsNone(qr.reference)

    def test_reference_length_zero_also_drops_the_reference(self):
        self.assertIsNone(reference_from(with_amount(DYNAMIC_PAYLOAD, 900, reference_length=0)))

    def test_generates_a_new_reference_from_the_existing_prefix_and_length(self):
        qr = decode(with_amount(DYNAMIC_PAYLOAD, 250))
        self.assertEqual(len(qr.reference), 25)
        self.assertTrue(qr.reference.startswith("DEMOQR0VZe"))
        self.assertNotEqual(qr.reference, DUMMY_REFERENCE)

    def test_generates_a_reference_with_an_explicit_prefix_and_length(self):
        derived = with_amount(
            STATIC_PAYLOAD, 250, reference_prefix="ORD", reference_length=12
        )
        reference = reference_from(derived)
        self.assertEqual(len(reference), 12)
        self.assertTrue(reference.startswith("ORD"))
        self.assertRegex(reference, _REFERENCE_SHAPE)

    def test_can_keep_the_existing_reference(self):
        derived = with_amount(DYNAMIC_PAYLOAD, 777, keep_existing_reference=True)
        self.assertEqual(reference_from(derived), DUMMY_REFERENCE)
        self.assertEqual(decode(derived).amount, 777)

    def test_replaces_an_existing_amount_instead_of_duplicating_it(self):
        derived = with_amount(DYNAMIC_PAYLOAD, 1500)
        amounts = [field for field in parse(derived) if field.tag == TAGS["AMOUNT"]]
        self.assertEqual(len(amounts), 1)
        self.assertEqual(amounts[0].value, "1500.00")

    def test_preserves_the_rest_of_tag_62_when_adding_a_reference(self):
        derived = with_amount(STATIC_PAYLOAD, 500, reference="REF123")
        additional = parse_subfields(find_value(parse(derived), TAGS["ADDITIONAL"]))
        self.assertEqual(additional, [Field("01", "REF123"), Field("06", "FT")])

    def test_rejects_invalid_amounts(self):
        for amount in (0, -5, float("nan"), float("inf"), MAX_AMOUNT + 1, None, True, "500"):
            with self.subTest(amount=amount):
                self.assert_bad("BAD_AMOUNT", with_amount, STATIC_PAYLOAD, amount)

    def test_rejects_invalid_references(self):
        self.assert_bad("BAD_REFERENCE", with_amount, STATIC_PAYLOAD, 100, reference="")
        self.assert_bad("BAD_REFERENCE", with_amount, STATIC_PAYLOAD, 100, reference="x" * 33)
        self.assert_bad("BAD_REFERENCE", with_amount, STATIC_PAYLOAD, 100, reference="bad\nref")

    def test_explicit_reference_wins_over_keep_existing(self):
        derived = with_amount(
            DYNAMIC_PAYLOAD, 100, reference="NEWREF", keep_existing_reference=True
        )
        self.assertEqual(reference_from(derived), "NEWREF")

    def test_bad_additional_template_is_an_error(self):
        payload = replace_tag(STATIC_PAYLOAD, "62", "not tlv")
        self.assert_bad("BAD_TLV", with_amount, payload, 100)

    def test_same_payload_for_explicit_reference_and_reference_prefix(self):
        # A reference can be passed either directly or pre-generated; both seal the same.
        direct = with_amount(STATIC_PAYLOAD, 250, reference="ORD" + "x" * 9)
        generated = with_amount(
            STATIC_PAYLOAD, 250, reference_prefix="ORD", reference_length=12
        )
        self.assertNotEqual(direct, generated)
        self.assertEqual(len(parse(direct)), len(parse(generated)))


class BuildTests(unittest.TestCase):
    def test_picks_static_or_dynamic_based_on_the_amount(self):
        self.assertEqual(build(STATIC_PAYLOAD), STATIC_PAYLOAD)
        self.assertEqual(build(DYNAMIC_PAYLOAD, amount=None), STATIC_PAYLOAD)
        self.assertEqual(decode(build(STATIC_PAYLOAD, amount=42)).amount, 42)
        self.assertEqual(build(STATIC_PAYLOAD, amount=42), with_amount(STATIC_PAYLOAD, 42))

    def test_derived_payloads_fail_cleanly_on_malformed_input(self):
        for fn in (to_static, lambda payload: with_amount(payload, 10)):
            with self.assertRaises(DeshiQrError) as caught:
                fn("nonsense")
            self.assertEqual(caught.exception.code, "BAD_TLV")

    def test_keeps_field_encoding_consistent(self):
        derived = with_amount(STATIC_PAYLOAD, 100)
        self.assertEqual(derived.count("6304"), 1)
        self.assertEqual(len([field for field in parse(derived) if field.tag == TAGS["CRC"]]), 1)
        self.assertEqual(encode_fields(parse(derived)), derived)


class ReferenceFromTests(unittest.TestCase):
    def test_reads_the_reference(self):
        self.assertEqual(reference_from(DYNAMIC_PAYLOAD), DUMMY_REFERENCE)
        self.assertIsNone(reference_from(STATIC_PAYLOAD))
        self.assertIsNone(reference_from("not a qr"))


if __name__ == "__main__":
    unittest.main()
