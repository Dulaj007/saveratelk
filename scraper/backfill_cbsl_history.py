"""
backfill_cbsl_history.py

One-time historical load for CBSL benchmark indicators (AWDR, AWFDR,
policy rate). Not part of the regular cron schedule — main.py's run of
sources.cbsl.collect() only ever stores the latest month, by design, since
re-storing the full multi-year series every 6 hours would be pointless.
This script instead calls cbsl.backfill() once to pull every historical
month CBSL's own published spreadsheet already contains, giving the AWFDR/
AWDR charts real multi-year depth instead of only however many days the
regular scrape has been running.

Safe to re-run: backfill() skips any (indicator, period) already stored.

Usage:
    python backfill_cbsl_history.py
"""

import logging
import sys

from sources import cbsl

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("backfill_cbsl_history")


def main() -> None:
    logger.info("Backfilling CBSL benchmark history...")
    count = cbsl.backfill()
    logger.info("Done: %d indicator row(s) inserted.", count)


if __name__ == "__main__":
    main()
