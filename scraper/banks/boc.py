"""
banks/boc.py

Scraper for Bank of Ceylon (BOC) interest rates.

Target: https://www.boc.lk/rates-tariff
Method: static HTML (requests + BeautifulSoup)

BOC publishes its rates page in three languages per cell (Sinhala, Tamil,
English concatenated with no separator inside each <td>). The English
segment is always last and is the only part written in the ASCII range,
so it can be isolated with a trailing-ASCII regex rather than guessing at
delimiters between scripts.

The page has dozens of tables sharing the class "ck-table-resized" (FX
rates, treasury bills, loans, etc.). The fixed deposit table and the
savings table are located by matching their header/caption text rather
than a fixed table index, since BOC can reorder sections on the page.

BOC's lending product tables don't all share one layout, so each is
located differently:
  - Educational Loans has the same single merged-cell caption row inside
    its own <table> as "SAVINGS DEPOSIT ACCOUNT" does.
  - Personal Loans, Housing Loans, Leasing and Ran Surekum Naya Seva
    (gold loan/pawning) instead have their only caption in a separate
    <h3> heading just before the table (found via
    _find_table_after_heading), with the table's own row 0 already being
    its real column header — Personal Loans' table is unlike the others
    again: each scheme is one row whose second cell concatenates every
    repayment-tier rate as free text ("Upto 5 Years : 14.00% Above 5
    Years and Upto 7 Years : 14.50% ...") with no further per-tier table
    structure, so it's parsed with a regex instead of cell-by-cell.
  - The Credit Cards interest rate has no heading or caption of its own
    at all — it's a small two-row table (header "... Interest Rate
    (p.a.)", one data row labelled "Credit Cards") found by that exact
    label rather than any caption, since it would otherwise be
    indistinguishable from the much larger fee tables nearby.
"""

import re
from bs4 import BeautifulSoup

from lib.http import fetch
from lib.robots import is_allowed
from lib.models import RateRecord

BANK_CODE = "boc"
RATES_URL = "https://www.boc.lk/rates-tariff"

# Matches a trailing run of ASCII (plus non-breaking space) characters,
# which isolates the English segment of a Sinhala/Tamil/English cell.
_ENGLISH_TAIL = re.compile(r"[\x00-\x7F\xa0]+$")

# Matches a tenure number followed by "Month(s)" or "Year(s)".
_TENURE_PATTERN = re.compile(r"(\d+)\s*(Month|Year)s?\b", re.IGNORECASE)

# Matches a percentage value, e.g. "7.25%" or "2.00% p.a.".
_RATE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")


def _extract_english(cell_text: str) -> str:
    """
    Return the trailing English segment of a trilingual table cell.

    BOC writes each cell as Sinhala + Tamil + English with no delimiter.
    Since Sinhala and Tamil characters fall outside the ASCII range, the
    longest trailing run of ASCII characters is the English text.
    """
    match = _ENGLISH_TAIL.search(cell_text)
    return match.group(0).strip() if match else cell_text.strip()


def _parse_tenure_and_payment(english_text: str) -> tuple[int | None, str | None, str | None]:
    """
    Parse an FD row's English label into (tenure_months, interest_payment, notes).

    Examples of input text:
        "1 Month"                                    -> (1, None, None)
        "1 Year -Interest at maturity"                -> (12, "at-maturity", None)
        "2 Years -Interest paid monthly"               -> (24, "monthly", None)
        "1 Year | Senior Citizens* -Interest at maturity" -> (12, "at-maturity", "Senior Citizens rate")
    """
    tenure_months = None
    match = _TENURE_PATTERN.search(english_text)
    if match:
        value = int(match.group(1))
        unit = match.group(2).lower()
        tenure_months = value if unit == "month" else value * 12

    payment = None
    lowered = english_text.lower()
    if "at maturity" in lowered:
        payment = "at-maturity"
    elif "paid monthly" in lowered:
        payment = "monthly"
    elif "paid annually" in lowered:
        payment = "annually"

    notes = "Senior Citizens rate" if "senior citizen" in lowered else None

    return tenure_months, payment, notes


