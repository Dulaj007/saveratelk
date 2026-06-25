"""
banks/peoples.py

Scraper for People's Bank interest rates.

Target: https://www.peoplesbank.lk/interest-rates/
Method: static HTML (requests + BeautifulSoup)

The page renders eighteen separate tables across many deposit products
(co-operative sector, Samurdhi, Parinatha, foreign currency variants, and
several savings account brands), all sharing the same generic "table"
class with no distinguishing id. The standard Fixed Deposit ladder and the
standard Savings Products table are therefore located by the *heading*
text that immediately precedes them in the page, "Fixed deposits (Minimum
deposit Rs. 5,000/-)" and "Saving Products" respectively, rather than by
table position, since a heading is far less likely to be reordered than a
numeric table index.

Each FD cell concatenates the nominal rate and the AER with no consistent
separator (e.g. "6.75% 6.96% (AER)" or "7.25% 7.45%(AER)", spacing varies),
so both percentages are pulled out with one regex rather than split on a
fixed delimiter.

The same page also carries a flat "Interest Rates on Advances" table (a
Description | Min. rate | Max. rate layout, located the same way as the FD
and savings tables, by the <h4> heading immediately before it) and a
sibling "Overdrafts" table of the same shape. Both are min/max ranges
rather than single numbers; per project convention the lower bound is
stored as interest_rate and the upper bound is recorded in notes. Rows
with no clean numeric value (e.g. "Weekly AWPLR + 2.5%" for export/import
finance and SME lending) are skipped, as are rows for products outside
this project's category list (Business Loans, Agriculture, Development
Loans). "Gurusetha Loan" is also skipped: it is a distinct named product
sitting alongside, not a duplicate of, the standard "Personal Loans" row.
"""

import re
from bs4 import BeautifulSoup

from lib.http import fetch
from lib.robots import is_allowed
from lib.models import RateRecord

BANK_CODE = "peoples"
RATES_URL = "https://www.peoplesbank.lk/interest-rates/"

_FD_HEADING = "Fixed deposits (Minimum deposit Rs. 5,000/-)"
_SAVINGS_HEADING = "Saving Products"
_ADVANCES_HEADING = "Interest Rates on Advances"
_OVERDRAFTS_HEADING = "Overdrafts"

_TENURE_PATTERN = re.compile(r"(\d+)\s*Months?\b", re.IGNORECASE)
# Matches the first percentage (nominal rate) and, if present, a second
# percentage anywhere later in the same cell (the AER).
_RATE_AER_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%.*?(\d+(?:\.\d+)?)\s*%")
_SINGLE_RATE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")

# Maps the exact "Description" / "Overdrafts" column label (first cell) of
# the advances/overdrafts tables to the matching product_type. Rows whose
# label isn't listed here are skipped. See module docstring.
_ADVANCES_LABEL_MAP = {
    "residential housing": "housing_loan",
    "personal loans": "personal_loan",
    "vehicle loans": "leasing",
    "education loans": "education_loan",
    "pawning": "pawning",
    "credit cards": "card",
    "permanent": "overdraft",
    "temporary": "overdraft",
}


def _find_table_after_heading(soup: BeautifulSoup, heading_text: str):
    """Return the first <table> following the <h4> whose text matches heading_text exactly."""
    for heading in soup.find_all("h4"):
        if heading.get_text(strip=True) == heading_text:
            return heading.find_next("table")
    return None


def _parse_rate_cell(cell_text: str) -> tuple[float, float | None] | None:
    """
    Parse a cell like "6.75% 6.96% (AER)" into (nominal_rate, aer).
    Returns None for empty/"-" cells (that payment frequency not offered).
    """
    if cell_text.strip() in ("", "-"):
        return None
    both = _RATE_AER_PATTERN.search(cell_text)
    if both:
        return float(both.group(1)), float(both.group(2))
    single = _SINGLE_RATE_PATTERN.search(cell_text)
    if single:
        return float(single.group(1)), None
    return None


def _parse_fd_table(table) -> list[RateRecord]:
    """
    Parse the standard Fixed Deposits table into RateRecord objects.
    Columns: Period | At Maturity p.a. | Monthly p.a.
    """
    records = []
    for row in table.find_all("tr")[1:]:
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        tenure_match = _TENURE_PATTERN.search(cells[0].get_text(strip=True))
        if not tenure_match:
            continue
        tenure_months = int(tenure_match.group(1))

        maturity = _parse_rate_cell(cells[1].get_text(" ", strip=True))
        if maturity:
            rate, aer = maturity
            records.append(RateRecord(
                bank_code=BANK_CODE, product_type="fd", interest_rate=rate,
                source_url=RATES_URL, tenure_months=tenure_months,
                annual_effective_rate=aer, interest_payment="at-maturity",
            ))

        monthly = _parse_rate_cell(cells[2].get_text(" ", strip=True))
        if monthly:
            rate, aer = monthly
            records.append(RateRecord(
                bank_code=BANK_CODE, product_type="fd", interest_rate=rate,
                source_url=RATES_URL, tenure_months=tenure_months,
                annual_effective_rate=aer, interest_payment="monthly",
            ))
    return records


