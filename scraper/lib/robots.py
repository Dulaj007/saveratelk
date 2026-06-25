"""
lib/robots.py

Robots.txt fetching and path-allowance checking.

Before scraping any bank page the orchestrator calls is_allowed() to confirm
the path is not disallowed for automated crawlers. Sites that block all bots
(e.g. HDFC) are excluded from the bank registry entirely, but this module
acts as a runtime safety net for any future additions.

Uses Python's built-in urllib.robotparser so no extra dependency is needed.
"""

import logging
import requests
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

from config import USER_AGENT, REQUEST_TIMEOUT

logger = logging.getLogger(__name__)

# Cache parsed robots.txt files by origin (scheme + host) to avoid
# re-fetching the same file for every URL on the same domain.
_cache: dict[str, RobotFileParser] = {}


def _get_parser(url: str) -> RobotFileParser | None:
    """
    Return a parsed RobotFileParser for the origin of url, using an
    in-process cache. Returns None if the robots.txt cannot be fetched
    (network error, 404, etc.), in which case the caller should allow access
    (standard convention: no robots.txt means no restrictions).

    Fetches robots.txt with our own honest User-Agent rather than relying on
    RobotFileParser.read(), which sends Python's generic urllib User-Agent.
    Some bank sites run bot-protection (e.g. CloudFront WAF) that 403s
    unrecognised User-Agents on every path, including /robots.txt, which
    would otherwise cause RobotFileParser to wrongly assume "disallow all".

    Args:
        url – Any URL on the target domain.

    Returns:
        A ready RobotFileParser, or None on fetch failure.
    """
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    if origin in _cache:
        return _cache[origin]

    robots_url = f"{origin}/robots.txt"
    parser = RobotFileParser(robots_url)
    try:
        response = requests.get(
            robots_url,
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        if response.status_code >= 400:
            # No robots.txt (or inaccessible): permissive default.
            logger.info("No robots.txt at %s (status %d); allowing access.",
                        robots_url, response.status_code)
            return None
        parser.parse(response.text.splitlines())
        _cache[origin] = parser
        return parser
    except requests.RequestException as exc:
        logger.warning("Could not fetch robots.txt from %s: %s", robots_url, exc)
        return None


def is_allowed(url: str) -> bool:
    """
    Return True if the SaveRateLK User-Agent is allowed to fetch url
    according to that domain's robots.txt, False if explicitly disallowed.

    When robots.txt is unreachable or absent, returns True (permissive
    default in line with the robots.txt specification).

    Args:
        url – The full URL the scraper wants to fetch.

    Returns:
        True  – scraping is permitted.
        False – scraping is disallowed; caller must skip this URL.
    """
    parser = _get_parser(url)
    if parser is None:
        return True

    allowed = parser.can_fetch(USER_AGENT, url)
    if not allowed:
        logger.warning("robots.txt disallows access to %s, skipping.", url)
    return allowed
