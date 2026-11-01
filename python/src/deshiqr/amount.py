"""Amount helpers: tag-54 encoding, parsing, BDT formatting and account masking.

Mirrors ``packages/deshiqr/src/core/amount.ts``.
"""

from __future__ import annotations

import math
import re
from decimal import Decimal, ROUND_HALF_UP, localcontext
from typing import Optional

from .errors import DeshiQrError

#: Largest amount deshiQR will put in a QR (BDT).
MAX_AMOUNT = 99_999_999.99

_AMOUNT_RE = re.compile(r"[0-9]{1,10}(?:\.[0-9]{1,2})?")


def _is_number(value: object) -> bool:
    """True for int/float but not bool (JS ``typeof value === "number"``)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_integer_number(value: object) -> bool:
    """True for whole numbers, mirroring JS ``Number.isInteger``."""
    if not _is_number(value):
        return False
    if isinstance(value, float):
        return math.isfinite(value) and value.is_integer()
    return True


def amount_to_field(amount: float) -> str:
    """Format an amount for tag 54: ``500`` -> ``"500.00"``.

    Uses the same arithmetic as the TS implementation: round ``amount * 100``
    (half up, so ``10.996`` becomes ``11.00``), divide back, then always render
    exactly two decimals.
    """
    if not _is_number(amount) or not math.isfinite(float(amount)):
        raise DeshiQrError("BAD_AMOUNT", "Amount must be a finite number.")
    if amount <= 0:
        raise DeshiQrError("BAD_AMOUNT", "Amount must be greater than zero.")
    if amount > MAX_AMOUNT:
        raise DeshiQrError("BAD_AMOUNT", "Amount must not exceed {}.".format(MAX_AMOUNT))

    # Math.round(x) === Math.floor(x + 0.5) for the positive amounts allowed here.
    rounded = int(math.floor(float(amount) * 100 + 0.5))
    text = "{}.{:02d}".format(rounded // 100, rounded % 100)
    if len(text) > 13:
        raise DeshiQrError("BAD_AMOUNT", "Amount is too large for the format.")
    return text


def parse_amount_field(text: str) -> float:
    """Parse tag 54 back into a number: ``"500.00"`` -> ``500``."""
    if not isinstance(text, str) or _AMOUNT_RE.fullmatch(text) is None:
        raise DeshiQrError(
            "BAD_AMOUNT",
            'Invalid amount field "{}".'.format(text),
            text if isinstance(text, str) else None,
        )
    amount = float(text)
    if not math.isfinite(amount) or amount <= 0 or amount > MAX_AMOUNT:
        raise DeshiQrError(
            "BAD_AMOUNT",
            'Amount "{}" is out of range.'.format(text),
            text,
        )
    return amount


def _group_digits(integer_part: str) -> str:
    sign = ""
    if integer_part.startswith("-"):
        sign, integer_part = "-", integer_part[1:]
    parts = []
    while len(integer_part) > 3:
        parts.append(integer_part[-3:])
        integer_part = integer_part[:-3]
    parts.append(integer_part)
    return sign + ",".join(reversed(parts))


def _format_fixed(amount: float, decimals: int) -> str:
    """``Intl.NumberFormat("en-US")``-style fixed-point rendering.

    The JS ``toLocaleString`` rounds the shortest decimal representation of the
    double with half-up rounding (V8/ICU behaviour), e.g. ``1.005`` -> ``"1.01"``.
    ``Decimal(str(...))`` reproduces that shortest representation exactly.
    """
    if isinstance(amount, float) and math.isnan(amount):
        return "NaN"
    if isinstance(amount, float) and math.isinf(amount):
        return "∞" if amount > 0 else "-∞"

    with localcontext() as ctx:
        ctx.prec = 1000
        quantum = Decimal(1).scaleb(-decimals)
        quantized = Decimal(str(amount)).quantize(quantum, rounding=ROUND_HALF_UP)
        rendered = format(quantized, "f")
    if "." in rendered:
        integer_part, fraction_part = rendered.split(".", 1)
        return _group_digits(integer_part) + "." + fraction_part
    return _group_digits(rendered)


def format_taka(
    amount: float,
    symbol: bool = True,
    decimals: Optional[int] = None,
) -> str:
    """Human-friendly BDT amount: ``format_taka(1250.5)`` -> ``"৳1,250.50"``.

    ``decimals`` defaults to none for whole amounts and two otherwise, exactly
    like the TS ``formatTaka`` helper.
    """
    if not _is_number(amount):
        raise TypeError("amount must be a number")
    if decimals is None:
        decimals = 0 if _is_integer_number(amount) else 2
    if not isinstance(decimals, int) or isinstance(decimals, bool) or not 0 <= decimals <= 100:
        raise ValueError("decimals must be an integer between 0 and 100")

    formatted = _format_fixed(amount, decimals)
    return "৳" + formatted if symbol else formatted


def mask_account(account: str) -> str:
    """Mask an account for display: ``"01000000000"`` -> ``"01000•••000"``."""
    if not isinstance(account, str) or len(account) == 0:
        return ""
    if len(account) <= 4:
        return "•" * len(account)
    if len(account) <= 7:
        return account[:2] + "•" * (len(account) - 4) + account[-2:]
    return account[:5] + "•••" + account[-3:]
