"""
banks/nsb.py

Scraper for National Savings Bank (NSB) interest rates.

Target: https://www.nsb.lk/rates-tarriffs/rupee-deposit-rates/
Method: static HTML (requests + BeautifulSoup)

NSB runs a WordPress-based site with two adjacent tables sharing the same
classes: one for savings products, one for fixed deposits. Both use the
columns: Details | Minimum Deposit | Annual Interest Rate(%) |
Method of Interest Calculation | Payment of Interest | Effective Interest
Rate(%). The two tables are distinguished by content (the FD table's rows
mention "Fixed Deposit" or a tenure in months) rather than position, since
NSB could reorder sections on the page. A third table (National Savings
Certificates) carries an extra "table-hover" class and is intentionally
excluded — it is a separate certificate product, not a standard deposit.
"""

import re
from bs4 import BeautifulSoup

from lib.http import fetch
from lib.robots import is_allowed
from lib.models import RateRecord

BANK_CODE = "nsb"
RATES_URL = "https://www.nsb.lk/rates-tarriffs/rupee-deposit-rates/"

# Negative lookbehind for a digit or decimal point guards against matching
# the tail of a decimal rate value, e.g. "03.00 Monthly" must NOT match as
# tenure "0 Month" (the "00" right after the decimal point).
_TENURE_PATTERN = re.compile(r"(?<![\d.])(\d+)\s*Months?\b", re.IGNORECASE)
_FIRST_NUMBER   = re.compile(r"[\d,]+(?:\.\d+)?")

_PAYMENT_MAP = {
    "monthly":  "monthly",
    "maturity": "at-maturity",
    "yearly":   "annually",
    "quarterly": "quarterly",
}


def _parse_amount(text: str) -> float | None:
    """
    Parse a leading numeric amount from strings like "100,000/-" or
    "100/- – 1000/-" (a range), taking the first number found.
    """
    match = _FIRST_NUMBER.search(text)
    if not match:
        return None
    return float(match.group(0).replace(",", ""))


def _candidate_tables(soup: BeautifulSoup):
    """
    Yield deposit-rate tables, excluding the National Savings Certificates
    table (identified by its extra "table-hover" class).
    """
    for table in soup.find_all("table", class_="table-bordered"):
        classes = table.get("class", [])
        if "table-hover" in classes:
            continue
        yield table


def _is_fd_table(table) -> bool:
    """Return True if any data row in table mentions a tenure in months."""
    text = table.get_text(" ", strip=True)
    return bool(_TENURE_PATTERN.search(text))


def _parse_rows(table, product_type: str) -> list[RateRecord]:
    """
    Parse a Details/Minimum Deposit/Annual Interest Rate/.../Effective Rate
    table into RateRecord objects of the given product_type.
    """
    records = []
    rows = table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 6:
            continue

        details   = cells[0].get_text(" ", strip=True)
        min_dep   = cells[1].get_text(strip=True)
        rate_text = cells[2].get_text(strip=True)
        payment   = cells[4].get_text(strip=True).lower()
        aer_text  = cells[5].get_text(strip=True)

        rate_match = _FIRST_NUMBER.search(rate_text)
        if not rate_match:
            continue
        rate = float(rate_match.group(0).replace(",", ""))

        tenure_months = None
        if product_type == "fd":
            tenure_match = _TENURE_PATTERN.search(details)
            if not tenure_match:
                continue
            tenure_months = int(tenure_match.group(1))

        aer = None
        if aer_text:
            aer_match = _FIRST_NUMBER.search(aer_text)
            if aer_match:
                aer = float(aer_match.group(0).replace(",", ""))

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type=product_type,
            interest_rate=rate,
            source_url=RATES_URL,
            tenure_months=tenure_months,
            annual_effective_rate=aer,
            min_deposit=_parse_amount(min_dep),
            interest_payment=_PAYMENT_MAP.get(payment, payment or None),
            notes=details if product_type == "savings" else None,
        ))
    return records


def scrape() -> list[RateRecord]:
    """
    Fetch and parse NSB's published interest rates.

    Returns:
        A list of RateRecord objects covering fixed deposit tenures and
        savings product variants. Returns an empty list if the page is
        disallowed by robots.txt.
    """
    if not is_allowed(RATES_URL):
        return []

    response = fetch(RATES_URL)
    soup = BeautifulSoup(response.content, "html.parser")

    records: list[RateRecord] = []
    for table in _candidate_tables(soup):
        product_type = "fd" if _is_fd_table(table) else "savings"
        records.extend(_parse_rows(table, product_type))

    return records
