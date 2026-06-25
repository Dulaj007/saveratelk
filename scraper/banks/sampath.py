"""
banks/sampath.py

Scraper for Sampath Bank interest rates.

Target:
  https://www.sampath.lk/rates-and-charges?activeTab=interest-rates-local  (FD ladder, rendered DOM)
  https://www.sampath.lk/api/rates-and-charges                            (savings rate, JSON API)
Method: Selenium for the FD ladder, plain HTTP for the savings rate.

Sampath's rates page is a Nuxt.js app whose tab content is rendered fully
into the DOM up front (not lazily on click), so the FD ladder can be read
directly from a rendered page_source without needing to interact with any
tab control. But the same markup is duplicated verbatim elsewhere in the
DOM (apparently a separate desktop/mobile layout branch), so every record
parsed must be de-duplicated by (tenure, payment, rate) or each row would
be stored twice.

The page also calls a JSON API (https://www.sampath.lk/api/rates-and-charges)
that, on inspection, has a content-management bug: every category in its
"interest_rates_local" list ("Savings Rates", "Term Deposits Rates", "Loan
Rates", "Treasury Bills & REPO Rates") returns the *same* savings-account
items regardless of category, so it cannot be used to source Term Deposit
rates at all. It is still useful for the headline Savings rate, since that
specific item ("Normal Savings Accounts - Double S") is itself correct;
only the category groupings around it are broken.
"""

import re
import time

import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup

from config import USER_AGENT, REQUEST_TIMEOUT, SELENIUM_HEADLESS
from lib.robots import is_allowed
from lib.models import RateRecord

BANK_CODE = "sampath"
FD_PAGE_URL = "https://www.sampath.lk/rates-and-charges?activeTab=interest-rates-local"
API_URL = "https://www.sampath.lk/api/rates-and-charges"

_TENURE_PATTERN = re.compile(r"(?<![\d.])(\d+)\s*Months?\b", re.IGNORECASE)
_RATE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")

_PAYMENT_COLUMN_MAP = {
    "maturity": "at-maturity",
    "monthly":  "monthly",
    "annually": "annually",
}


def _render_fd_page() -> str:
    """Load the rates page in headless Chrome and return the rendered HTML."""
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
        driver.get(FD_PAGE_URL)
        time.sleep(6)
        return driver.page_source
    finally:
        driver.quit()


def _is_fd_ladder_table(table) -> bool:
    """
    A genuine FD ladder table has a "Period" first column and at least one
    further column whose header mentions "Maturity", with enough columns to
    distinguish it from the simpler two-column "maturity only" variant.
    """
    header_cells = [c.get_text(" ", strip=True) for c in table.find_all("tr")[0].find_all(["td", "th"])]
    if len(header_cells) < 4 or header_cells[0] != "Period":
        return False
    return "maturity" in header_cells[1].lower()


def _parse_fd_table(table) -> list[tuple[int, str, float, float | None]]:
    """
    Parse one FD ladder table into (tenure_months, payment, rate, aer)
    tuples. Day-based tenure rows (e.g. "75 Days") are skipped. Only
    whole-month tenures fit this project's tenure_months column.
    """
    results = []
    rows = table.find_all("tr")[1:]
    payments = list(_PAYMENT_COLUMN_MAP.values())

    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        tenure_match = _TENURE_PATTERN.search(cells[0].get_text(strip=True))
        if not tenure_match:
            continue
        tenure_months = int(tenure_match.group(1))

        for col_index, payment in enumerate(payments, start=1):
            if col_index >= len(cells):
                break
            cell_text = cells[col_index].get_text(" ", strip=True)
            rates = _RATE_PATTERN.findall(cell_text)
            if not rates:
                continue
            rate = float(rates[0])
            aer = float(rates[1]) if len(rates) > 1 else None
            results.append((tenure_months, payment, rate, aer))
    return results


def _scrape_fd_ladder() -> list[RateRecord]:
    """
    Render the FD page, parse every FD ladder table found, and de-duplicate
    rows that appear more than once due to the page's duplicated markup.
    """
    soup = BeautifulSoup(_render_fd_page(), "html.parser")
    tables = [t for t in soup.find_all("table") if _is_fd_ladder_table(t)]

    seen: set[tuple[int, str, float]] = set()
    records = []
    for table in tables:
        for tenure_months, payment, rate, aer in _parse_fd_table(table):
            key = (tenure_months, payment, rate)
            if key in seen:
                continue
            seen.add(key)
            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type="fd",
                interest_rate=rate,
                source_url=FD_PAGE_URL,
                tenure_months=tenure_months,
                annual_effective_rate=aer,
                interest_payment=payment,
            ))
    return records


def _scrape_savings_rate() -> list[RateRecord]:
    """
    Fetch the headline Normal Savings Account rate from the JSON API. Only
    the base rate is used. The API's bonus-tier sub-table for this same
    product is left unparsed, since the surrounding category data is known
    to be unreliable (see module docstring) and the base rate alone is
    sufficient to keep this comparable to every other bank's savings entry.
    """
    response = requests.get(API_URL, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    data = response.json()

    for category in data.get("interest_rates_local", []):
        for item in category.get("interest_rate_items", []):
            if item.get("title") == "Normal Savings Accounts - Double S":
                rate_match = _RATE_PATTERN.search(item.get("sub_title") or "")
                if rate_match:
                    return [RateRecord(
                        bank_code=BANK_CODE,
                        product_type="savings",
                        interest_rate=float(rate_match.group(1)),
                        source_url=API_URL,
                        notes="Normal Savings Account",
                    )]
    return []


def scrape() -> list[RateRecord]:
    """
    Fetch and parse Sampath Bank's published interest rates.

    Returns:
        A list of RateRecord objects covering the standard Fixed Deposit
        ladder and the headline Normal Savings Account rate. Returns an
        empty list if the FD page is disallowed by robots.txt.
    """
    if not is_allowed(FD_PAGE_URL):
        return []

    records = _scrape_fd_ladder()
    records.extend(_scrape_savings_rate())
    return records
