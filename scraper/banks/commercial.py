"""
banks/commercial.py

Scraper for Commercial Bank of Ceylon interest rates.

Target: https://www.combank.lk/rates-tariff
Method: static HTML (requests + BeautifulSoup)

Note: the bank's primary domain (combank.net) is unreachable from this
deployment's network (SSL handshake failure); the .lk domain serves the
identical site and is used instead.

The rates page renders dozens of small rate tables (one per product) that
all share the same generic CSS class ("with-radius left-align default-font"),
with no distinguishing id or caption inside the <table> itself. The Rupee
Fixed Deposit table and the standard Savings Account table are therefore
located by matching their row content rather than position or class:
  - The FD table's rows mention a tenure in months and are tagged "(LKR)".
  - The standard savings table is the one whose three balance tiers read
    "Below Rs...", "...to...", and "...and above" (the generic tiered
    savings product, as opposed to children's/senior/branded variants that
    use different tier wording).

The lending-product tables (Lease Facilities, Personal Loans, Home Loans,
Gold Loans Pawning, Education Loans, All Other Advances, credit card
interest) are likewise un-captioned at the <table> level. Their section
titles ("Lease Facilities" etc.) are separate heading elements above the
<table>, not part of it. They are located the same way as FD/savings: by
distinctive row/column content that survives a page reshuffle:
  - Lease Facilities, Personal Loans and Home Loans all share a
    Standard/Premium/Platinum tiered-rate layout, so they are first
    filtered down to that shared shape, then told apart by a unique
    marker word each one alone contains ("Machinery" for leasing,
    "Mortgage" for home loans; Personal Loans is the one with neither).
  - Gold Loans Pawning, Education Loans and All Other Advances are flat
    label/rate tables, found by a distinctive label phrase from their
    published row text ("Short Term Gold Loans", "Property Mortgages",
    "Casual Excess").
  - The credit card interest rate is quoted identically across every
    card-tier table ("Interest Monthly (...% APR)"), so it is found by
    searching all tables for that phrase rather than anchoring to one
    specific card table.
"""

import re
from bs4 import BeautifulSoup

from lib.http import fetch
from lib.robots import is_allowed
from lib.models import RateRecord

BANK_CODE = "commercial"
RATES_URL = "https://www.combank.lk/rates-tariff"

_TENURE_PATTERN = re.compile(r"(?<![\d.])(\d+)\s*Months?\b", re.IGNORECASE)
_TENURE_YEARS_PATTERN = re.compile(r"(?<![\d.])(\d+)(?:\s*-\s*\d+)?\s*Years?\b", re.IGNORECASE)
_RATE_PATTERN   = re.compile(r"(\d+(?:\.\d+)?)")
_AWPLR_PATTERN  = re.compile(r"awplr", re.IGNORECASE)


def _parse_payment(label: str) -> str | None:
    """Map an FD row label's payment phrase to a normalised value."""
    lowered = label.lower()
    if "at maturity" in lowered:
        return "at-maturity"
    if "paid monthly" in lowered:
        return "monthly"
    if "paid annually" in lowered:
        return "annually"
    return None


def _find_fd_table(soup: BeautifulSoup):
    """Locate the Rupee Fixed Deposit table: rows tagged "(LKR)" with a tenure."""
    for table in soup.find_all("table"):
        text = table.get_text(" ", strip=True)
        if "(LKR)" in text and _TENURE_PATTERN.search(text):
            return table
    return None


def _find_savings_table(soup: BeautifulSoup):
    """Locate the standard tiered Savings Account table by its tier wording."""
    for table in soup.find_all("table"):
        text = table.get_text(" ", strip=True).lower()
        if "below rs" in text and "and above" in text:
            return table
    return None


def _is_tiered_loan_table(text_lower: str) -> bool:
    """
    True if a table's lowercased text matches the shared Standard/Premium/
    Platinum tiered-rate layout used by Lease Facilities, Personal Loans
    and Home Loans.
    """
    return (
        "standard" in text_lower
        and "premium" in text_lower
        and "platinum" in text_lower
        and _TENURE_YEARS_PATTERN.search(text_lower) is not None
    )


def _find_lease_table(soup: BeautifulSoup):
    """Locate the Lease Facilities table: tiered layout plus a Machinery row."""
    for table in soup.find_all("table"):
        text_lower = table.get_text(" ", strip=True).lower()
        if _is_tiered_loan_table(text_lower) and "machinery" in text_lower:
            return table
    return None


def _find_home_loan_table(soup: BeautifulSoup):
    """Locate the Home Loans table: tiered layout plus a Mortgage/Green mention."""
    for table in soup.find_all("table"):
        text_lower = table.get_text(" ", strip=True).lower()
        if _is_tiered_loan_table(text_lower) and (
            "mortgage" in text_lower or "green home" in text_lower
        ):
            return table
    return None


