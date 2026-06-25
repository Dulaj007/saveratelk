/*
 * schema.sql
 *
 * Defines all tables for SaveRateLK.
 *
 * Design principle: every rate collection is a new timestamped row, never
 * an update. This accumulates history so the UI can chart how rates change
 * over time. "Current" rates are always the most recent scraped_at per
 * bank/product/tenure combination.
 */

-- =============================================================================
-- banks
-- The registry of financial institutions tracked by the scraper.
-- is_active = false disables a bank without deleting its historical data.
-- =============================================================================
CREATE TABLE IF NOT EXISTS banks (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(20)  UNIQUE NOT NULL,   -- short identifier, e.g. "hnb"
    name          VARCHAR(120) NOT NULL,
    website_url   TEXT         NOT NULL,
    rates_page_url TEXT        NOT NULL,
    scrape_method VARCHAR(10)  NOT NULL            -- "html" | "js" | "pdf"
                  CHECK (scrape_method IN ('html', 'js', 'pdf')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- =============================================================================
-- rates
-- Every rate collected by the scraper, with a timestamp.
-- One row = one rate for one product/tenure at one point in time.
-- =============================================================================
CREATE TABLE IF NOT EXISTS rates (
    id                    SERIAL PRIMARY KEY,
    bank_id               INTEGER      NOT NULL REFERENCES banks(id),
    product_type          VARCHAR(20)  NOT NULL
                          CHECK (product_type IN (
                              'fd', 'savings', 'card', 'profit',
                              'housing_loan', 'personal_loan', 'leasing',
                              'education_loan', 'pawning', 'overdraft'
                          )),
    tenure_months         INTEGER,                -- NULL for savings / non-FD products
    interest_rate         NUMERIC(6,3) NOT NULL,  -- percentage, e.g. 12.500
    annual_effective_rate NUMERIC(6,3),           -- AER if published by the bank
    min_deposit           NUMERIC(18,2),          -- minimum deposit amount in LKR
    interest_payment      VARCHAR(60),            -- e.g. "monthly", "at-maturity"
    notes                 TEXT,                   -- extra conditions or tier info
    source_url            TEXT         NOT NULL,
    scraped_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    effective_date        DATE                    -- "w.e.f." date if stated by bank
);

CREATE INDEX IF NOT EXISTS idx_rates_bank_product_tenure
    ON rates (bank_id, product_type, tenure_months, scraped_at DESC);

-- =============================================================================
-- cbsl_benchmarks
-- Official CBSL indicator values, timestamped per collection run.
-- indicator: "awdr"        – Average Weighted Deposit Rate
--            "awfdr"       – Average Weighted Fixed Deposit Rate
--            "policy_rate" – CBSL Standing Deposit/Lending Facility Rate
--            "deposit_cap" – Maximum allowed deposit rate (legal cap)
-- =============================================================================
CREATE TABLE IF NOT EXISTS cbsl_benchmarks (
    id          SERIAL PRIMARY KEY,
    indicator   VARCHAR(20)  NOT NULL
                CHECK (indicator IN ('awdr', 'awfdr', 'policy_rate', 'deposit_cap')),
    value       NUMERIC(6,3) NOT NULL,
    period      TEXT,                            -- e.g. "2025-04" or "Q1 2025"
    source_url  TEXT         NOT NULL,
    scraped_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cbsl_indicator_scraped
    ON cbsl_benchmarks (indicator, scraped_at DESC);

-- =============================================================================
-- scrape_runs
-- Operational log: one row per bank per scrape attempt.
-- Used for monitoring and alerting when banks consistently fail.
-- bank_id is NULL for the CBSL source run.
-- =============================================================================
CREATE TABLE IF NOT EXISTS scrape_runs (
    id              SERIAL PRIMARY KEY,
    bank_id         INTEGER      REFERENCES banks(id),  -- NULL = CBSL run
    status          VARCHAR(10)  NOT NULL
                    CHECK (status IN ('ok', 'failed', 'skipped')),
    records_found   INTEGER      NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ  NOT NULL,
    finished_at     TIMESTAMPTZ  NOT NULL
);

-- =============================================================================
-- pending_retries
-- One-shot retry queue. When a bank (or the CBSL collector) fails during
-- the main scheduled run, a row is inserted here with retry_at set a fixed
-- delay into the future. A separate, lightweight cron job polls this table
-- frequently and re-attempts exactly that one bank when its retry_at
-- arrives, deleting the row whether the retry succeeds or fails. There is
-- no second retry; a repeat failure just waits for the next main run.
-- =============================================================================
CREATE TABLE IF NOT EXISTS pending_retries (
    id          SERIAL PRIMARY KEY,
    bank_id     INTEGER      REFERENCES banks(id),  -- NULL = CBSL
    retry_at    TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_retries_retry_at
    ON pending_retries (retry_at);
