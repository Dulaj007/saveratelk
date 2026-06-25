"""
banks/nationstrust.py

Scraper for Nations Trust Bank (NTB) savings account interest rates.

Target: the bank's published "Interest Rates" PDF, linked from
         https://www.nationstrust.com/rates-tariffs
Method: PDF (requests + pdfplumber)

This is the project's PDF-parsing bank: of the originally suggested PDF
candidates (NDB, Cargills, Nations Trust), NDB and Cargills have since
migrated to plain HTML rate pages, and NTB's PDF turned out to cover savings
accounts, investment plans, and loans rather than tenor-based fixed
deposits. Only the savings account section is scraped here; investment
plans and loans don't fit the project's product_type model and are skipped.

The PDF's text layout interleaves footnote text between data rows for one
sub-table (multi-tier bonus interest), so a per-line parser is not reliable.
Instead, lines are accumulated into a rolling buffer until a "<rate>%"
pattern appears; everything before it becomes that row's label, and a
second percentage immediately following (separated only by whitespace) is
read as the AER. This naturally re-joins rows pdfplumber split across lines
(e.g. a product name on one line and its rate on the next) while skipping
plain prose lines that contain no percentage at all.

A product name carries forward from the line that introduces it (the part
of a label before the word "Tier") to subsequent tier-only rows, mirroring
the rowspan-tracking approach used for banks whose HTML omits a repeated
label. The bonus-interest sub-table on this page interleaves enough stray
text that this carry-forward is occasionally imprecise for a couple of
rows; the rate and AER values themselves remain correct, only the row's
descriptive label is occasionally noisier than ideal.
"""

import io
import re

import pdfplumber

from lib.http import fetch
from lib.robots import is_allowed
from lib.models import RateRecord

BANK_CODE = "nationstrust"
RATES_PAGE_URL = "https://www.nationstrust.com/rates-tariffs"
PDF_URL = "https://assets.nationstrust.com/2284/_Interest-Rates-Updated-as-of-05.06.2026-.pdf"

# Stop reading once this heading is reached: everything after it is
# investment plans / money market / loans, outside this module's scope.
_STOP_HEADING = "Nations Tax Planner"

# The table header line on page 2, carrying no rate data of its own; must
# be skipped explicitly or it pollutes the first data row's label.
_TABLE_HEADER = "Savings Deposits Description Rate AER"

# A rate, optionally followed immediately (just whitespace) by an AER.
_RATE_AER_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*(?:(\d+(?:\.\d+)?)\s*%)?")

# A plausible product-name prefix: starts with a letter and contains no
# parenthesis. Footnote fragments that wrap onto a tier's line (e.g. the
# tail end of "(Bonus interest is computed in ... base rate)") always
# contain an unmatched "(" or ")" and must not be mistaken for a new
# product name, or the running current_product tracker loses its place.
_PLAUSIBLE_PRODUCT = re.compile(r"^[A-Za-z][^()]*$")


def _iter_savings_lines(pdf_bytes: bytes):
    """
    Yield text lines from the PDF's savings-deposits section (pages 2 and
    3), stopping once _STOP_HEADING is reached.
    """
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages[1:3]:
            text = page.extract_text() or ""
            for line in text.split("\n"):
                stripped = line.strip()
                if stripped == _STOP_HEADING:
                    return
                if stripped == _TABLE_HEADER:
                    continue
                yield line


def _parse_savings_lines(lines) -> list[RateRecord]:
    """
    Parse savings-section lines into RateRecord objects using the rolling
    buffer / carry-forward product name strategy described in the module
    docstring.
    """
    records = []
    current_product = None
    buffer = ""

    for line in lines:
        buffer = f"{buffer} {line.strip()}".strip()
        match = _RATE_AER_PATTERN.search(buffer)
        if not match:
            continue

        label = buffer[: match.start()].strip()
        rate = float(match.group(1))
        aer = float(match.group(2)) if match.group(2) else None

        if "Tier" in label:
            prefix, tier_desc = label.split("Tier", 1)
            prefix = prefix.strip()
            descriptor = f"Tier{tier_desc}".strip()
            if prefix and _PLAUSIBLE_PRODUCT.match(prefix):
                current_product = prefix
        else:
            descriptor = label
            if label and _PLAUSIBLE_PRODUCT.match(label):
                current_product = label

        buffer = buffer[match.end():]

        # The "Nations Max" bonus-interest tiers express a bonus as a
        # percentage of the base rate, not an absolute interest rate (e.g.
        # "60.00%" bonus -> an actual yield of 4.07% AER, shown alongside
        # it). Including the bonus figure as interest_rate would be wrong
        # even where it happens to fall inside the sane-rate bounds; only
        # the AER on these rows reflects what the customer actually earns.
        if current_product and "bonus" in current_product.lower() and "Tier" in label:
            continue

        if current_product and descriptor and descriptor != current_product:
            notes = f"{current_product} - {descriptor}"
        else:
            notes = current_product or descriptor or None

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="savings",
            interest_rate=rate,
            source_url=PDF_URL,
            annual_effective_rate=aer,
            notes=notes,
        ))

    return records


def scrape() -> list[RateRecord]:
    """
    Download Nations Trust Bank's published interest rates PDF and parse
    the savings account section.

    Returns:
        A list of RateRecord objects covering retail savings account
        tiers. Returns an empty list if the page is disallowed by
        robots.txt.
    """
    if not is_allowed(PDF_URL):
        return []

    response = fetch(PDF_URL)
    return _parse_savings_lines(_iter_savings_lines(response.content))