def _find_personal_loan_table(soup: BeautifulSoup):
    """
    Locate the Personal Loans table: the tiered Standard/Premium/Platinum
    table that is neither the Lease Facilities table (no "Machinery") nor
    the Home Loans table (no "Mortgage"/"Green Home").
    """
    for table in soup.find_all("table"):
        text_lower = table.get_text(" ", strip=True).lower()
        if (
            _is_tiered_loan_table(text_lower)
            and "machinery" not in text_lower
            and "mortgage" not in text_lower
            and "green home" not in text_lower
        ):
            return table
    return None


def _find_pawning_table(soup: BeautifulSoup):
    """Locate the Gold Loans Pawning table by its distinctive row label."""
    for table in soup.find_all("table"):
        text_lower = table.get_text(" ", strip=True).lower()
        if "short term gold loans" in text_lower:
            return table
    return None


def _find_education_loan_table(soup: BeautifulSoup):
    """Locate the Education Loans table by its distinctive row label."""
    for table in soup.find_all("table"):
        text_lower = table.get_text(" ", strip=True).lower()
        if "property mortgages" in text_lower and "year" in text_lower:
            return table
    return None


def _find_other_advances_table(soup: BeautifulSoup):
    """Locate the All Other Advances table by its Casual Excess Rate row."""
    for table in soup.find_all("table"):
        text_lower = table.get_text(" ", strip=True).lower()
        if "casual excess" in text_lower:
            return table
    return None


def _find_credit_card_rate(soup: BeautifulSoup) -> tuple[float, str] | None:
    """
    Find the published credit card monthly interest rate, quoted
    identically across every card-tier table as e.g.
    "Interest Monthly (26% APR)" with the cell value "2.16%".

    Returns:
        (interest_rate, notes) using the *monthly* percentage as the
        scraped interest_rate (matching what the bank charges per
        statement cycle), with the nominal APR recorded in notes.
        None if the phrase is not found.
    """
    label_pattern = re.compile(r"interest\s+monthly\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*apr\s*\)", re.IGNORECASE)
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            label = cells[0].get_text(" ", strip=True)
            label_match = label_pattern.search(label)
            if not label_match:
                continue
            for cell in cells[1:]:
                rate_match = _RATE_PATTERN.search(cell.get_text(strip=True))
                if rate_match:
                    apr = label_match.group(1)
                    return (
                        float(rate_match.group(1)),
                        f"Interest charged monthly; nominal APR {apr}%",
                    )
    return None


def _parse_fd_table(table) -> list[RateRecord]:
    """
    Parse the Rupee Fixed Deposit table into RateRecord objects.
    Columns: (label) | Interest Rate (p.a.) | Annual Effective Rate | eFD.
    """
    records = []
    rows = table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        label = cells[0].get_text(" ", strip=True)
        tenure_match = _TENURE_PATTERN.search(label)
        if not tenure_match:
            continue

        rate_match = _RATE_PATTERN.search(cells[1].get_text(strip=True))
        aer_match  = _RATE_PATTERN.search(cells[2].get_text(strip=True))
        if not rate_match:
            continue

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="fd",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            tenure_months=int(tenure_match.group(1)),
            annual_effective_rate=float(aer_match.group(1)) if aer_match else None,
            interest_payment=_parse_payment(label),
        ))
    return records


def _parse_savings_table(table) -> list[RateRecord]:
    """
    Parse the standard Savings Account tier table into RateRecord objects.
    Columns: (balance tier) | Interest Rate (p.a.) | Annual Effective Rate.
    """
    records = []
    rows = table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        label = cells[0].get_text(" ", strip=True)
        rate_match = _RATE_PATTERN.search(cells[1].get_text(strip=True))
        aer_match  = _RATE_PATTERN.search(cells[2].get_text(strip=True))
        if not rate_match:
            continue

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="savings",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            annual_effective_rate=float(aer_match.group(1)) if aer_match else None,
            notes=label or None,
        ))
    return records


def _parse_tiered_loan_table(table, product_type: str) -> list[RateRecord]:
    """
    Parse a Standard/Premium/Platinum tiered-rate table (Lease Facilities,
    Personal Loans or Home Loans) into RateRecord objects. A 2-cell title
    row ("Fixed Rates" | "Interest Rate (Per Annum)") precedes the real
    tenure-in-years header row, so the header is identified by content
    (whichever row has the most tenure-year matches) rather than assumed to
    be row 0. Each data row after it is one tier (its first cell holds the
    tier name, e.g. "Standard" or "Platinum"), with one rate per tenure
    column. Cells reading "AWPLR+n%" (no flat number) are skipped rather
    than guessing a number; cells reading "N/A" or "-" are skipped.

    The header row has no leading label cell (just one cell per tenure),
    while every data row has an extra leading tier-label cell, so a data
    row's rate for header column index N sits at cells[N + 1], not cells[N].
    """
    records = []
    rows = table.find_all("tr")
    if not rows:
        return records

    header_index = -1
    tenure_years: dict[int, int] = {}
    for row_index, row in enumerate(rows):
        candidate: dict[int, int] = {}
        for i, cell in enumerate(row.find_all(["td", "th"])):
            match = _TENURE_YEARS_PATTERN.search(cell.get_text(" ", strip=True))
            if match:
                candidate[i] = int(match.group(1))
        if len(candidate) > len(tenure_years):
            tenure_years = candidate
            header_index = row_index

    for row in rows[header_index + 1:]:
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        tier_label = cells[0].get_text(" ", strip=True)
        if not tier_label:
            continue

        for col_index, years in tenure_years.items():
            cell_index = col_index + 1
            if cell_index >= len(cells):
                continue
            cell_text = cells[cell_index].get_text(" ", strip=True)
            if not cell_text or cell_text in ("-", "N/A") or _AWPLR_PATTERN.search(cell_text):
                continue
            rate_match = _RATE_PATTERN.search(cell_text)
            if not rate_match:
                continue

            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type=product_type,
                interest_rate=float(rate_match.group(1)),
                source_url=RATES_URL,
                tenure_months=years * 12,
                notes=tier_label,
            ))
    return records


