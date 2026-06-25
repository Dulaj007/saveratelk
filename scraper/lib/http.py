"""
lib/http.py

HTTP fetch wrapper for the SaveRateLK scraper.

Enforces a consistent User-Agent, request timeout, inter-request delay,
and retry logic across all bank scraper modules. Every outbound HTTP request
in this project must go through fetch() so these policies are never bypassed.
"""

import time
import logging
import requests
from requests import Response

from config import USER_AGENT, REQUEST_TIMEOUT, REQUEST_DELAY, MAX_RETRIES, RETRY_BACKOFF

logger = logging.getLogger(__name__)


def fetch(url: str, *, delay: float = REQUEST_DELAY) -> Response:
    """
    Perform an HTTP GET to url and return the Response object.

    Applies the project User-Agent and timeout, sleeps delay seconds before
    the request (to be gentle on the target server), and retries on transient
    errors (5xx responses and connection/timeout exceptions) up to MAX_RETRIES
    times with RETRY_BACKOFF seconds between attempts.

    Raises requests.HTTPError if a non-5xx error status is returned after all
    retries are exhausted, or re-raises the last network exception.

    Args:
        url   – The full URL to fetch.
        delay – Seconds to sleep before issuing the request (default from config).

    Returns:
        A requests.Response with raise_for_status() already called.
    """

    headers = {"User-Agent": USER_AGENT}
    last_exception: Exception | None = None

    for attempt in range(1, MAX_RETRIES + 1):
        time.sleep(delay)
        try:
            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)

            # Retry on server-side errors; raise immediately on client errors.
            if response.status_code >= 500:
                logger.warning(
                    "Server error %s on %s (attempt %d/%d)",
                    response.status_code, url, attempt, MAX_RETRIES,
                )
                last_exception = requests.HTTPError(response=response)
                time.sleep(RETRY_BACKOFF)
                continue

            response.raise_for_status()
            return response

        except (requests.ConnectionError, requests.Timeout) as exc:
            logger.warning(
                "Network error on %s (attempt %d/%d): %s",
                url, attempt, MAX_RETRIES, exc,
            )
            last_exception = exc
            time.sleep(RETRY_BACKOFF)

    # All retries exhausted.
    logger.error("Failed to fetch %s after %d attempts.", url, MAX_RETRIES)
    raise last_exception
