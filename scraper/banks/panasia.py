"""
banks/panasia.py

Scraper for Pan Asia Banking Corporation interest rates.

Target:
  https://www.pabcbank.com/personal-banking/savings-investments/fixed-deposits/general-fixed-deposits/
  https://www.pabcbank.com/personal-banking/savings-investments/normal-savings-accounts/
Method: Selenium (headless Chrome)

Note: the bank's commonly assumed domain (panasiabank.lk) does not resolve;
the real site is pabcbank.com (confirmed via search, since the .lk domain
the original bank registry assumed does not exist). The site also runs a
Sucuri JavaScript bot-challenge in front of every page, which blocks plain
HTTP requests outright, so a real browser is required just to get past the
challenge, on top of the page itself being client-rendered.

The Fixed Deposits table spans tenures across a two-row header: the first
header row gives each tenure label with an HTML colspan indicating how many
payment-frequency columns it covers (e.g. "12 Months" spans 3 columns: paid
monthly / biannually / at maturity), and the second header row lists those
payment frequencies as a flat sequence. The colspan must be read directly
from the HTML rather than assumed, since shorter tenures only offer a single
payment frequency (maturity) while longer ones offer several.
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

BANK_CODE = "panasia"
FD_URL = "https://www.pabcbank.com/personal-banking/savings-investments/fixed-deposits/general-fixed-deposits/"
SAVINGS_URL = "https://www.pabcbank.com/personal-banking/savings-investments/normal-savings-accounts/"

# Only tables under this exact heading are the standard FD ladder; the page
# also renders separate tables for senior-citizen and women's FD variants
# further down, which are intentionally excluded.
_FD_HEADING = "Fixed Deposits Rates & Fees"

_PAYMENT_MAP = {
    "maturity": "at-maturity",
    "monthly":  "monthly",
    "biannual": "semi-annually",
    "annual":   "annually",
}

_RATE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_AMOUNT_ONLY  = re.compile(r"^[\d,]+/-$")


def _render(url: str) -> str:
    """
    Load url in headless Chrome and return the fully rendered page HTML
    after client-side JavaScript (React content + Sucuri challenge) runs.
    """
    options = Options()
    if SELENIUM_HEADLESS:
        options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument(f"--user-agent={USER_AGENT}")
    # Chrome's secure DNS resolver fails in this deployment's network even
    # though plain HTTP requests resolve fine; disable it to fall back to
    # the system resolver.
    options.add_argument("--disable-features=AsyncDns,DnsOverHttps")
    options.add_argument("--dns-prefetch-disable")

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    try:
        driver.get(url)
        time.sleep(6)  # let React render and the Sucuri challenge clear
        return driver.page_source
    finally:
        driver.quit()


def _expand_tenure_header(header_row) -> list[str]:
    """
    Read the tenure header row and expand it into a flat list of tenure
    labels, one per underlying payment-frequency column, using each cell's
    colspan attribute (defaulting to 1 when absent).
    """
    expanded = []
    for cell in header_row.find_all(["td", "th"])[1:]:  # skip leading blank cell
        label = cell.get_text(strip=True)
        span = int(cell.get("colspan", 1))
        expanded.extend([label] * span)
    return expanded


def _parse_fd_table(table) -> list[RateRecord]:
    """
    Parse one Fixed Deposits ladder table (tenure header / payment-frequency
    header / rate row / AER row) into RateRecord objects.
    """
    rows = table.find_all("tr")
    if len(rows) < 4:
        return []

    tenures  = _expand_tenure_header(rows[0])
    payments = [c.get_text(strip=True).lower() for c in rows[1].find_all(["td", "th"])[1:]]
    rates    = [c.get_text(strip=True) for c in rows[2].find_all(["td", "th"])[1:]]
    aers     = [c.get_text(strip=True) for c in rows[3].find_all(["td", "th"])[1:]]

    records = []
    for tenure_label, payment_label, rate_text, aer_text in zip(tenures, payments, rates, aers):
        tenure_match = re.search(r"(\d+)\s*(Month|Year)s?", tenure_label, re.IGNORECASE)
        rate_match = _RATE_PATTERN.search(rate_text)
        if not tenure_match or not rate_match:
            continue

        value = int(tenure_match.group(1))
        unit = tenure_match.group(2).lower()
        tenure_months = value if unit == "month" else value * 12

        aer_match = _RATE_PATTERN.search(aer_text)
        payment = next((v for k, v in _PAYMENT_MAP.items() if k in payment_label), None)

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


def _find_fd_tables(soup: BeautifulSoup) -> list:
    """Return all tables on the FD page whose nearest preceding heading matches _FD_HEADING."""
    matches = []
    for table in soup.find_all("table"):
        preceding = table.find_previous(["h1", "h2", "h3", "h4", "h5", "p", "strong"])
        if preceding and preceding.get_text(strip=True) == _FD_HEADING:
            matches.append(table)
    return matches


def _parse_savings_rows(soup: BeautifulSoup) -> list[RateRecord]:
    """
    Parse the Normal Savings Account table. The header row has an
    inconsistent column layout (a rowspanned "Initial Deposit" column makes
    text alignment unreliable), so each data row is scanned for percentage
    values directly: the first is the nominal rate, the second (if present)
    is the AER. The balance-tier label is taken as the longest remaining
    cell that isn't a bare deposit amount.
    """
    records = []
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        for row in rows[1:]:
            cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
            percents = [c for c in cells if re.fullmatch(r"\d+(?:\.\d+)?%", c)]
            if not percents:
                continue

            rate = float(percents[0].rstrip("%"))
            aer = float(percents[1].rstrip("%")) if len(percents) > 1 else None

            # Prefer the balance-tier cell over footnote text (which starts
            # with "*"), since both can otherwise look like valid labels.
            label_candidates = [
                c for c in cells
                if c and c not in percents and not _AMOUNT_ONLY.match(c) and not c.startswith("*")
            ]
            label = max(label_candidates, key=len) if label_candidates else None

            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type="savings",
                interest_rate=rate,
                source_url=SAVINGS_URL,
                annual_effective_rate=aer,
                notes=label,
            ))
    return records


def scrape() -> list[RateRecord]:
    """
    Render Pan Asia's Fixed Deposits and Savings Account pages with headless
    Chrome and parse the published interest rates.

    Returns:
        A list of RateRecord objects covering the standard Fixed Deposit
        ladder and Normal Savings Account tiers. Returns an empty list if
        either page is disallowed by robots.txt.
    """
    if not is_allowed(FD_URL) or not is_allowed(SAVINGS_URL):
        return []

    records: list[RateRecord] = []

    fd_html = _render(FD_URL)
    fd_soup = BeautifulSoup(fd_html, "html.parser")
    for table in _find_fd_tables(fd_soup):
        records.extend(_parse_fd_table(table))

    savings_html = _render(SAVINGS_URL)
    savings_soup = BeautifulSoup(savings_html, "html.parser")
    records.extend(_parse_savings_rows(savings_soup))

    return records