def _find_fd_table(soup: BeautifulSoup):
    """
    Locate the Rupee Fixed Deposit table by its header row signature:
    first column English text contains "Term", second contains "Interest Rate".
    """
    for table in soup.find_all("table", class_="ck-table-resized"):
        rows = table.find_all("tr")
        if not rows:
            continue
        header_cells = rows[0].find_all(["td", "th"])
        if len(header_cells) < 2:
            continue
        first_header  = _extract_english(header_cells[0].get_text(" ", strip=True))
        second_header = _extract_english(header_cells[1].get_text(" ", strip=True))
        if "term" in first_header.lower() and "interest rate" in second_header.lower():
            return table
    return None


def _find_savings_table(soup: BeautifulSoup):
    """
    Locate the Savings Deposit Account table by its caption row, which is a
    single merged cell ending in "SAVINGS DEPOSIT ACCOUNT".
    """
    for table in soup.find_all("table", class_="ck-table-resized"):
        rows = table.find_all("tr")
        if not rows:
            continue
        caption_cells = rows[0].find_all(["td", "th"])
        if len(caption_cells) != 1:
            continue
        caption = _extract_english(caption_cells[0].get_text(" ", strip=True))
        if "savings deposit account" in caption.lower():
            return table
    return None


def _find_table_by_caption(soup: BeautifulSoup, caption_substring: str):
    """
    Locate a table by its single merged-cell caption row containing
    caption_substring (case-insensitive), following the same convention as
    _find_savings_table.
    """
    for table in soup.find_all("table", class_="ck-table-resized"):
        rows = table.find_all("tr")
        if not rows:
            continue
        caption_cells = rows[0].find_all(["td", "th"])
        if len(caption_cells) != 1:
            continue
        caption = _extract_english(caption_cells[0].get_text(" ", strip=True))
        if caption_substring.lower() in caption.lower():
            return table
    return None


def _find_table_after_heading(soup: BeautifulSoup, heading_text: str):
    """
    Return the first table following the <h3> whose text matches
    heading_text exactly. Used for Personal Loans, Housing Loans, Leasing
    and Ran Surekum Naya Seva (pawning), which — unlike Savings/
    Educational Loans — have no single merged-cell caption row of their
    own inside the table; their only caption lives in a separate <h3>
    heading just before the table, whose own row 0 is already the real
    column header.
    """
    for heading in soup.find_all("h3"):
        if heading.get_text(strip=True) == heading_text:
            table = heading.find_next("table")
            if table is not None:
                return table
    return None


def _find_credit_card_rate(soup: BeautifulSoup) -> tuple[float, str] | None:
    """
    Find BOC's published credit card interest rate: a small standalone
    table (header row "... Interest Rate (p.a.)", one data row whose
    English-tail label is "Credit Cards" and whose second cell is the flat
    rate, e.g. "28.00%") — distinct from the much larger Joining Fees/
    Annual Fees/Other Fees & Charges tariff tables elsewhere on the page,
    which list amounts in Rs., not a percentage rate. Returns
    (rate, label) or None.
    """
    for table in soup.find_all("table", class_="ck-table-resized"):
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) != 2:
                continue
            label = _extract_english(cells[0].get_text(" ", strip=True))
            if label.lower() != "credit cards":
                continue
            rate_match = _RATE_PATTERN.search(_extract_english(cells[1].get_text(" ", strip=True)))
            if rate_match:
                return float(rate_match.group(1)), label
    return None


def _parse_fd_table(table) -> list[RateRecord]:
    """
    Parse the Rupee Fixed Deposit table into RateRecord objects.
    Skips the header row; skips any row that does not resolve to a tenure.
    """
    records = []
    rows = table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue

        english_label = _extract_english(cells[0].get_text(" ", strip=True))
        tenure_months, payment, notes = _parse_tenure_and_payment(english_label)
        if tenure_months is None:
            continue

        rate_match = _RATE_PATTERN.search(cells[1].get_text(" ", strip=True))
        if not rate_match:
            continue

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="fd",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            tenure_months=tenure_months,
            interest_payment=payment,
            notes=notes,
        ))
    return records


