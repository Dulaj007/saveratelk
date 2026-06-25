"""
init_db.py

Database initialisation script for SaveRateLK.

Applies db/schema.sql to create all tables, then runs db/seed_banks.sql to
insert the initial bank registry. Safe to run multiple times: schema uses
IF NOT EXISTS, seed uses ON CONFLICT DO NOTHING.

Usage:
    python init_db.py

Expects the same DATABASE_URL environment variable as config.py.

Run this once on a fresh database before the first scraper run.
"""

import os
import sys
import logging
import psycopg2

from config import DATABASE_URL

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Paths to the SQL files, relative to the repo root.
REPO_ROOT  = os.path.join(os.path.dirname(__file__), "..")
SCHEMA_SQL = os.path.join(REPO_ROOT, "db", "schema.sql")
SEED_SQL   = os.path.join(REPO_ROOT, "db", "seed_banks.sql")


def read_sql(path: str) -> str:
    """
    Read and return the contents of a SQL file.

    Args:
        path – Absolute or relative path to the .sql file.

    Returns:
        The SQL text as a string.
    """
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def run_sql(conn, sql: str, label: str) -> None:
    """
    Execute a SQL string against conn and commit the transaction.

    Args:
        conn  – Open psycopg2 connection.
        sql   – SQL to execute (may contain multiple statements).
        label – Human-readable name for logging (e.g. "schema").
    """
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    logger.info("Applied %s.", label)


def verify(conn) -> None:
    """
    Print a summary of what was created to confirm the init succeeded.

    Queries the tables and row counts so the operator can visually confirm
    the schema and seed data are present before running the scraper.
    """
    checks = [
        ("banks",            "SELECT COUNT(*) FROM banks"),
        ("rates",            "SELECT COUNT(*) FROM rates"),
        ("cbsl_benchmarks",  "SELECT COUNT(*) FROM cbsl_benchmarks"),
        ("scrape_runs",      "SELECT COUNT(*) FROM scrape_runs"),
    ]
    with conn.cursor() as cur:
        for table, query in checks:
            cur.execute(query)
            count = cur.fetchone()[0]
            logger.info("  %-20s %d row(s)", table, count)


def main() -> None:
    """
    Connect to PostgreSQL, apply schema, load seed data, and verify.
    """
    logger.info("Connecting to database ...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
    except psycopg2.OperationalError as exc:
        logger.error("Could not connect to the database: %s", exc)
        sys.exit(1)

    try:
        logger.info("Applying schema ...")
        run_sql(conn, read_sql(SCHEMA_SQL), "schema")

        logger.info("Loading seed data ...")
        run_sql(conn, read_sql(SEED_SQL), "seed_banks")

        logger.info("Verification:")
        verify(conn)

        logger.info("Database initialised successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
