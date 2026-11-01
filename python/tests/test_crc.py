"""CRC-16/CCITT-FALSE and checksum verification."""

from __future__ import annotations

import re
import unittest

import _support  # noqa: F401

from deshiqr import crc16, verify_checksum
from fixtures import (
    BAD_CHECKSUM_PAYLOAD,
    DYNAMIC_PAYLOAD,
    LONG_NAME_PAYLOAD,
    MINIMAL_PAYLOAD,
    STATIC_PAYLOAD,
    rebuild,
    set_field,
)


class CrcTests(unittest.TestCase):
    def test_anchor_vector(self):
        self.assertEqual(crc16("123456789"), "29B1")

    def test_empty_string_hashes_to_ffff(self):
        self.assertEqual(crc16(""), "FFFF")
        for input_ in ("", "a", "bangla qr", "123456789"):
            self.assertRegex(crc16(input_), re.compile(r"^[0-9A-F]{4}$"))

    def test_fixture_checksums_are_valid(self):
        for payload in (STATIC_PAYLOAD, DYNAMIC_PAYLOAD, MINIMAL_PAYLOAD, LONG_NAME_PAYLOAD):
            expected = crc16(payload[:-4])
            self.assertEqual(payload[-4:], expected)
            self.assertTrue(verify_checksum(payload))

    def test_verify_checksum_rejects_corrupted_payload(self):
        self.assertFalse(verify_checksum(BAD_CHECKSUM_PAYLOAD))
        swapped = STATIC_PAYLOAD.replace("01000000000", "01000000001")
        self.assertFalse(verify_checksum(swapped))

    def test_verify_checksum_tolerates_whitespace_and_lowercase_hex(self):
        self.assertTrue(verify_checksum("\n  " + STATIC_PAYLOAD + "  \n"))
        lower = STATIC_PAYLOAD[:-4] + STATIC_PAYLOAD[-4:].lower()
        self.assertTrue(verify_checksum(lower))

    def test_verify_checksum_rejects_garbage(self):
        for input_ in ("", "   ", "abc", "000201", "0002016304ZZZZ"):
            self.assertFalse(verify_checksum(input_), input_)

    def test_changing_any_field_invalidates_the_checksum(self):
        resigned = rebuild(STATIC_PAYLOAD, lambda fields: set_field(fields, "59", "DEMO STORE 2"))
        self.assertTrue(verify_checksum(resigned))
        self.assertNotEqual(resigned, STATIC_PAYLOAD)

    def test_crc_uses_utf8_bytes(self):
        # Multi-byte UTF-8 must be hashed byte-wise, like TextEncoder in the JS port.
        self.assertEqual(crc16("৳"), crc16("\u09f3"))
        self.assertNotEqual(crc16("৳"), crc16("T"))


if __name__ == "__main__":
    unittest.main()