def _parse_savings_table(table) -> list[RateRecord]:
    """
    Parse the Savings Deposit Account table into RateRecord objects.
    Row 0 is the caption, row 1 is the column header, data starts at row 2.
    """
    records = []
    rows = table.find_all("tr")[2:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue

        english_label = _extract_english(cells[0].get_text(" ", strip=True))
        rate_match = _RATE_PATTERN.search(cells[1].get_text(" ", strip=True))
        if not rate_match:
            continue

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="savings",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            notes=english_label or None,
        ))
    return records


_PHRASE_RATE_PATTERN = re.compile(r"([A-Za-z0-9 ]+?)\s*:\s*(\d+(?:\.\d+)?)\s*%")


def _parse_personal_loan_table(table) -> list[RateRecord]:
    """
    Parse the Personal Loans table into RateRecord objects.

    Layout: one row per scheme (BOC Personal Loan Scheme / BOC Special
    Personal Loan Scheme), each a 2-cell row whose second cell concatenates
    every repayment-period tier as free text — e.g. "Upto 5 Years : 14.00%
    Above 5 Years and Upto 7 Years : 14.50% Above 7 years to 10 years:
    15.50%" — with no further table structure inside it, so each
    "<phrase> : <rate>%" tier is pulled out with a regex rather than
    walked cell by cell.
    """
    records = []
    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        scheme_label = _extract_english(cells[0].get_text(" ", strip=True))
        if not scheme_label:
            continue
        detail_text = cells[1].get_text(" ", strip=True)
        for phrase, rate in _PHRASE_RATE_PATTERN.findall(detail_text):
            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type="personal_loan",
                interest_rate=float(rate),
                source_url=RATES_URL,
                notes=f"{scheme_label}: {phrase.strip()}",
            ))
    return records


_TENURE_RATE_PATTERN = re.compile(r"(\d+)\s*Years?\s+(\d+(?:\.\d+)?)\s*%", re.IGNORECASE)


def _parse_education_loan_table(table) -> list[RateRecord]:
    """
    Parse the Educational Loans table into RateRecord objects.

    Layout: caption row, then one row per scheme (e.g. "BOC Comprehensive
    Educational Loan") whose second cell repeats, once per tenure tier, a
    Sinhala + Tamil + English block ending in "Up to N Years R.RR% p.a."
    Unlike Personal Loans' single English-only blob, these per-tier
    language blocks are interleaved (tier 1's Sinhala/Tamil/English, then
    tier 2's), so _extract_english (which only keeps the trailing ASCII
    run) would silently drop every tier but the last. The tenure+rate
    pairs are instead pulled directly off the raw cell text with a regex
    that only matches the ASCII digits/words, skipping over the Sinhala/
    Tamil in between rather than trying to isolate "the" English segment.
    """
    records = []
    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        scheme_label = _extract_english(cells[0].get_text(" ", strip=True))
        if not scheme_label:
            continue
        raw_text = cells[1].get_text(" ", strip=True)
        for years, rate in _TENURE_RATE_PATTERN.findall(raw_text):
            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type="education_loan",
                interest_rate=float(rate),
                source_url=RATES_URL,
                tenure_months=int(years) * 12,
                notes=scheme_label,
            ))
    return records


def _parse_housing_loan_table(table) -> list[RateRecord]:
    """
    Parse the Housing Loans table into RateRecord objects.

    Layout: header row (S/N | Type/Eligible Amount | Repayment Period |
    ROI (p.a.) Fixed), then data rows of two shapes:
      - 1-cell rows are an informational tier separator (e.g. "If aggregate
        Housing Loan amount is up to Rs. 5.0 Mn") and carry no rate of
        their own — skipped.
      - 4-cell rows (S/N, type label, repayment period, rate) introduce a
        new loan type; 2-cell rows (repayment period, rate) are a further
        repayment-period tier of that same loan type, so the type label is
        carried forward rather than repeated.
    """
    records = []
    rows = table.find_all("tr")[1:]
    current_type = None
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) == 1:
            continue  # informational tier separator, no rate
        if len(cells) == 4:
            current_type = _extract_english(cells[1].get_text(" ", strip=True))
            period_label = _extract_english(cells[2].get_text(" ", strip=True))
            rate_match = _RATE_PATTERN.search(_extract_english(cells[3].get_text(" ", strip=True)))
        elif len(cells) == 2:
            period_label = _extract_english(cells[0].get_text(" ", strip=True))
            rate_match = _RATE_PATTERN.search(_extract_english(cells[1].get_text(" ", strip=True)))
        else:
            continue
        if not rate_match:
            continue
        notes = f"{current_type}: {period_label}" if current_type else (period_label or None)

        tenure_match = _TENURE_PATTERN.search(period_label)
        tenure_months = int(tenure_match.group(1)) * 12 if tenure_match else None

        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="housing_loan",
            interest_rate=float(rate_match.group(1)),
            source_url=RATES_URL,
            tenure_months=tenure_months,
            notes=notes,
        ))
    return records


