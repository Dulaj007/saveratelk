"""
config.py

Central configuration for the SaveRateLK scraper service.

Holds environment-driven database settings, the HTTP request policy
(User-Agent, timeouts, inter-request delay), and sanity bounds used by
the validator to reject obviously misparsed financial values.

All values that differ between environments (dev vs. production) are
loaded from environment variables, with safe defaults for local development.
"""

import os
from dotenv import load_dotenv

load_dotenv()


# =============================================================================
# Database
#
# A single connection string (Neon, or any standard Postgres) rather than
# discrete host/port/etc. psycopg2 accepts a full DSN directly, and
# Neon's connection string already carries sslmode=require.
# =============================================================================

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy .env.example to .env and fill in your Neon connection string."
    )


# =============================================================================
# HTTP request policy
# =============================================================================

# Identifies the scraper honestly to bank servers and gives a contact point.
USER_AGENT = "SaveRateLK rate tracker (https://saveratelk.cloud; contact@saveratelk.cloud)"

# Seconds to wait for a response before aborting.
REQUEST_TIMEOUT = 20

# Seconds to sleep between consecutive HTTP requests to the same domain.
# Keeps the scraper gentle and avoids triggering rate-limiting.
REQUEST_DELAY = 3

# Maximum number of retries on transient network errors (5xx, timeout).
MAX_RETRIES = 3

# Seconds to wait before each retry attempt.
RETRY_BACKOFF = 5


# =============================================================================
# Rate sanity bounds
# Any scraped rate outside these inclusive ranges is rejected and logged.
# Bounds are intentionally wide to accommodate unusual but valid promotions
# while still catching clear parsing errors (e.g. "1200%" or "-5%").
# =============================================================================

RATE_BOUNDS = {
    "fd":             (0.0, 35.0),   # fixed deposit interest rate %
    "savings":        (0.0, 35.0),   # savings account interest rate %
    "card":           (0.0, 60.0),   # credit card rate % (higher ceiling)
    "profit":         (0.0, 35.0),   # Islamic profit-sharing rate %
    "housing_loan":   (5.0, 30.0),   # housing loan interest rate %
    "personal_loan":  (5.0, 40.0),   # personal loan interest rate %
    "leasing":        (5.0, 35.0),   # leasing / vehicle loan interest rate %
    "education_loan": (5.0, 30.0),   # education loan interest rate %
    "pawning":        (5.0, 30.0),   # pawning / gold loan interest rate %
    "overdraft":      (5.0, 40.0),   # overdraft (OD) interest rate %
}


# =============================================================================
# Selenium settings (for JS-rendered bank pages)
# =============================================================================

# Seconds to wait for a JavaScript-rendered element before timing out.
SELENIUM_WAIT_TIMEOUT = 30

# Run Chrome in headless mode (no visible browser window).
SELENIUM_HEADLESS = True


# =============================================================================
# Scrape scheduling and retry policy
#
# The site is an information board, not a live tool: it's designed to
# pull fresh data once a day (every SCRAPE_INTERVAL_HOURS, via the
# scheduled GitHub Actions workflow, see ../.github/workflows/scrape.yml),
# never on a page view. The web app only ever reads whatever the last
# successful scrape stored, and shows that row's timestamp as "last
# updated". Pages are also ISR-cached for SCRAPE_INTERVAL_HOURS worth of
# seconds (see each page's `revalidate` export in web/), so a normal
# request never touches the database at all, let alone re-scrapes.
#
# When a bank fails during the scheduled run, it is NOT retried inline.
# The run continues immediately to the next bank, and the UI keeps
# showing that bank's last successfully stored rates. Instead, exactly one
# follow-up attempt is scheduled RETRY_DELAY_MINUTES later, handled by the
# workflow's second scheduled trigger (which runs retry_failed.py instead
# of main.py) so the main run never blocks waiting on it. If that single
# follow-up also fails, no further retry is scheduled. The bank simply
# waits for the next normal SCRAPE_INTERVAL_HOURS cycle, still showing its
# last known data the whole time.
# =============================================================================

# Hours between scheduled scrape runs (the cron schedule in
# .github/workflows/scrape.yml should match this).
SCRAPE_INTERVAL_HOURS = 24

# Minutes to wait before the single one-off retry of a bank that failed in
# the main scheduled run (the workflow's second cron trigger should be
# offset from the first by at least this many minutes).
RETRY_DELAY_MINUTES = 20
