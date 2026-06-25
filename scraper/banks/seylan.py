"""
banks/seylan.py

Scraper for Seylan Bank interest rates.

Target: https://www.seylan.lk/interest-rates
Method: static HTML (requests + BeautifulSoup)

Seylan's page renders every rate category into its own content panel, toggled
client-side by tab clicks but all present in the raw HTML. Each panel has a
predictable class name of the form "<product>_content" (e.g.
"normalsavings_content", "rupeefixeddepositatmaturity_content"), so the
correct table can be located directly by class rather than by position.

Within each table, the label cell concatenates the row label with the rate
and AER values with no separator (e.g. "2 MONTHS7.507.74"), because the
visible site re-renders these cells with CSS; the raw text simply runs them
together. Since the rate and AER are already available cleanly in their own
columns, the known "<rate><aer>" suffix is stripped off the label to recover
the clean label text.

The same page also publishes a "Loans & Advances" section further down,
covering Housing Loans, Personal Loans, Personal Vehicle Loans (leasing),
Scholar Loans (education), Overdrafts, and Pawning/Gold Loan. These tables
are NOT inside the tabbed "<product>_content" panels used by FD/savings;
each is a plain table preceded by its own <h3> heading, located the same
way panasia.py locates its FD tables (nearest preceding heading text).

The loan tables (housing/personal/vehicle/scholar) break each tenure row
into several rate columns by employment/income category and credit-card
status — there is no single published flat rate. Rather than invent one
"the" rate, the lowest rate in the lowest-tenure row is scraped as a
representative "from X%" figure (the best case a qualifying customer could
get), with a note that the true rate varies by category and tenure. The
Overdrafts row is a single flat rate, no tenure breakdown. The Pawning/Gold
Loan table publishes a single bottom "Interest Rate" row with one rate per
loan-type column (12-month pawning, 3-month gold loan, etc.), applying
uniformly across all karatage tiers above it.
"""

import re
from bs4 import BeautifulSoup

from lib.http import fetch
from lib.robots import is_allowed
from lib.models import RateRecord

BANK_CODE = "seylan"
RATES_URL = "https://www.seylan.lk/interest-rates"

# The standard Rupee Fixed Deposit (interest paid at maturity) panel.
_FD_CONTENT_CLASS = "rupeefixeddepositatmaturity_content"

# The standard Normal Savings Account panel.
_SAVINGS_CONTENT_CLASS = "normalsavings_content"

# Headings preceding the Loans & Advances tables (outside the tabbed panels).
_HOUSING_LOAN_HEADING  = "Housing Loans & Loan Against Property (Lap)"
_PERSONAL_LOAN_HEADING = "Personal Loan"
_VEHICLE_LOAN_HEADING  = "Personal Vehicle Loan"
_SCHOLAR_LOAN_HEADING  = "Scholar Loan"
_ADVANCES_HEADING      = "Interest Rates on Advances"
_PAWNING_HEADING       = "Pawning and Gold Loan"

_TENURE_PATTERN = re.compile(r"(\d+)\s*MONTHS?", re.IGNORECASE)
_RATE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%?")


def _clean_label(raw_label: str, rate_text: str, aer_text: str) -> str:
    """
    Strip the trailing "<rate><aer>" suffix that Seylan concatenates onto
    each row's label cell, returning just the human-readable label.

    Example: raw_label="2 MONTHS7.507.74", rate_text="7.50", aer_text="7.74"
             -> "2 MONTHS"
    """
    suffix = f"{rate_text}{aer_text}"
    if raw_label.endswith(suffix):
        return raw_label[: -len(suffix)].strip()
    return raw_label.strip()


def _find_panel(soup: BeautifulSoup, content_class: str):
    """Return the first table found inside the div carrying content_class."""
    panel = soup.find("div", class_=content_class)
    if panel is None:
        return None
    return panel.find("table")


def _parse_fd_table(table) -> list[RateRecord]:
    """
    Parse the Rupee Fixed Deposit (at maturity) table into RateRecord objects.
    Columns: Interest Period | Interest Rate % p.a. | AER %.
    """
    records = []
    rows = table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        rate_text = cells[1].get_text(strip=True)
        aer_text  = cells[2].get_text(strip=True)
        label     = _clean_label(cells[0].get_text(strip=True), rate_text, aer_text)

        tenure_match = _TENURE_PATTERN.search(label)
        if not tenure_match:
            continue

        try:
            rate = float(rate_text)
            aer  = float(aer_text)
        except ValueError:
            continue

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="fd",
            interest_rate=rate,
            source_url=RATES_URL,
            tenure_months=int(tenure_match.group(1)),
            annual_effective_rate=aer,
            interest_payment="at-maturity",
        ))
    return records


def _parse_savings_table(table) -> list[RateRecord]:
    """
    Parse the Normal Savings Account table into RateRecord objects, one per
    balance tier. Columns: (balance tier) | Interest Rate % p.a. | AER %.
    """
    records = []
    rows = table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        rate_text = cells[1].get_text(strip=True)
        aer_text  = cells[2].get_text(strip=True)
        label     = _clean_label(cells[0].get_text(strip=True), rate_text, aer_text)

        try:
            rate = float(rate_text)
            aer  = float(aer_text)
        except ValueError:
            continue

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="savings",
            interest_rate=rate,
            source_url=RATES_URL,
            annual_effective_rate=aer,
            notes=label or None,
        ))
    return records


