"""
banks/ndb.py

Scraper for National Development Bank (NDB) interest rates.

Target: https://www.ndbbank.com/rates/interest-rates-on-deposits
Method: static HTML (requests + BeautifulSoup)

Note: NDB previously published rates as a downloadable PDF (the reason this
module's bank registry entry says "pdf"), but its current site renders the
same data as plain HTML tables. The live page was inspected before writing
any selectors, per project policy, and confirmed there is no PDF involved
any more. Only the HTML path is implemented here.

NDB's tables use HTML rowspan to avoid repeating a tenure (or account name)
label across multiple rows that share it: a row introducing a new tenure has
4 cells (label, payment description, rate, AER), while subsequent rows for
the same tenure have only 3 cells (payment description, rate, AER), with the
label implied to carry over from the previous row. The parser tracks the
"current" label explicitly rather than assuming every row is self-contained.

Day-based tenures (e.g. "100 Days", "200 Days") are intentionally skipped:
they don't map onto the project's whole-month tenure_months column without
introducing a lossy day-to-month conversion, and they are secondary/special
products rather than the standard FD ladder.

NDB also publishes a companion page, interest-rates-on-advances, with a
single "Description" table covering several lending products. Unlike the
deposits tables above, every row here repeats its own label cell (no
rowspan). Each row is always exactly 5 cells: label, description, Min.
rate, Max. rate, and an "Others" cell that is always 0.00% in practice and
is ignored. Rows that bundle several sub-variants (e.g. Personal Loans'
"General personal loan / Special rate for doctors / Solar Vantage") put
all of their rates space-separated in the same Min./Max. cells; only the
first (its lowest/general-case rate) is scraped rather than splitting out
every variant as its own record. That table is the source for the
housing_loan, personal_loan, education_loan, pawning, overdraft and card
records produced below. Where a row gives only a Min. rate with no Max.
(e.g. the overdraft facilities), only the Min. rate is used. Leasing is
advertised on a separate marketing page but with no current numeric rate
published anywhere on the site, so no "leasing" records are produced.
"""

import re
from bs4 import BeautifulSoup

from lib.http import fetch
from lib.robots import is_allowed
from lib.models import RateRecord

BANK_CODE = "ndb"
RATES_URL = "https://www.ndbbank.com/rates/interest-rates-on-deposits"
ADVANCES_URL = "https://www.ndbbank.com/rates/interest-rates-on-advances"

_TENURE_PATTERN = re.compile(r"(?<![\d.])(\d+)\s*Months?\b", re.IGNORECASE)
_RATE_PATTERN   = re.compile(r"(\d+(?:\.\d+)?)\s*%")

# Maps a lending-table label (the rowspanned first cell) to the matching
# product_type. Labels not listed here (e.g. "Aachara Loans", "Salary Max
# Loan", "Unit trust backed facilities" margin trading) are skipped: they
# either don't map onto one of the project's 7 new lending categories, or
# are niche secondary products rather than the bank's standard offering.
_ADVANCES_LABEL_MAP = {
    "home loans": "housing_loan",
    "personal loans": "personal_loan",
    "education loan": "education_loan",
    "pawning": "pawning",
    "gold loan": "pawning",
    "credit cards": "card",
}
# Labels that are overdraft facilities; matched by substring since NDB
# names them after the collateral type rather than the word "overdraft"
# itself (e.g. "Unit trust backed facilities", "Share backed Facilities").
_OVERDRAFT_LABEL_SUBSTRINGS = ("backed facilities",)


def _parse_payment(description: str) -> str | None:
    """Map a payment description cell to a normalised interest_payment value."""
    lowered = description.lower()
    if "maturity" in lowered:
        return "at-maturity"
    if "monthly" in lowered:
        return "monthly"
    return None


def _find_table(soup: BeautifulSoup, header_label: str):
    """Locate a rate table by the exact text of its header row's first cell."""
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["td", "th"])
            if cells and cells[0].get_text(strip=True) == header_label:
                return table
    return None


def _parse_fd_table(table) -> list[RateRecord]:
    """
    Parse the Fixed Deposits table into RateRecord objects, tracking the
    current tenure label across rowspanned rows (see module docstring).
    """
    records = []
    current_tenure_text = None
    rows = table.find_all("tr")[2:]  # skip "Last Updated" row and header row

    for row in rows:
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
        if len(cells) == 4:
            current_tenure_text, payment_desc, rate_text, aer_text = cells
        elif len(cells) == 3:
            payment_desc, rate_text, aer_text = cells
        else:
            continue

        if current_tenure_text is None:
            continue
        tenure_match = _TENURE_PATTERN.search(current_tenure_text)
        if not tenure_match:
            continue  # day-based or otherwise non-month tenure; skip

        rate_match = _RATE_PATTERN.search(rate_text)
        if not rate_match:
            continue
        aer_match = _RATE_PATTERN.search(aer_text)

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="fd",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            tenure_months=int(tenure_match.group(1)),
            annual_effective_rate=float(aer_match.group(1)) if aer_match else None,
            interest_payment=_parse_payment(payment_desc),
            notes="Neos FD" if "neos" in payment_desc.lower() else None,
        ))
    return records


