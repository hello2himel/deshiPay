"""Payment-reference generation."""

from __future__ import annotations

import re
import unittest

import _support  # noqa: F401

from deshiqr import DEFAULT_REFERENCE_LENGTH, DeshiQrError, new_reference

_ALNUM_25 = re.compile(r"^[A-Za-z0-9]{25}$")


class NewReferenceTests(unittest.TestCase):
    def assert_bad_reference(self, fn, *args, **kwargs):
        with self.assertRaises(DeshiQrError) as caught:
            fn(*args, **kwargs)
        self.assertEqual(caught.exception.code, "BAD_REFERENCE")

    def test_defaults_to_the_25_character_bill_number_shape(self):
        reference = new_reference()
        self.assertEqual(DEFAULT_REFERENCE_LENGTH, 25)
        self.assertEqual(len(reference), 25)
        self.assertRegex(reference, _ALNUM_25)

    def test_keeps_the_prefix_and_fills_the_rest(self):
        reference = new_reference(prefix="FT80", length=10)
        self.assertEqual(len(reference), 10)
        self.assertTrue(reference.startswith("FT80"))
        self.assertRegex(reference, re.compile(r"^[A-Za-z0-9]{10}$"))

    def test_supports_any_length_from_1_to_32(self):
        for length in (1, 2, 5, 12, 32):
            self.assertEqual(len(new_reference(length=length)), length)

    def test_returns_the_prefix_alone_when_it_fills_the_reference(self):
        self.assertEqual(new_reference(prefix="DEMO123456", length=10), "DEMO123456")

    def test_does_not_repeat_itself(self):
        seen = {new_reference() for _ in range(200)}
        self.assertEqual(len(seen), 200)

    def test_rejects_impossible_prefixes_and_lengths(self):
        self.assert_bad_reference(new_reference, length=0)
        self.assert_bad_reference(new_reference, length=33)
        self.assert_bad_reference(new_reference, length=4.5)
        self.assert_bad_reference(new_reference, length=True)
        self.assert_bad_reference(new_reference, prefix="has space")
        self.assert_bad_reference(new_reference, prefix="TOOLONGPREFIX", length=4)
        self.assert_bad_reference(new_reference, prefix=None)
        self.assert_bad_reference(new_reference, prefix="a" * 33, length=32)


if __name__ == "__main__":
    unittest.main()
