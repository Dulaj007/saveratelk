"""
lib/validate.py

Rate sanity validation for the SaveRateLK scraper.

Every RateRecord produced by a bank scraper is passed through validate()
before being written to the database. Records with values outside the
configured bounds are rejected and logged so a human can review them.
This prevents obviously misparsed values (e.g. "1200%" or a negative rate)
from entering the database and corrupting the public UI.

Sanity bounds are defined in config.RATE_BOUNDS and are intentionally wide
to accommodate unusual but valid promotional rates.
"""

import logging
from typing import Optional

from config import RATE_BOUNDS
from lib.models import RateRecord

logger = logging.getLogger(__name__)


def validate(record: RateRecord) -> bool:
    """
    Check that record contains a financially sane interest rate.

    Validation rules:
      - product_type must be one of the recognised types in RATE_BOUNDS.
      - interest_rate must fall within the inclusive [min, max] for that type.
      - tenure_months, if set, must be a positive integer.
      - annual_effective_rate, if set, must also be within the same bounds.

    Logs a warning with full record detail for every rejected record so the
    failure can be investigated and the scraper fixed if needed.

    Args:
        record – A RateRecord returned by a bank scraper module.

    Returns:
        True  – record passed all checks and is safe to store.
        False – record failed at least one check and must be discarded.
    """

    if record.product_type not in RATE_BOUNDS:
        logger.warning(
            "REJECTED unknown product_type=%r for bank=%s",
            record.product_type, record.bank_code,
        )
        return False

    lo, hi = RATE_BOUNDS[record.product_type]

    if not (lo <= record.interest_rate <= hi):
        logger.warning(
            "REJECTED interest_rate=%.3f%% out of range [%.1f, %.1f] "
            "for bank=%s product=%s tenure=%s",
            record.interest_rate, lo, hi,
            record.bank_code, record.product_type, record.tenure_months,
        )
        return False

    if record.annual_effective_rate is not None:
        if not (lo <= record.annual_effective_rate <= hi):
            logger.warning(
                "REJECTED annual_effective_rate=%.3f%% out of range for "
                "bank=%s product=%s",
                record.annual_effective_rate, record.bank_code, record.product_type,
            )
            return False

    if record.tenure_months is not None and record.tenure_months <= 0:
        logger.warning(
            "REJECTED non-positive tenure_months=%d for bank=%s",
            record.tenure_months, record.bank_code,
        )
        return False

    return True


def filter_valid(records: list[RateRecord]) -> tuple[list[RateRecord], int]:
    """
    Apply validate() to each record in records and return passing records
    along with the count of rejected ones.

    Args:
        records – List of RateRecord objects from a scraper module.

    Returns:
        (valid_records, rejected_count) tuple.
    """
    valid = []
    rejected = 0
    for record in records:
        if validate(record):
            valid.append(record)
        else:
            rejected += 1

    if rejected:
        logger.warning("%d record(s) rejected during validation.", rejected)

    return valid, rejected
