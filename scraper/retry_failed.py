"""
retry_failed.py

Lightweight retry checker for the SaveRateLK scraper service.

Run once by the second scheduled trigger in ../.github/workflows/scrape.yml
— offset config.RETRY_DELAY_MINUTES after the main run's trigger — rather
than on its own frequent cron, since GitHub Actions bills per run rather
than per idle tick the way a VPS cron job doesn't. On a typical run it
finds nothing due (the main run usually succeeds for every bank) and just
queries an empty/near-empty pending_retries table, with no network
requests to any bank at all. It only ever scrapes a bank when that bank
actually has a due retry queued by main.py's run_bank()/run_cbsl() after a
failure in the main daily run.

This is deliberately a separate script rather than main.py sleeping for
RETRY_DELAY_MINUTES before retrying inline: a blocking sleep would tie up
the main run (and cost workflow minutes for no reason on the — common —
ticks where nothing failed), whereas a separate scheduled run can be
skipped/cheap independently.

Each due retry is consumed (deleted from pending_retries) before being
attempted, and is passed allow_retry_scheduling=False — so a second
failure here does not queue another retry. The bank's last successfully
stored rates keep showing in the UI either way; this script's only job is
to give a single bank that had one bad scrape a quick second chance before
falling back to waiting for the next normal run.

Usage:
    python retry_failed.py
"""

import logging
import sys
from datetime import datetime, timezone

from banks import SCRAPERS
from lib.db import delete_pending_retry, get_bank_code, get_due_retries
from main import run_bank, run_cbsl

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("retry.log"),
    ],
)
logger = logging.getLogger("retry_failed")


def main() -> None:
    """
    Process every pending_retries row whose retry_at has arrived.
    """
    due = get_due_retries(datetime.now(timezone.utc))
    if not due:
        return

    logger.info("========== Processing %d due retr%s ==========", len(due), "y" if len(due) == 1 else "ies")

    for retry_id, bank_id in due:
        delete_pending_retry(retry_id)

        if bank_id is None:
            logger.info("Retrying CBSL benchmark collection.")
            run_cbsl(allow_retry_scheduling=False)
            continue

        code = get_bank_code(bank_id)
        scrape_fn = SCRAPERS.get(code)
        if scrape_fn is None:
            logger.warning("Retry queued for bank_id=%s but code %r has no registered scraper.", bank_id, code)
            continue

        logger.info("Retrying %s.", code.upper())
        run_bank(code, scrape_fn, allow_retry_scheduling=False)

    logger.info("========== Retry pass complete ==========")


if __name__ == "__main__":
    main()