def _parse_label_rate_table(
    table, product_type: str, label_filter: "re.Pattern | None" = None
) -> list[RateRecord]:
    """
    Parse a flat label/rate table (Gold Loans Pawning, Education Loans, All
    Other Advances) into RateRecord objects: one record per row whose first
    cell is a label and second cell holds a numeric percentage. Rows quoting
    only a margin formula (e.g. "AWPLR + 1.50%", no flat number) are skipped.

    If label_filter is given, only rows whose label matches it are kept,
    used to pull just the overdraft rows out of the "All Other Advances"
    table, which otherwise mixes in unrelated products (Fixed Loans, Hire
    Purchase Financing, etc.) under one heading.
    """
    records = []
    rows = table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue

        label = cells[0].get_text(" ", strip=True)
        if not label:
            continue
        if label_filter is not None and not label_filter.search(label):
            continue
        rate_cell_text = cells[1].get_text(" ", strip=True)
        if _AWPLR_PATTERN.search(rate_cell_text):
            continue
        rate_match = _RATE_PATTERN.search(rate_cell_text)
        if not rate_match:
            continue

        tenure_match = _TENURE_YEARS_PATTERN.search(label) or _TENURE_PATTERN.search(label)
        tenure_months = None
        if tenure_match:
            value = int(tenure_match.group(1))
            tenure_months = value if "month" in label.lower() else value * 12

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type=product_type,
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            tenure_months=tenure_months,
            notes=label,
        ))
    return records


def scrape() -> list[RateRecord]:
    """
    Fetch and parse Commercial Bank's published interest rates.

    Returns:
        A list of RateRecord objects covering the Rupee Fixed Deposit
        ladder, the standard Savings Account tiers, Lease Facilities,
        Personal Loans, Home Loans, Gold Loans Pawning, Education Loans,
        Overdraft/Casual Excess (from "All Other Advances"), and the
        credit card monthly interest rate. Returns an empty list if the
        page is disallowed by robots.txt.
    """
    if not is_allowed(RATES_URL):
        return []

    response = fetch(RATES_URL)
    soup = BeautifulSoup(response.content, "html.parser")

    records: list[RateRecord] = []

    fd_table = _find_fd_table(soup)
    if fd_table is not None:
        records.extend(_parse_fd_table(fd_table))

    savings_table = _find_savings_table(soup)
    if savings_table is not None:
        records.extend(_parse_savings_table(savings_table))

    lease_table = _find_lease_table(soup)
    if lease_table is not None:
        records.extend(_parse_tiered_loan_table(lease_table, "leasing"))

    personal_loan_table = _find_personal_loan_table(soup)
    if personal_loan_table is not None:
        records.extend(_parse_tiered_loan_table(personal_loan_table, "personal_loan"))

    home_loan_table = _find_home_loan_table(soup)
    if home_loan_table is not None:
        records.extend(_parse_tiered_loan_table(home_loan_table, "housing_loan"))

    pawning_table = _find_pawning_table(soup)
    if pawning_table is not None:
        records.extend(_parse_label_rate_table(pawning_table, "pawning"))

    education_loan_table = _find_education_loan_table(soup)
    if education_loan_table is not None:
        records.extend(_parse_label_rate_table(education_loan_table, "education_loan"))

    other_advances_table = _find_other_advances_table(soup)
    if other_advances_table is not None:
        # "All Other Advances" mixes several unrelated products under one
        # heading (Fixed Loans, Hire Purchase Financing, etc.); keep only
        # the genuine overdraft rows.
        overdraft_label_filter = re.compile(r"overdraft|excess", re.IGNORECASE)
        records.extend(_parse_label_rate_table(
            other_advances_table, "overdraft", label_filter=overdraft_label_filter
        ))

    card_rate = _find_credit_card_rate(soup)
    if card_rate is not None:
        interest_rate, notes = card_rate
        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="card",
            interest_rate=interest_rate,
            source_url=RATES_URL,
            notes=notes,
        ))

    return records
