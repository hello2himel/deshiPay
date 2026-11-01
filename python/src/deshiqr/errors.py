"""Error type shared by every deshiqr failure.

Mirrors ``packages/deshiqr/src/core/errors.ts``. Every failure raised by the library is a
:class:`DeshiQrError` carrying a stable, machine-readable :attr:`~DeshiQrError.code`,
a human-readable message, and an optional detail (a tag, an offset or a value).
"""

from __future__ import annotations

from typing import Literal, Optional

#: Stable error codes. Safe to switch on.
DeshiQrCode = Literal[
    "EMPTY_PAYLOAD",
    "BAD_TLV",
    "CHECKSUM_MISMATCH",
    "MISSING_FIELD",
    "NOT_A_BANGLA_QR",
    "BAD_AMOUNT",
    "BAD_REFERENCE",
    "UNSUPPORTED",
]

#: Every valid error code, in declaration order.
CODES = (
    "EMPTY_PAYLOAD",
    "BAD_TLV",
    "CHECKSUM_MISMATCH",
    "MISSING_FIELD",
    "NOT_A_BANGLA_QR",
    "BAD_AMOUNT",
    "BAD_REFERENCE",
    "UNSUPPORTED",
)


class DeshiQrError(Exception):
    """Every deshiqr failure: ``code``, ``message`` and an optional ``detail``."""

    #: ``"DeshiQrError"``, mirroring the JS class name.
    name = "DeshiQrError"

    code: DeshiQrCode
    message: str
    detail: Optional[str]

    def __init__(
        self,
        code: DeshiQrCode,
        message: str,
        detail: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail

    @staticmethod
    def is_error(error: object) -> bool:
        """True when ``error`` is a :class:`DeshiQrError` (mirrors ``DeshiQrError.is``)."""
        return isinstance(error, DeshiQrError)
