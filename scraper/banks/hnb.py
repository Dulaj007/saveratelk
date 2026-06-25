"""
banks/hnb.py

Scraper for Hatton National Bank (HNB) interest rates.

Target: https://www.hnb.lk/interest-rates
Method: static HTML page is a JavaScript-rendered single-page app (React),
but the rate tables are sourced from a public JSON API the page itself
calls client-side: https://venus.hnb.lk/api/get_interest_rates_contents.
Calling that API directly with plain HTTP avoids the cost and fragility of
browser automation entirely. Confirmed by inspecting the page's network
requests rather than assuming the rendered DOM had to be scraped.

The API returns a tree of category -> sub_category -> named rate blocks,
each holding a JSON-encoded table (columns + rows) as a string within the
"data" field. The Fixed Deposits block uses a wide format (one column per
payment frequency: Monthly, Quarterly, Semi Annually, Annually, Maturity);
each non-empty cell in a row becomes its own RateRecord, since a single FD
tenure can be offered at several different payment frequencies and rates.

The "Loans" category's "HNB Home Loans" and "Personal Loan" blocks share
that same wide format (Type | Tenure | rate-column, rate-column...), one
row per tenure with several customer-segment rate columns. Some rows are
"Floating" type and quote a margin like "AWPLR + 2.50%" with no flat
number. Only "Fixed" rows are scraped, via the same type_filter approach.
"Education Loans" is a flatter Period(years) | Rate-with-grace |
Rate-without-grace table; "Pawning" (its own top-level category, not under
"Loans") is a plain Facility Amount | Interest Rate table. HNB's "Leasing"
category tables (General Leasing, Brand New/EV, Solar) only ever publish
a monthly rental-per-Rs.100,000 schedule, never a flat interest rate, so
no "leasing" records are produced from this API; no card or overdraft
rate is published here either.
"""

import json
import re

from lib.http import fetch
from lib.robots import is_allowed
from lib.models import RateRecord

BANK_CODE = "hnb"
RATES_URL = "https://www.hnb.lk/interest-rates"
API_URL   = "https://venus.hnb.lk/api/get_interest_rates_contents"

_TENURE_PATTERN = re.compile(r"(?<![\d.])(\d+)\s*Months?\b", re.IGNORECASE)
_RATE_PATTERN   = re.compile(r"(\d+(?:\.\d+)?)")
_YEARS_PATTERN  = re.compile(r"(\d+)")

# Maps the Fixed Deposits table's payment-frequency column headers to the
# normalised interest_payment values used across all bank modules.
_PAYMENT_COLUMN_MAP = {
    "monthly":       "monthly",
    "quarterly":     "quarterly",
    "semi annually": "semi-annually",
    "annually":      "annually",
    "maturity":      "at-maturity",
}


def _find_block(api_data: dict, category_name: str, title: str) -> dict | None:
    """
    Locate a named rate block (e.g. title="Fixed Deposits Interest Rates")
    within a top-level category (e.g. category_name="Savings") in the API
    response tree.
    """
    for category in api_data.get("data", []):
        if category.get("name") != category_name:
            continue
        for sub_category in category.get("interest_rate_sub_category", []):
            for division in sub_category.get("sub_category_division_approved", []):
                if division.get("title", "").strip() == title:
                    return division
    return None


def _parse_table(division: dict) -> dict | None:
    """
    Extract the {"columns": [...], "rows": [...]} table from a rate block's
    table_data_approved entry. Returns None if the block has no table data.
    """
    entries = division.get("table_data_approved", [])
    if not entries:
        return None
    return json.loads(entries[0]["data"])


def _parse_fd_table(table: dict) -> list[RateRecord]:
    """
    Parse the wide-format Fixed Deposits table into RateRecord objects, one
    per non-empty (tenure, payment frequency) cell.
    """
    records = []
    columns = [c.strip().lower() for c in table["columns"]]

    # Identify which column index holds the tenure and which hold rates per
    # payment frequency, and which (if any) holds the overall AER.
    payment_columns = {
        i: _PAYMENT_COLUMN_MAP[col]
        for i, col in enumerate(columns)
        if col in _PAYMENT_COLUMN_MAP
    }
    aer_index = next((i for i, col in enumerate(columns) if "effective" in col), None)

    for row in table["rows"]:
        tenure_match = _TENURE_PATTERN.search(row[0])
        if not tenure_match:
            continue
        tenure_months = int(tenure_match.group(1))

        aer = None
        if aer_index is not None:
            aer_match = _RATE_PATTERN.search(row[aer_index])
            if aer_match:
                aer = float(aer_match.group(1))

        for col_index, payment in payment_columns.items():
            cell = row[col_index].strip()
            if cell in ("", "-"):
                continue
            rate_match = _RATE_PATTERN.search(cell)
            if not rate_match:
                continue

            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type="fd",
                interest_rate=float(rate_match.group(1)),
                source_url=RATES_URL,
                tenure_months=tenure_months,
                annual_effective_rate=aer,
                interest_payment=payment,
            ))
    return records


def _parse_savings_table(table: dict) -> list[RateRecord]:
    """
    Parse the Savings Accounts Interest Rates table into RateRecord objects,
    one per named account type. Columns: account type | Rate | AER.
    """
    records = []
    for row in table["rows"]:
        if len(row) < 2:
            continue
        label = row[0].strip()
        rate_match = _RATE_PATTERN.search(row[1])
        if not rate_match:
            continue
        aer = None
        if len(row) > 2:
            aer_match = _RATE_PATTERN.search(row[2])
            if aer_match:
                aer = float(aer_match.group(1))

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="savings",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            annual_effective_rate=aer,
            notes=label or None,
        ))
    return records