def _parse_savings_table(table) -> list[RateRecord]:
    """
    Parse the Saving Products table into RateRecord objects, one per named
    account type. Columns: Product Name | Applicable Rate % | AER.
    """
    records = []
    for row in table.find_all("tr")[1:]:
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        label = cells[0].get_text(strip=True)
        rate_match = _SINGLE_RATE_PATTERN.search(cells[1].get_text(strip=True))
        if not rate_match:
            continue
        aer_match = _SINGLE_RATE_PATTERN.search(cells[2].get_text(strip=True))

        records.append(RateRecord(
            bank_code=BANK_CODE, product_type="savings",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            annual_effective_rate=float(aer_match.group(1)) if aer_match else None,
            notes=label or None,
        ))
    return records


def _parse_min_max_table(table) -> list[RateRecord]:
    """
    Parse a Description/Overdrafts | Min. rate | Max. rate table into
    RateRecord objects. Columns: label | min rate | max rate.

    Rows whose label isn't in _ADVANCES_LABEL_MAP are skipped (other
    products outside this project's category list). Rows with no usable
    numeric min rate are also skipped (e.g. "Weekly AWPLR + 2.5%" facilities
    that have no flat percentage at all); the Credit Cards row is the one
    case where the min cell is blank (rendered as a single dash character) and the number lives in the max
    cell instead ("28% p.a. / 2.3% monthly"), so the max cell is used as a
    fallback when the min cell has no match.
    """
    records = []
    for row in table.find_all("tr")[1:]:
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        label = cells[0].get_text(strip=True)
        product_type = _ADVANCES_LABEL_MAP.get(label.strip().lower())
        if product_type is None:
            continue

        min_text = cells[1].get_text(" ", strip=True)
        max_text = cells[2].get_text(" ", strip=True)

        min_match = _SINGLE_RATE_PATTERN.search(min_text)
        max_match = _SINGLE_RATE_PATTERN.search(max_text)

        primary_match = min_match or max_match
        if not primary_match:
            continue  # e.g. "Weekly AWPLR + 2.5%", no flat numeric rate

        notes_parts = []
        other_match = max_match if primary_match is min_match else min_match
        if other_match and other_match.group(1) != primary_match.group(1):
            notes_parts.append(f"up to {other_match.group(1)}%")
        if primary_match is max_match and "monthly" in max_text.lower():
            notes_parts.append(max_text)

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type=product_type,
            interest_rate=float(primary_match.group(1)),
            source_url=RATES_URL,
            notes="; ".join(notes_parts) or None,
        ))
    return records


def scrape() -> list[RateRecord]:
    """
    Fetch and parse People's Bank's published interest rates.

    Returns:
        A list of RateRecord objects covering the standard Fixed Deposit
        ladder, the named Savings Products, and whichever of the 7 new
        lending categories the advances/overdrafts tables publish a real
        numeric rate for (housing_loan, personal_loan, leasing,
        education_loan, pawning, overdraft, card). Returns an empty list if
        the page is disallowed by robots.txt or if no tables are found.
    """
    if not is_allowed(RATES_URL):
        return []

    response = fetch(RATES_URL)
    soup = BeautifulSoup(response.content, "html.parser")

    records: list[RateRecord] = []

    fd_table = _find_table_after_heading(soup, _FD_HEADING)
    if fd_table is not None:
        records.extend(_parse_fd_table(fd_table))

    savings_table = _find_table_after_heading(soup, _SAVINGS_HEADING)
    if savings_table is not None:
        records.extend(_parse_savings_table(savings_table))

    advances_table = _find_table_after_heading(soup, _ADVANCES_HEADING)
    if advances_table is not None:
        records.extend(_parse_min_max_table(advances_table))

        # Unlike every other table on this page, "Overdrafts" has no <h4>
        # heading of its own. "Overdrafts" is the literal text of its own
        # header row, and the table simply follows the Advances table
        # directly. Confirm that header text before trusting find_next, in
        # case the page ever reorders.
        overdrafts_table = advances_table.find_next("table")
        if overdrafts_table is not None:
            header_cells = overdrafts_table.find_all(["td", "th"])
            if header_cells and header_cells[0].get_text(strip=True) == _OVERDRAFTS_HEADING:
                records.extend(_parse_min_max_table(overdrafts_table))

    return records