def _find_table_after_heading(soup: BeautifulSoup, heading_text: str):
    """
    Return the first table following the heading whose text matches
    heading_text exactly, scanning all headings on the page (same approach
    as panasia.py's _find_fd_tables, used here because the loans/advances
    section is not inside the tabbed "<product>_content" panels).
    """
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5", "strong"]):
        if heading.get_text(strip=True) == heading_text:
            table = heading.find_next("table")
            if table is not None:
                return table
    return None


def _parse_lowest_tier_loan_table(table, product_type: str, source_url: str) -> list[RateRecord]:
    """
    Parse a multi-category loan table (Housing/Personal/Vehicle/Scholar Loan)
    by taking only the lowest-tenure row and, within that row, the lowest
    published rate across its category columns. These tables break each
    tenure down by employment/income category and credit-card status with
    no single "the rate" published, so the lowest rate in the lowest-tenure
    row is taken as a representative best-case "from X%" figure.

    Layout: row 0 is the category header (e.g. "Professionals... LKR
    300,000/- & Above"), row 1 is the With/Without Credit Card & Internet
    Banking sub-header, and data starts at row 2.
    """
    rows = table.find_all("tr")[2:]
    if not rows:
        return []

    first_row = rows[0]
    cells = first_row.find_all(["td", "th"])
    if len(cells) < 2:
        return []

    label = cells[0].get_text(strip=True)
    rates = []
    for cell in cells[1:]:
        text = cell.get_text(strip=True)
        match = _RATE_PATTERN.search(text)
        if match:
            rates.append(float(match.group(1)))
    if not rates:
        return []

    lowest = min(rates)
    return [RateRecord(
        bank_code=BANK_CODE,
        product_type=product_type,
        interest_rate=lowest,
        source_url=source_url,
        notes=(
            f"From {lowest}% at {label} tenure (best-case category); "
            f"rate varies by tenure, employment/income category, and "
            f"credit card & internet banking status."
        ),
    )]


def _parse_advances_table(table) -> list[RateRecord]:
    """
    Parse the "Interest Rates on Advances" table (Description | Rates
    Applicable % p.a.) and return only the Overdrafts row.
    """
    records = []
    rows = table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue

        label = cells[0].get_text(strip=True)
        if "overdraft" not in label.lower():
            continue

        rate_match = _RATE_PATTERN.search(cells[1].get_text(strip=True))
        if not rate_match:
            continue

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="overdraft",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            notes=label,
        ))
    return records


def _parse_pawning_table(table) -> list[RateRecord]:
    """
    Parse the Pawning/Gold Loan table's bottom "Interest Rate" row, which
    publishes one flat rate per loan-type column (e.g. "12 Months -
    Pawning", "3 Months Gold Loan") applying uniformly across all karatage
    tiers listed above it in the same table.
    """
    header_cells = table.find_all("tr")[0].find_all(["td", "th"])
    column_labels = [c.get_text(strip=True) for c in header_cells[1:]]

    records = []
    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if not cells:
            continue
        if "interest rate" not in cells[0].get_text(strip=True).lower():
            continue

        for column_label, cell in zip(column_labels, cells[1:]):
            rate_match = _RATE_PATTERN.search(cell.get_text(strip=True))
            if not rate_match:
                continue
            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type="pawning",
                interest_rate=float(rate_match.group(1)),
                source_url=RATES_URL,
                notes=column_label,
            ))
        break  # only one "Interest Rate" row is expected

    return records


def scrape() -> list[RateRecord]:
    """
    Fetch and parse Seylan Bank's published interest rates.

    Returns:
        A list of RateRecord objects covering the standard Rupee Fixed
        Deposit (at maturity) tenures, Normal Savings Account tiers, and
        (where a real number is published) representative rates for
        housing loans, personal loans, leasing (personal vehicle loans),
        education loans (Scholar Loan), overdrafts, and pawning/gold loan.
        Returns an empty list if the page is disallowed by robots.txt or
        if no panels/tables are found.
    """
    if not is_allowed(RATES_URL):
        return []

    response = fetch(RATES_URL)
    soup = BeautifulSoup(response.content, "html.parser")

    records: list[RateRecord] = []

    fd_table = _find_panel(soup, _FD_CONTENT_CLASS)
    if fd_table is not None:
        records.extend(_parse_fd_table(fd_table))

    savings_table = _find_panel(soup, _SAVINGS_CONTENT_CLASS)
    if savings_table is not None:
        records.extend(_parse_savings_table(savings_table))

    housing_table = _find_table_after_heading(soup, _HOUSING_LOAN_HEADING)
    if housing_table is not None:
        records.extend(_parse_lowest_tier_loan_table(housing_table, "housing_loan", RATES_URL))

    personal_table = _find_table_after_heading(soup, _PERSONAL_LOAN_HEADING)
    if personal_table is not None:
        records.extend(_parse_lowest_tier_loan_table(personal_table, "personal_loan", RATES_URL))

    vehicle_table = _find_table_after_heading(soup, _VEHICLE_LOAN_HEADING)
    if vehicle_table is not None:
        records.extend(_parse_lowest_tier_loan_table(vehicle_table, "leasing", RATES_URL))

    scholar_table = _find_table_after_heading(soup, _SCHOLAR_LOAN_HEADING)
    if scholar_table is not None:
        records.extend(_parse_lowest_tier_loan_table(scholar_table, "education_loan", RATES_URL))

    advances_table = _find_table_after_heading(soup, _ADVANCES_HEADING)
    if advances_table is not None:
        records.extend(_parse_advances_table(advances_table))

    pawning_table = _find_table_after_heading(soup, _PAWNING_HEADING)
    if pawning_table is not None:
        records.extend(_parse_pawning_table(pawning_table))

    return records