def _parse_leasing_table(table) -> list[RateRecord]:
    """
    Parse the Leasing table into RateRecord objects.

    Layout: header row (Loan/Asset Type | Min Rate (% p.a.) | Max Rate (%)),
    then one row per asset type — no separate caption row (see
    _find_table_after_heading). Both the minimum and maximum published
    rate are scraped as separate records (rather than averaging) since
    both are genuine published numbers.
    """
    records = []
    rows = table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        asset_label = _extract_english(cells[0].get_text(" ", strip=True))
        if not asset_label:
            continue

        min_match = _RATE_PATTERN.search(_extract_english(cells[1].get_text(" ", strip=True)))
        max_match = _RATE_PATTERN.search(_extract_english(cells[2].get_text(" ", strip=True)))

        if min_match:
            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type="leasing",
                interest_rate=float(min_match.group(1)),
                source_url=RATES_URL,
                notes=f"{asset_label} (minimum rate)",
            ))
        if max_match and (not min_match or max_match.group(1) != min_match.group(1)):
            records.append(RateRecord(
                bank_code=BANK_CODE,
                product_type="leasing",
                interest_rate=float(max_match.group(1)),
                source_url=RATES_URL,
                notes=f"{asset_label} (maximum rate)",
            ))
    return records


def _parse_pawning_table(table) -> list[RateRecord]:
    """
    Parse the Ran Surekum Naya Seva (gold loan/pawning) table into
    RateRecord objects. Layout: header row (blank | Interest Rate (p.a.)),
    then data rows — no separate caption row (see _find_table_after_heading).
    """
    records = []
    rows = table.find_all("tr")[1:]
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue

        label = _extract_english(cells[0].get_text(" ", strip=True))
        rate_match = _RATE_PATTERN.search(_extract_english(cells[1].get_text(" ", strip=True)))
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
    Fetch and parse BOC's published interest rates.

    Returns:
        A list of RateRecord objects covering Rupee Fixed Deposit tenures,
        Savings Deposit Account tiers, BOC Personal Loan Scheme (standard
        and special), Housing Loans, Leasing, Educational Loans, Ran
        Surekum Naya Seva (pawning), and the Credit Card interest rate.
        Returns an empty list if the page is disallowed by robots.txt.
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

    personal_loan_table = _find_table_after_heading(soup, "Personal Loans")
    if personal_loan_table is not None:
        records.extend(_parse_personal_loan_table(personal_loan_table))

    housing_loan_table = _find_table_after_heading(soup, "Housing Loans")
    if housing_loan_table is not None:
        records.extend(_parse_housing_loan_table(housing_loan_table))

    leasing_table = _find_table_after_heading(soup, "Leasing")
    if leasing_table is not None:
        records.extend(_parse_leasing_table(leasing_table))

    education_loan_table = _find_table_by_caption(soup, "educational loan")
    if education_loan_table is not None:
        records.extend(_parse_education_loan_table(education_loan_table))

    pawning_table = _find_table_after_heading(soup, "Ran Surekum Naya Seva")
    if pawning_table is not None:
        records.extend(_parse_pawning_table(pawning_table))

    card_rate = _find_credit_card_rate(soup)
    if card_rate is not None:
        interest_rate, label = card_rate
        records.append(RateRecord(
            bank_code=BANK_CODE,
            product_type="card",
            interest_rate=interest_rate,
            source_url=RATES_URL,
            notes=label or None,
        ))

    return records
