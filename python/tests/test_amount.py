"""Amount, BDT formatting and account-masking helpers."""

from __future__ import annotations

import math
import unittest

import _support  # noqa: F401

from deshiqr import (
    MAX_AMOUNT,
    DeshiQrError,
    amount_to_field,
    format_taka,
    mask_account,
    parse_amount_field,
)


class AmountToFieldTests(unittest.TestCase):
    def assert_bad_amount(self, fn, *args):
        with self.assertRaises(DeshiQrError) as caught:
            fn(*args)
        self.assertEqual(caught.exception.code, "BAD_AMOUNT")

    def test_always_renders_two_decimals(self):
        self.assertEqual(amount_to_field(1), "1.00")
        self.assertEqual(amount_to_field(500), "500.00")
        self.assertEqual(amount_to_field(0.01), "0.01")
        self.assertEqual(amount_to_field(1234.5), "1234.50")
        self.assertEqual(amount_to_field(MAX_AMOUNT), "99999999.99")

    def test_rounds_to_two_decimals(self):
        self.assertEqual(amount_to_field(10.994), "10.99")
        self.assertEqual(amount_to_field(10.996), "11.00")
        self.assertEqual(amount_to_field(1.005), "1.00")
        self.assertEqual(amount_to_field(0.005), "0.01")

    def test_rejects_invalid_amounts(self):
        for amount in (0, -1, float("nan"), float("inf"), -float("inf"), True, "500"):
            with self.subTest(amount=amount):
                self.assert_bad_amount(amount_to_field, amount)
        self.assert_bad_amount(amount_to_field, MAX_AMOUNT + 1)

    def test_accepts_int_and_float(self):
        self.assertEqual(amount_to_field(500), amount_to_field(500.0))


class ParseAmountFieldTests(unittest.TestCase):
    def test_accepts_valid_emv_amounts(self):
        self.assertEqual(parse_amount_field("500.00"), 500)
        self.assertEqual(parse_amount_field("0.01"), 0.01)
        self.assertEqual(parse_amount_field("99999999.99"), MAX_AMOUNT)
        self.assertEqual(parse_amount_field("000500.00"), 500)

    def test_rejects_malformed_or_out_of_range_amounts(self):
        for text in ("", "5,00", "-1", "1.234", "abc", "0", "0.00", "100000000.00", None, 500):
            with self.subTest(text=text):
                with self.assertRaises(DeshiQrError) as caught:
                    parse_amount_field(text)
                self.assertEqual(caught.exception.code, "BAD_AMOUNT")


class FormatTakaTests(unittest.TestCase):
    def test_formats_bdt_amounts(self):
        self.assertEqual(format_taka(500), "৳500")
        self.assertEqual(format_taka(500.5), "৳500.50")
        self.assertEqual(format_taka(1234567.891), "৳1,234,567.89")
        self.assertEqual(format_taka(1000, symbol=False), "1,000")
        self.assertEqual(format_taka(500, decimals=2), "৳500.00")

    def test_handles_negative_amounts(self):
        self.assertEqual(format_taka(-500), "৳-500")
        self.assertEqual(format_taka(-500.5), "৳-500.50")
        self.assertEqual(format_taka(-1250.5), "৳-1,250.50")

    def test_rounds_like_the_js_intl_formatter(self):
        # V8/ICU rounds the shortest decimal representation, half away from zero.
        self.assertEqual(format_taka(1.005), "৳1.01")
        self.assertEqual(format_taka(2.675), "৳2.68")
        self.assertEqual(format_taka(123456789.125), "৳123,456,789.13")
        self.assertEqual(format_taka(0.1 + 0.2), "৳0.30")

    def test_zero_and_non_finite(self):
        self.assertEqual(format_taka(0), "৳0")
        self.assertEqual(format_taka(-0.0), "৳-0")
        self.assertEqual(format_taka(float("nan")), "৳NaN")
        self.assertEqual(format_taka(float("inf")), "৳∞")
        self.assertEqual(format_taka(-math.inf), "৳-∞")

    def test_symbol_false_and_explicit_decimals(self):
        self.assertEqual(format_taka(1250.5, False), "1,250.50")
        self.assertEqual(format_taka(1250.5, symbol=False, decimals=0), "1,251")
        self.assertEqual(format_taka(1250.5, symbol=False, decimals=2), "1,250.50")

    def test_rejects_non_number_amounts(self):
        with self.assertRaises(TypeError):
            format_taka("500")

    def test_rejects_invalid_decimals(self):
        for decimals in (-1, 101, 2.5, True):
            with self.subTest(decimals=decimals):
                with self.assertRaises(ValueError):
                    format_taka(500, decimals=decimals)


class MaskAccountTests(unittest.TestCase):
    def test_hides_the_middle_of_an_account(self):
        self.assertEqual(mask_account("01000000000"), "01000•••000")
        self.assertEqual(mask_account("1234"), "••••")
        self.assertEqual(mask_account("123456"), "12••56")
        self.assertEqual(mask_account(""), "")

    def test_boundary_lengths(self):
        self.assertEqual(mask_account("12345"), "12•45")
        self.assertEqual(mask_account("1234567"), "12•••67")
        self.assertEqual(mask_account("12345678"), "12345•••678")

    def test_non_string_returns_empty(self):
        self.assertEqual(mask_account(None), "")
        self.assertEqual(mask_account(12345), "")


if __name__ == "__main__":
    unittest.main()
