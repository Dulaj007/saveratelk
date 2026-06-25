"""
banks/__init__.py

Registry of active bank scraper modules.

Each entry maps a bank's short code (matching banks.code in the database) to
the scrape() function exported by that bank's module. The orchestrator in
main.py imports SCRAPERS and iterates it to run every active scraper.

To add a new bank: implement a module in this directory with a scrape()
function that returns list[RateRecord], then add it here.
"""

from banks import (
    hnb, commercial, boc, seylan, nsb, panasia, ndb, nationstrust,
    peoples, dfcc, sampath,
)

SCRAPERS: dict = {
    "hnb":          hnb.scrape,
    "commercial":   commercial.scrape,
    "boc":          boc.scrape,
    "seylan":       seylan.scrape,
    "nsb":          nsb.scrape,
    "panasia":      panasia.scrape,
    "ndb":          ndb.scrape,
    "nationstrust": nationstrust.scrape,
    "peoples":      peoples.scrape,
    "dfcc":         dfcc.scrape,
    "sampath":      sampath.scrape,
}