def _parse_savings_table(table) -> list[RateRecord]:
    """
    Parse the Savings Deposits table into RateRecord objects, tracking the
    current account name across rowspanned rows (see module docstring).
    """
    records = []
    current_account = None
    rows = table.find_all("tr")[2:]  # skip "Last Updated" row and header row

    for row in rows:
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
        if len(cells) == 4:
            current_account, tier_desc, rate_text, aer_text = cells
        elif len(cells) == 3:
            tier_desc, rate_text, aer_text = cells
        else:
            continue

        if current_account is None:
            continue
        rate_match = _RATE_PATTERN.search(rate_text)
        if not rate_match:
            continue
        aer_match = _RATE_PATTERN.search(aer_text)

        label = f"{current_account} - {tier_desc}" if tier_desc else current_account

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="savings",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            annual_effective_rate=float(aer_match.group(1)) if aer_match else None,
            notes=label,
        ))
    return records


def _parse_advances_table(table) -> list[RateRecord]:
    """
    Parse the lending "Description" table (interest-rates-on-advances) into
    RateRecord objects. Every data row is exactly 5 cells: label,
    description, Min. rate, Max. rate, Others (ignored), with no rowspan,
    unlike the deposits tables above. Only rows whose label maps to one of
    the project's 7 new lending categories (via _ADVANCES_LABEL_MAP or
    _OVERDRAFT_LABEL_SUBSTRINGS) are kept; everything else (business/SME/
    trade-finance style rows) is skipped.
    """
    records = []
    rows = table.find_all("tr")[2:]  # skip "Last Updated" row and header row

    for row in rows:
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
        if len(cells) != 5:
            continue
        current_label, description, min_text, max_text, _others = cells

        lowered = current_label.strip().lower()

        product_type = _ADVANCES_LABEL_MAP.get(lowered)
        if product_type is None and any(s in lowered for s in _OVERDRAFT_LABEL_SUBSTRINGS):
            product_type = "overdraft"
        if product_type is None:
            continue

        min_match = _RATE_PATTERN.search(min_text)
        if not min_match:
            continue
        max_match = _RATE_PATTERN.search(max_text)
        # The site uses "0.00%" as a sentinel for "no value published" (every
        # row's ignored Others column is always 0.00% too) rather than a real
        # upper bound, so a 0.00% Max is treated the same as no Max at all.
        has_real_max = (
            max_match is not None
            and max_match.group(1) != min_match.group(1)
            and float(max_match.group(1)) != 0.0
        )

        notes_parts = [description] if description and description != current_label else []
        if has_real_max:
            notes_parts.append(f"up to {max_match.group(1)}%")
        notes = "; ".join(notes_parts) or None

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type=product_type,
            interest_rate=float(min_match.group(1)),
            source_url=ADVANCES_URL,
            notes=notes,
        ))
    return records


def scrape() -> list[RateRecord]:
    """
    Fetch and parse NDB's published interest rates.

    Returns:
        A list of RateRecord objects covering the standard Fixed Deposits
        ladder (whole-month tenures only), Savings Deposits tiers, and
        whichever of the 7 new lending categories the advances page
        publishes a real numeric rate for (housing_loan, personal_loan,
        education_loan, pawning, overdraft, card). Returns an empty list
        if the deposits page is disallowed by robots.txt or if neither
        deposits table is found; the advances table is best-effort and
        contributes no records if its page is disallowed or unavailable.
    """
    if not is_allowed(RATES_URL):
        return []

    response = fetch(RATES_URL)
    soup = BeautifulSoup(response.content, "html.parser")

    records: list[RateRecord] = []

    fd_table = _find_table(soup, "Fixed Deposits")
    if fd_table is not None:
        records.extend(_parse_fd_table(fd_table))

    savings_table = _find_table(soup, "Savings Deposits")
    if savings_table is not None:
        records.extend(_parse_savings_table(savings_table))

    if is_allowed(ADVANCES_URL):
        advances_response = fetch(ADVANCES_URL)
        advances_soup = BeautifulSoup(advances_response.content, "html.parser")
        advances_table = _find_table(advances_soup, "Description")
        if advances_table is not None:
            records.extend(_parse_advances_table(advances_table))

    return records
