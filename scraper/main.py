"""
main.py

Orchestrator for the SaveRateLK scraper service.

Entry point for the scheduled GitHub Actions workflow (see
../.github/workflows/scrape.yml). Iterates every active bank in the
SCRAPERS registry, runs each bank's scrape() function inside an isolated
try/except so one broken bank never aborts the rest, validates results,
stores them in PostgreSQL (Neon), and records a scrape_runs row per bank
for operational monitoring.

After all banks are processed, runs the CBSL benchmark collector.

Scheduling model: this script is meant to run once every
config.SCRAPE_INTERVAL_HOURS (24 hours by default), not continuously and
not on every page view — the web app only ever reads whatever the last
successful run stored, and displays that row's timestamp as "last
updated"; pages are also ISR-cached for that same window, so most
requests never even reach the database. Run it once manually right after
first setting up the database (so it isn't empty before the first
scheduled workflow run), then let the workflow take over.

Failure handling: a bank that fails during this run is NOT retried inline.
The run continues immediately to the next bank — old data for the failed
bank just keeps showing in the UI — and exactly one follow-up attempt is
queued config.RETRY_DELAY_MINUTES later via the pending_retries table,
picked up by the workflow's second scheduled trigger, which runs
retry_failed.py instead of this script (see that script for why the retry
is deliberately a separate run rather than a blocking sleep here). If the
follow-up retry also fails, no further retry is queued; the bank simply
waits for the next normal scheduled run.

Usage:
    python main.py

Safe to run manually at any time in addition to its scheduled runs. All
inserts are additive (history accumulates); no data is updated or deleted.

Full setup (GitHub Actions workflow, secrets, environment variables) is
documented in the project README.
"""

import logging
import sys
from datetime import datetime, timedelta, timezone

from banks import SCRAPERS
from config import RETRY_DELAY_MINUTES
from lib.db import get_bank_id, has_pending_retry, insert_pending_retry, insert_rate, insert_scrape_run
from lib.validate import filter_valid
from sources import cbsl

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("scraper.log"),
    ],
)
logger = logging.getLogger("main")


def _schedule_retry(bank_id: int | None) -> None:
    """
    Queue exactly one follow-up attempt for bank_id (or the CBSL collector,
    when bank_id is None) config.RETRY_DELAY_MINUTES from now, unless one
    is already queued.

    Args:
        bank_id – FK to banks.id, or None for the CBSL collector.
    """
    if has_pending_retry(bank_id):
        return
    retry_at = datetime.now(timezone.utc) + timedelta(minutes=RETRY_DELAY_MINUTES)
    insert_pending_retry(bank_id, retry_at)
    logger.info("Queued a retry for bank_id=%s at %s.", bank_id, retry_at.isoformat())


def run_bank(code: str, scrape_fn, allow_retry_scheduling: bool = True) -> None:
    """
    Execute one bank's scraper, validate results, and store them.

    Wraps the full scrape-validate-store cycle in a try/except so that any
    failure (network error, changed HTML, parse error, DB error) is caught,
    logged, and recorded in scrape_runs without affecting other banks.

    Args:
        code     – Bank short code, e.g. "hnb". Must match a row in banks.
        scrape_fn – The scrape() callable imported from the bank's module.
        allow_retry_scheduling – If True (the main scheduled run), a failure
            queues a one-shot retry. retry_failed.py passes False here so a
            second failed attempt does not queue yet another retry.
    """
    started_at = datetime.now(timezone.utc)
    bank_id = get_bank_id(code)

    if bank_id is None:
        logger.warning("Bank code %r not found in database or is inactive — skipping.", code)
        return

    logger.info("--- Starting scrape for %s ---", code.upper())

    try:
        raw_records = scrape_fn()
        valid_records, rejected = filter_valid(raw_records)

        for record in valid_records:
            insert_rate(record, bank_id)

        finished_at = datetime.now(timezone.utc)
        insert_scrape_run(
            bank_id=bank_id,
            status="ok",
            records_found=len(valid_records),
            error_message=None,
            started_at=started_at,
            finished_at=finished_at,
        )
        logger.info(
            "%s: stored %d record(s), rejected %d.",
            code.upper(), len(valid_records), rejected,
        )

    except Exception as exc:
        finished_at = datetime.now(timezone.utc)
        logger.error("Scrape failed for %s: %s", code.upper(), exc, exc_info=True)
        insert_scrape_run(
            bank_id=bank_id,
            status="failed",
            records_found=0,
            error_message=str(exc),
            started_at=started_at,
            finished_at=finished_at,
        )
        if allow_retry_scheduling:
            _schedule_retry(bank_id)


def run_cbsl(allow_retry_scheduling: bool = True) -> None:
    """
    Run the CBSL benchmark collector, logging any failure without propagating it.

    Records a scrape_runs row with bank_id=NULL, matching the per-bank
    logging in run_bank(), so CBSL collection failures show up in the same
    operational log used for monitoring.

    Args:
        allow_retry_scheduling – See run_bank(); same one-shot retry policy.
    """
    logger.info("--- Starting CBSL benchmark collection ---")
    started_at = datetime.now(timezone.utc)

    try:
        records_found = cbsl.collect()
        finished_at = datetime.now(timezone.utc)
        insert_scrape_run(
            bank_id=None,
            status="ok",
            records_found=records_found,
            error_message=None,
            started_at=started_at,
            finished_at=finished_at,
        )
        logger.info("CBSL collection complete: %d indicator(s) stored.", records_found)
    except Exception as exc:
        finished_at = datetime.now(timezone.utc)
        logger.error("CBSL collection failed: %s", exc, exc_info=True)
        insert_scrape_run(
            bank_id=None,
            status="failed",
            records_found=0,
            error_message=str(exc),
            started_at=started_at,
            finished_at=finished_at,
        )
        if allow_retry_scheduling:
            _schedule_retry(None)


def main() -> None:
    """
    Run all active bank scrapers followed by the CBSL collector.
    """
    logger.info("========== SaveRateLK scrape run started ==========")

    for code, scrape_fn in SCRAPERS.items():
        run_bank(code, scrape_fn)

    run_cbsl()

    logger.info("========== Scrape run complete ==========")


if __name__ == "__main__":
    main()
