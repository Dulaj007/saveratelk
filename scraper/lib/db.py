"""
lib/db.py

Database connection and write helpers for the SaveRateLK scraper.

Provides a single persistent connection (get_connection) and the insert/
lookup helpers used by the orchestrator and the retry job:

  insert_rate()          – writes a validated RateRecord into the rates table.
  insert_cbsl()           – writes a CBSL benchmark value.
  insert_scrape_run()     – writes an operational log row for monitoring.
  get_bank_id/get_bank_code – look up a bank by code or by id, in either direction.
  *_pending_retry / get_due_retries – manage the one-shot retry queue
      (see db/schema.sql's pending_retries table for the retry policy).

All inserts are committed immediately so a crash mid-run does not roll back
already-stored records. The connection is opened lazily on first use and
reused for the lifetime of the scrape process.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import psycopg2
from psycopg2.extensions import connection as PgConnection

from config import DATABASE_URL
from lib.models import RateRecord

logger = logging.getLogger(__name__)

_conn: Optional[PgConnection] = None


def get_connection() -> PgConnection:
    """
    Return a live psycopg2 connection, opening one if needed.

    Reuses the module-level connection across calls within the same process.
    If the connection has been closed or dropped, opens a fresh one.

    Returns:
        An open psycopg2 connection to the configured PostgreSQL database.
    """
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg2.connect(DATABASE_URL)
        logger.info("Opened database connection.")
    return _conn


def insert_rate(record: RateRecord, bank_id: int) -> None:
    """
    Insert a single validated RateRecord into the rates table.

    Args:
        record  – A RateRecord that has already passed validate().
        bank_id – The integer PK of the corresponding row in the banks table.
    """
    sql = """
        INSERT INTO rates (
            bank_id, product_type, tenure_months, interest_rate,
            annual_effective_rate, min_deposit, interest_payment,
            notes, source_url, scraped_at, effective_date
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(sql, (
            bank_id,
            record.product_type,
            record.tenure_months,
            record.interest_rate,
            record.annual_effective_rate,
            record.min_deposit,
            record.interest_payment,
            record.notes,
            record.source_url,
            record.scraped_at,
            record.effective_date,
        ))
    conn.commit()


def insert_cbsl(
    indicator: str,
    value: float,
    period: Optional[str],
    source_url: str,
    scraped_at: Optional[datetime] = None,
) -> None:
    """
    Insert one CBSL benchmark value into the cbsl_benchmarks table.

    Args:
        indicator  – One of: "awdr", "awfdr", "policy_rate", "deposit_cap".
        value      – The numeric rate value as a percentage.
        period     – Period string from CBSL (e.g. "2025-04"). May be None.
        source_url – URL of the CBSL statistics page the value was read from.
        scraped_at – Collection timestamp; defaults to UTC now if omitted.
    """
    if scraped_at is None:
        scraped_at = datetime.now(timezone.utc)

    sql = """
        INSERT INTO cbsl_benchmarks (indicator, value, period, source_url, scraped_at)
        VALUES (%s, %s, %s, %s, %s)
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(sql, (indicator, value, period, source_url, scraped_at))
    conn.commit()


def existing_cbsl_periods(indicator: str) -> set[str]:
    """
    Return every distinct, non-null `period` already stored for `indicator`.

    Used by the CBSL historical backfill to skip periods it has already
    inserted, so re-running the backfill (or running it after a regular
    collect() has already stored the latest month) never creates duplicate
    rows for the same indicator/period pair.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT period FROM cbsl_benchmarks WHERE indicator = %s", (indicator,))
        return {row[0] for row in cur.fetchall() if row[0] is not None}


def insert_scrape_run(
    bank_id: Optional[int],
    status: str,
    records_found: int,
    error_message: Optional[str],
    started_at: datetime,
    finished_at: datetime,
) -> None:
    """
    Insert one operational log row into the scrape_runs table.

    Args:
        bank_id       – FK to banks.id; None for the CBSL source run.
        status        – "ok", "failed", or "skipped".
        records_found – Count of rate records successfully stored.
        error_message – Exception detail if status is "failed"; else None.
        started_at    – UTC timestamp when the scrape attempt began.
        finished_at   – UTC timestamp when it completed or failed.
    """
    sql = """
        INSERT INTO scrape_runs (
            bank_id, status, records_found, error_message, started_at, finished_at
        ) VALUES (%s, %s, %s, %s, %s, %s)
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(sql, (bank_id, status, records_found, error_message, started_at, finished_at))
    conn.commit()


def get_bank_id(code: str) -> Optional[int]:
    """
    Look up the integer PK for a bank by its short code.

    Args:
        code – The bank's short identifier (e.g. "hnb").

    Returns:
        The banks.id integer, or None if no active bank with that code exists.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM banks WHERE code = %s AND is_active = TRUE", (code,))
        row = cur.fetchone()
    return row[0] if row else None


def get_bank_code(bank_id: int) -> Optional[str]:
    """
    Look up a bank's short code by its integer PK. The inverse of
    get_bank_id(), used by the retry queue to turn a stored bank_id back
    into something that can be looked up in the SCRAPERS registry.

    Args:
        bank_id – The banks.id integer.

    Returns:
        The bank's short code, or None if no such bank exists.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT code FROM banks WHERE id = %s", (bank_id,))
        row = cur.fetchone()
    return row[0] if row else None


def has_pending_retry(bank_id: Optional[int]) -> bool:
    """
    Return True if a retry is already queued for bank_id (or for the CBSL
    collector, when bank_id is None), so a second one is never scheduled
    on top of it.

    Args:
        bank_id – FK to banks.id, or None for the CBSL collector.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        if bank_id is None:
            cur.execute("SELECT 1 FROM pending_retries WHERE bank_id IS NULL")
        else:
            cur.execute("SELECT 1 FROM pending_retries WHERE bank_id = %s", (bank_id,))
        return cur.fetchone() is not None


def insert_pending_retry(bank_id: Optional[int], retry_at: datetime) -> None:
    """
    Queue a one-shot retry for bank_id (or the CBSL collector, when
    bank_id is None) at retry_at.

    Args:
        bank_id  – FK to banks.id, or None for the CBSL collector.
        retry_at – UTC timestamp when the retry should run.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO pending_retries (bank_id, retry_at) VALUES (%s, %s)",
            (bank_id, retry_at),
        )
    conn.commit()


def get_due_retries(now: datetime) -> list[tuple[int, Optional[int]]]:
    """
    Return (id, bank_id) for every pending_retries row whose retry_at has
    arrived, oldest first.

    Args:
        now – The current UTC timestamp to compare retry_at against.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, bank_id FROM pending_retries WHERE retry_at <= %s ORDER BY retry_at",
            (now,),
        )
        return cur.fetchall()


def delete_pending_retry(retry_id: int) -> None:
    """
    Remove a pending_retries row by id. Called immediately before a retry
    is attempted, so the row is consumed exactly once regardless of
    whether the retry succeeds or fails.

    Args:
        retry_id – The pending_retries.id to delete.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM pending_retries WHERE id = %s", (retry_id,))
    conn.commit()