def _parse_dual_rate_loan_table(
    table: dict, product_type: str, type_filter: str | None = None
) -> list[RateRecord]:
    """
    Parse a Type | Tenure | rate-column... loan table (HNB Home Loans,
    Personal Loan) into RateRecord objects, one per (row, rate column).
    If type_filter is given, only rows whose Type cell matches it
    (case-insensitive) are kept, used to skip "Floating" rows, which
    quote a margin like "AWPLR + 2.50%" with no flat number to scrape.
    """
    records = []
    columns = table["columns"]
    for row in table["rows"]:
        if len(row) < 3:
            continue
        loan_type = row[0].strip()
        if type_filter is not None and loan_type.lower() != type_filter:
            continue

        tenure_text = row[1].strip()
        tenure_match = _YEARS_PATTERN.search(tenure_text)
        tenure_months = int(tenure_match.group(1)) * 12 if tenure_match else None

        for col_index in range(2, len(row)):
            cell = row[col_index].strip()
            if not cell or cell == "-" or "awplr" in cell.lower():
                continue
            rate_match = _RATE_PATTERN.search(cell)
            if not rate_match:
                continue

            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type=product_type,
                interest_rate=float(rate_match.group(1)),
                source_url=RATES_URL,
                tenure_months=tenure_months,
                notes=f"{tenure_text}: {columns[col_index].strip()}" if col_index < len(columns) else tenure_text,
            ))
    return records


def _parse_education_loan_table(table: dict) -> list[RateRecord]:
    """
    Parse the Education Loans table (Period (years) | Rate During Grace
    Period | Rate Without Grace Period) into RateRecord objects, one per
    (row, rate column). Both the grace and non-grace rate are genuine
    published numbers, kept as separate records distinguished by notes.
    Cells reading "-" (not offered at that period) are skipped.
    """
    records = []
    columns = table["columns"]
    for row in table["rows"]:
        if len(row) < 2:
            continue
        period_text = row[0].strip()
        tenure_match = _YEARS_PATTERN.search(period_text)
        tenure_months = int(tenure_match.group(1)) * 12 if tenure_match else None

        for col_index in range(1, len(row)):
            cell = row[col_index].strip()
            if not cell or cell == "-":
                continue
            rate_match = _RATE_PATTERN.search(cell)
            if not rate_match:
                continue

            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type="education_loan",
                interest_rate=float(rate_match.group(1)),
                source_url=RATES_URL,
                tenure_months=tenure_months,
                notes=columns[col_index].strip() if col_index < len(columns) else None,
            ))
    return records


def _parse_pawning_table(table: dict) -> list[RateRecord]:
    """
    Parse the Pawning table (Facility Amount (LKR) | Interest Rate) into
    RateRecord objects, one per facility-amount tier.
    """
    records = []
    for row in table["rows"]:
        if len(row) < 2:
            continue
        label = row[0].strip()
        rate_match = _RATE_PATTERN.search(row[1])
        if not rate_match:
            continue

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="pawning",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            notes=label or None,
        ))
    return records


def scrape() -> list[RateRecord]:
    """
    Fetch and parse HNB's published interest rates via the bank's own JSON
    API (the same endpoint its React rates page calls client-side).

    Returns:
        A list of RateRecord objects covering the standard Fixed Deposits
        ladder, Savings Accounts Interest Rates, and whichever of Home
        Loans, Personal Loan, Education Loans and Pawning the API
        publishes a flat rate for. Returns an empty list if the page is
        disallowed by robots.txt or if no blocks are found.
    """
    if not is_allowed(API_URL):
        return []

    response = fetch(API_URL)
    api_data = response.json()

    records: list[RateRecord] = []

    fd_division = _find_block(api_data, "Savings", "Fixed Deposits Interest Rates")
    if fd_division is not None:
        fd_table = _parse_table(fd_division)
        if fd_table is not None:
            records.extend(_parse_fd_table(fd_table))

    savings_division = _find_block(api_data, "Savings", "Savings Accounts Interest Rates")
    if savings_division is not None:
        savings_table = _parse_table(savings_division)
        if savings_table is not None:
            records.extend(_parse_savings_table(savings_table))

    home_loan_division = _find_block(api_data, "Loans", "HNB Home Loans")
    if home_loan_division is not None:
        home_loan_table = _parse_table(home_loan_division)
        if home_loan_table is not None:
            records.extend(_parse_dual_rate_loan_table(home_loan_table, "housing_loan", type_filter="fixed"))

    personal_loan_division = _find_block(api_data, "Loans", "Personal Loan")
    if personal_loan_division is not None:
        personal_loan_table = _parse_table(personal_loan_division)
        if personal_loan_table is not None:
            records.extend(_parse_dual_rate_loan_table(personal_loan_table, "personal_loan", type_filter="fixed"))

    education_loan_division = _find_block(api_data, "Loans", "Education Loans")
    if education_loan_division is not None:
        education_loan_table = _parse_table(education_loan_division)
        if education_loan_table is not None:
            records.extend(_parse_education_loan_table(education_loan_table))

    pawning_division = _find_block(api_data, "Pawning", "Pawning")
    if pawning_division is not None:
        pawning_table = _parse_table(pawning_division)
        if pawning_table is not None:
            records.extend(_parse_pawning_table(pawning_table))

    return records
