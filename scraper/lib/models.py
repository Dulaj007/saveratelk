"""
lib/models.py

Defines the normalised data shape that every bank scraper module must return.

All bank scrapers return a list of RateRecord instances. This uniform shape
lets the orchestrator validate and store results without knowing anything
about the internal logic of each bank module.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Optional


def _utcnow() -> datetime:
    """Return the current time as a timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


@dataclass
class RateRecord:
    """
    A single interest rate entry scraped from a bank's published rates page.

    Fields:
        bank_code         – Short identifier matching the banks.code column.
        product_type      – One of: "fd", "savings", "card", "profit",
                            "housing_loan", "personal_loan", "leasing",
                            "education_loan", "pawning", "overdraft".
        interest_rate     – The rate as a percentage (e.g. 12.5 for 12.5%).
        source_url        – The exact URL the rate was scraped from.
        tenure_months     – Duration in months (FD only; None for savings etc.).
        annual_effective_rate – AER if published; None otherwise.
        min_deposit       – Minimum deposit in LKR if stated; None otherwise.
        interest_payment  – Payment frequency string (e.g. "monthly").
        notes             – Any extra conditions or tier descriptions.
        scraped_at        – UTC timestamp of when this record was collected.
        effective_date    – "w.e.f." date if the bank states one; None otherwise.
    """

    bank_code:             str
    product_type:          str
    interest_rate:         float
    source_url:            str
    tenure_months:         Optional[int]   = None
    annual_effective_rate: Optional[float] = None
    min_deposit:           Optional[float] = None
    interest_payment:      Optional[str]   = None
    notes:                 Optional[str]   = None
    scraped_at:            datetime        = field(default_factory=_utcnow)
    effective_date:        Optional[date]  = None
