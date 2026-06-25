/**
 * lib/db.ts
 *
 * Database read layer for the SaveRateLK Next.js application.
 *
 * Provides typed query helpers that the page components use to read current
 * rates, rate history, and CBSL benchmarks from PostgreSQL. This module is
 * server-only: all queries run inside Next.js Server Components or Route
 * Handlers, never in the browser.
 *
 * "Current" rates = the most recent scraped_at row per bank/product/tenure.
 * History = all rows for a given bank/product/tenure ordered by scraped_at.
 *
 * Connects to Neon (or any standard Postgres) via a single DATABASE_URL
 * rather than discrete DB_HOST/PORT/etc. Neon requires SSL, hence the
 * explicit `ssl` option (Neon's certs validate fine under the default
 * strict `rejectUnauthorized: true`, no need to relax it). `max` is kept
 * small since most pages are ISR-cached (see each page's `revalidate`
 * export); actual concurrent DB-hitting requests are rare, just the
 * occasional background revalidation, not every visitor.
 */

import { Pool } from "pg";
import { ProductType } from "./productTypes";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Neon connection string.");
}

/** Shared connection pool, created once per process. */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 5,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Bank {
  id:            number;
  code:          string;
  name:          string;
  website_url:   string;
  rates_page_url: string;
}

export interface RateRow {
  bank_code:       string;
  bank_name:       string;
  rates_page_url:  string;
  product_type:    ProductType;
  tenure_months:   number | null;
  interest_rate:   number;
  annual_effective_rate: number | null;
  min_deposit:     number | null;
  interest_payment: string | null;
  notes:           string | null;
  source_url:      string;
  scraped_at:      Date;
}

export interface CbslBenchmark {
  indicator:  string;
  value:      number;
  period:     string | null;
  source_url: string;
  scraped_at: Date;
}

export interface HistoryRow {
  bank_code:        string;
  bank_name:        string;
  product_type:     ProductType;
  tenure_months:    number | null;
  interest_payment: string | null;
  notes:            string | null;
  interest_rate:    number;
  scraped_at:       Date;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Return the most recent rate row per distinct product variant for every
 * active bank, optionally filtered to a specific product_type ("fd" |
 * "savings").
 *
 * "Distinct variant" is (bank_id, tenure_months, interest_payment, notes)
 * rather than just (bank_id, tenure_months): a bank's FD rows can share a
 * tenure but differ by payment frequency (e.g. 12-month paid monthly vs.
 * at maturity), and every savings row shares the same NULL tenure_months
 * but represents a different named product (e.g. "Ordinary Savings" vs.
 * "Senior Citizens Savings"). Deduping on tenure alone would silently
 * collapse all of those into a single row.
 */
export async function getCurrentRates(
  productType: ProductType = "fd"
): Promise<RateRow[]> {
  const { rows } = await pool.query<RateRow>(
    `
    SELECT DISTINCT ON (r.bank_id, r.tenure_months, r.interest_payment, r.notes)
      b.code           AS bank_code,
      b.name           AS bank_name,
      b.rates_page_url,
      r.product_type,
      r.tenure_months,
      r.interest_rate,
      r.annual_effective_rate,
      r.min_deposit,
      r.interest_payment,
      r.notes,
      r.source_url,
      r.scraped_at
    FROM rates r
    JOIN banks b ON b.id = r.bank_id
    WHERE r.product_type = $1
      AND b.is_active = TRUE
    ORDER BY r.bank_id, r.tenure_months, r.interest_payment, r.notes, r.scraped_at DESC
    `,
    [productType]
  );
  return rows;
}

/**
 * Return all active banks.
 */
export async function getBanks(): Promise<Bank[]> {
  const { rows } = await pool.query<Bank>(
    `SELECT id, code, name, website_url, rates_page_url
     FROM banks WHERE is_active = TRUE ORDER BY name`
  );
  return rows;
}

/**
 * Return the full rate history for a product type across every active
 * bank: every tenure, every payment frequency, every named savings
 * product, all in one query. Used to build the per-tenure/per-category
 * history charts shown inside each sub-tab, which need every bank's
 * trend line at once rather than one bank at a time (see lib/history.ts
 * for how this flat row list gets pivoted into per-bank chart series).
 */
export async function getRateHistoryAll(productType: ProductType): Promise<HistoryRow[]> {
  const { rows } = await pool.query<HistoryRow>(
    `
    SELECT
      b.code AS bank_code,
      b.name AS bank_name,
      r.product_type,
      r.tenure_months,
      r.interest_payment,
      r.notes,
      r.interest_rate,
      r.scraped_at
    FROM rates r
    JOIN banks b ON b.id = r.bank_id
    WHERE r.product_type = $1
      AND b.is_active = TRUE
    ORDER BY r.scraped_at ASC
    `,
    [productType]
  );
  return rows;
}

/**
 * Return the latest value for each CBSL benchmark indicator.
 */
export async function getLatestBenchmarks(): Promise<CbslBenchmark[]> {
  const { rows } = await pool.query<CbslBenchmark>(
    `
    SELECT DISTINCT ON (indicator)
      indicator, value, period, source_url, scraped_at
    FROM cbsl_benchmarks
    ORDER BY indicator, scraped_at DESC
    `
  );
  return rows;
}
