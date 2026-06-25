"""
banks/dfcc.py

Scraper for DFCC Bank interest rates.

Target:
  https://www.dfcc.lk/rates-and-tariff?tab=fixed_deposits
  https://www.dfcc.lk/rates-and-tariff?tab=saving_rates
Method: Selenium (headless Chrome)

DFCC's rates hub is a client-rendered page whose three tabs (Fixed
Deposits, Interest Rates, Lending Rates) are selected via a "?tab=" query
parameter rather than ordinary navigation links, and the tab content does
not exist in the page until JavaScript runs. The dedicated FD product page
(rates-and-tariff's sibling "DFCC Fixed Deposits" page) only shows a
secondary "Special" day-based product — the standard tenor ladder lives
only on the hub page's fixed_deposits tab.

The Fixed Deposits ladder itself renders as a *transposed* table: one
column per tenure, and rows alternating between a payment-frequency label
("Nominal", "Monthly", "Quarterly", "Bi Annually", "Annually") and its AER,
rather than the (tenure-per-row) layout every other bank in this project
uses. The ladder also spans two separate tables — a short-tenor one (1
Month to 1 Year) and a long-tenor one (1 Year to 5 Years) — which overlap
at the "1 Year" column; the short-tenor table's "1 Year" column is skipped
to avoid storing that overlap twice.
"""

import re
import time

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup

from config import USER_AGENT, SELENIUM_HEADLESS
from lib.robots import is_allowed
from lib.models import RateRecord

BANK_CODE = "dfcc"
FD_URL = "https://www.dfcc.lk/rates-and-tariff?tab=fixed_deposits"
SAVINGS_URL = "https://www.dfcc.lk/rates-and-tariff?tab=saving_rates"

_TENURE_PATTERN = re.compile(r"(\d+)\s*(Month|Year)s?\b", re.IGNORECASE)
_RATE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")

_PAYMENT_MAP = {
    "nominal":     "at-maturity",
    "monthly":     "monthly",
    "quarterly":   "quarterly",
    "bi annually": "semi-annually",
    "annually":    "annually",
}


def _render(url: str) -> str:
    """Load url in headless Chrome and return the fully rendered page HTML."""
    options = Options()
    if SELENIUM_HEADLESS:
        options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument(f"--user-agent={USER_AGENT}")
    options.add_argument("--disable-features=AsyncDns,DnsOverHttps")
    options.add_argument("--dns-prefetch-disable")

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    try:
        driver.get(url)
        time.sleep(6)
        return driver.page_source
    finally:
        driver.quit()


def _parse_tenure(label: str) -> int | None:
    """Convert a column header like "3 Months" or "2 Years" into whole months."""
    match = _TENURE_PATTERN.search(label)
    if not match:
        return None
    value = int(match.group(1))
    unit = match.group(2).lower()
    return value if unit == "month" else value * 12


def _parse_transposed_fd_table(table, skip_tenures: set[int]) -> list[RateRecord]:
    """
    Parse a transposed Fixed Deposits table: row 0 is the tenure header,
    every pair of rows after that is (payment-frequency label, AER), with
    one column per tenure. See module docstring for why this layout needs
    its own parser rather than the row-per-tenure one used elsewhere.
    """
    rows = table.find_all("tr")
    if not rows:
        return []

    header_cells = [c.get_text(strip=True) for c in rows[0].find_all(["td", "th"])]
    tenure_labels = header_cells[1:]
    tenures = [_parse_tenure(label) for label in tenure_labels]

    records = []
    row_index = 1
    while row_index + 1 < len(rows):
        label_cells = [c.get_text(strip=True) for c in rows[row_index].find_all(["td", "th"])]
        aer_cells = [c.get_text(strip=True) for c in rows[row_index + 1].find_all(["td", "th"])]
        row_index += 2

        if not label_cells or aer_cells[:1] != ["AER"]:
            continue
        payment = _PAYMENT_MAP.get(label_cells[0].strip().lower())
        if payment is None:
            continue

        for col_index, tenure_months in enumerate(tenures):
            if tenure_months is None or tenure_months in skip_tenures:
                continue
            rate_text = label_cells[col_index + 1] if col_index + 1 < len(label_cells) else "-"
            aer_text = aer_cells[col_index + 1] if col_index + 1 < len(aer_cells) else "-"
            rate_match = _RATE_PATTERN.search(rate_text)
            if not rate_match:
                continue
            aer_match = _RATE_PATTERN.search(aer_text)

            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type="fd",
                interest_rate=float(rate_match.group(1)),
                source_url=FD_URL,
                tenure_months=tenure_months,
                annual_effective_rate=float(aer_match.group(1)) if aer_match else None,
                interest_payment=payment,
            ))
    return records


def _is_fd_ladder_table(table) -> bool:
    """A genuine FD ladder table's header row starts with "Category" and a tenure column."""
    rows = table.find_all("tr")
    if not rows:
        return False
    header_cells = [c.get_text(strip=True) for c in rows[0].find_all(["td", "th"])]
    return bool(header_cells) and header_cells[0] == "Category" and any(
        _TENURE_PATTERN.search(c) for c in header_cells[1:]
    )


def _parse_savings_table(table) -> list[RateRecord]:
    """
    Parse the standard DFCC Savings Account tier table (the first table on
    the savings tab) into RateRecord objects. Columns: Deposit Range (LKR)
    | Interest Rate (% P.A.), with the AER given in parentheses.
    """
    records = []
    for row in table.find_all("tr")[1:]:
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        label = cells[0].get_text(strip=True)
        cell_text = cells[1].get_text(" ", strip=True)
        rates = _RATE_PATTERN.findall(cell_text)
        if not rates:
            continue
        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="savings",
            interest_rate=float(rates[0]),
            source_url=SAVINGS_URL,
            annual_effective_rate=float(rates[1]) if len(rates) > 1 else None,
            notes=label or None,
        ))
    return records


def scrape() -> list[RateRecord]:
    """
    Render DFCC's Fixed Deposits and Savings rate tabs with headless Chrome
    and parse the published interest rates.

    Returns:
        A list of RateRecord objects covering the standard Fixed Deposit
        ladder (1 month to 5 years) and the standard Savings Account tiers.
        Returns an empty list if either tab is disallowed by robots.txt.
    """
    if not is_allowed(FD_URL) or not is_allowed(SAVINGS_URL):
        return []

    records: list[RateRecord] = []

    fd_soup = BeautifulSoup(_render(FD_URL), "html.parser")
    fd_tables = [t for t in fd_soup.find_all("table") if _is_fd_ladder_table(t)]
    skip_tenures: set[int] = set()
    for table in fd_tables:
        records.extend(_parse_transposed_fd_table(table, skip_tenures))
        # Once the short-tenor table has been parsed, its "1 Year" column
        # must not be repeated when the long-tenor table is parsed next.
        skip_tenures = {12}

    savings_soup = BeautifulSoup(_render(SAVINGS_URL), "html.parser")
    savings_tables = savings_soup.find_all("table")
    if savings_tables:
        records.extend(_parse_savings_table(savings_tables[0]))

    return records
