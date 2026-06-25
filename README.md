# SaveRateLK

SaveRateLK collects fixed deposit, savings, loan, and credit card interest
rates from Sri Lanka's major banks and shows them side by side. It also
keeps a history of how each rate has moved over time, and benchmarks every
bank against the Central Bank of Sri Lanka's (CBSL) official national
averages.

Most bank rate pages in Sri Lanka show only today's number for one or two
account types, and only on that one bank's own site. SaveRateLK tracks
every major product type across eleven banks in one place, so a visitor
can see who actually pays the best rate today on a single page instead of
checking eleven different websites.

> Screenshot or demo GIF: add here once the production site is live.

## Why it works this way

Two decisions shape almost everything else in this README.

1. **It's an information board, not a live tool.** Bank interest rates
   don't change minute to minute. They change at most a few times a
   month. There is no reason to call a bank's website, or even query the
   database, on every visitor page view. So the scraper runs once a day,
   and every page is cached for a day too. A visitor almost never causes
   a database query. They are served whatever was generated the last
   time the cache expired.
2. **Stale data beats no data, and no data beats a broken page.** If a
   bank's site changes its layout and a scraper module breaks, that
   bank's page keeps showing its last successfully collected rates, with
   an honest "last updated" timestamp, instead of an error or a blank
   row. The rest of the site is unaffected.

Everything below (the append-only database design, the once-a-day
schedule, the one-shot retry, the page caching) exists to support these
two ideas.

## Architecture

```
 ┌────────────────┐ writes ┌──────────────┐  reads  ┌─────────────────────┐
 │ Python scraper  │ ─────► │  Neon        │ ◄────── │   Next.js app       │
 │ (GitHub Actions,│        │  (Postgres)  │         │ (Vercel, ISR-cached)│
 │  once daily)    │        │              │         │                     │
 └────────────────┘        └──────────────┘        └─────────────────────┘
```

The scraper and the web app never call each other directly. They only
communicate through the shared Postgres database. Each scrape run
*appends* new timestamped rows instead of overwriting anything, so the
"current rate" is simply the most recent row for a given bank, product,
tenure, and payment combination, and "history" is every row ever
collected for that combination. Nothing is ever deleted or updated in
place.

The web app never fetches anything from a bank's website itself. It only
reads whatever the scraper already stored, and shows that row's own
timestamp as "last updated." Pages are cached for 24 hours
(`revalidate = 86400`), so a normal visitor request doesn't reach the
database at all. It is served straight from Vercel's cache, and the
database is only queried once a day per page, when that cache expires.
See [Scheduling and retry behavior](#scheduling-and-retry-behavior) for
exactly how and when new data arrives.

## Tech stack

| Layer | Technology |
|---|---|
| Scraper | Python 3.11+, `requests` + `BeautifulSoup4` + `lxml` for static HTML, `selenium` + `webdriver-manager` for JavaScript-rendered sites, `pdfplumber` for PDF rate sheets, `openpyxl` for CBSL's published Excel statistics |
| Scheduler | GitHub Actions (`.github/workflows/scrape.yml`): scheduled `cron` triggers, once daily plus one offset retry pass |
| Database | Postgres, hosted on [Neon](https://neon.tech). Neon is serverless and scales to zero between requests, so there is no idle compute cost for a site that's read once a day |
| Database access (Python) | `psycopg2` |
| Web UI | Next.js 16 (App Router), TypeScript, and React, hosted on Vercel |
| UI styling | Tailwind CSS v4 |
| Charts | Recharts |
| Database access (Next.js) | `pg` (node-postgres), cached per page (`revalidate = 86400`) so most requests never reach the database |
| SEO image generation | `next/og` (`ImageResponse`). The favicon and Open Graph share image are rendered on demand from the site's own brand mark, not from static design files |

## Banks tracked

HNB, Commercial Bank, Bank of Ceylon, Seylan, NSB, Pan Asia, NDB, Nations
Trust Bank, People's Bank, DFCC Bank, and Sampath Bank, plus CBSL's AWDR,
AWFDR, and policy rate as the national benchmark.

HDFC is intentionally excluded (see [Data and ethics](#data-and-ethics)).
Amana Bank is excluded because it publishes profit-sharing rates, not
interest. The same section explains why that distinction matters enough
to exclude it rather than approximate it.

## Repository layout

```
saveratelk/
├── .github/workflows/   # scrape.yml: the daily scrape and offset retry, on GitHub Actions
├── db/
│   ├── schema.sql            # banks, rates, cbsl_benchmarks, scrape_runs, pending_retries
│   ├── seed_banks.sql         # the 11 tracked banks and their scrape method
│   └── migrations/             # schema changes applied after the initial release
├── scraper/                  # Python scraping service
│   ├── banks/                 # one module per bank, each a single scrape() function
│   ├── sources/                # cbsl.py: the CBSL benchmark collector
│   ├── lib/                   # shared http/robots/db/validate/models helpers
│   ├── main.py                # orchestrator, the entry point for the daily run
│   ├── retry_failed.py         # lightweight one-shot retry checker (offset run)
│   ├── backfill_cbsl_history.py  # one-time script to seed historical CBSL figures
│   └── init_db.py              # applies schema.sql and seed_banks.sql
├── web/                      # Next.js application
│   ├── app/                   # routes: / , /about , /bank/[code] , plus SEO routes
│   ├── components/             # one component per UI feature (see below)
│   └── lib/                    # database access and shared formatting/category helpers
└── deploy/                   # nginx.conf, systemd unit: the original VPS deployment,
                                # kept for reference only. See "Deployment" below for how
                                # the site is actually run today
```

## Local setup

### 1. Database

Create a free [Neon](https://neon.tech) project (or point at any standard
Postgres instance) and copy its connection string. Both the scraper and
the web app read it from the same `DATABASE_URL` environment variable, so
there is exactly one connection string to manage across both services.

```bash
cd scraper
cp .env.example .env        # paste your DATABASE_URL in
pip install -r requirements.txt
python init_db.py           # applies db/schema.sql and db/seed_banks.sql
```

`init_db.py` is safe to re-run. The schema uses `CREATE TABLE IF NOT
EXISTS` and the seed uses `ON CONFLICT DO NOTHING`, so running it twice
against the same database does nothing the second time.

### 2. Scraper

```bash
cd scraper
python main.py
```

This runs every active bank's scraper inside its own try/except block,
validates each result (`lib/validate.py` rejects an obviously wrong value
before it reaches the database), stores it, and logs a row to
`scrape_runs` per bank. It then runs the CBSL benchmark collector. Safe
to run repeatedly: every run adds new timestamped rows instead of
overwriting the previous ones. If a bank fails, run `python
retry_failed.py` a few minutes later to see the one-shot retry pick it
up (see [Scheduling and retry behavior](#scheduling-and-retry-behavior)).

### 3. Web app

```bash
cd web
cp .env.example .env.local  # same DATABASE_URL as the scraper's .env
npm install
npm run dev                 # http://localhost:3000
```

## Scheduling and retry behavior

The site is built around a fixed pull cadence, not live scraping on every
page view.

- **First run.** Right after setting up the database, run `python
  main.py` once by hand so the site isn't empty before the first
  scheduled workflow run.
- **Main run** (`main.py`, every `config.SCRAPE_INTERVAL_HOURS`, 24 hours
  by default, triggered by `.github/workflows/scrape.yml`). Scrapes
  every bank plus CBSL, validates each result, and stores it. The web
  app only ever reads what this run (or the retry job below) last
  stored. There is no on-demand fetching from a bank's site when a
  visitor loads a page, and the page itself is cached for the same 24
  hours, so most requests never query the database at all.
- **A bank failing** does not block or retry inline. The run moves on to
  the next bank right away, and that bank's page keeps showing whatever
  rates it last successfully collected, with their original "last
  updated" timestamp. Old data, clearly dated, beats no data or a stuck
  page.
- **One-shot retry** (`retry_failed.py`, run once by the workflow's
  second scheduled trigger, offset `config.RETRY_DELAY_MINUTES`, 20
  minutes by default, after the main run). A bank that failed in the
  main run gets exactly one follow-up attempt. On a normal day the
  retry queue is empty, and this run touches the database once and
  exits. It only re-scrapes a bank when that bank actually has a retry
  due. If the retry also fails, no further retry is queued. The bank
  simply waits for the next daily run, still showing its last known data
  the whole time.

This is implemented with a `pending_retries` table (see `db/schema.sql`)
and the `allow_retry_scheduling` flag on `main.run_bank()` and
`main.run_cbsl()`. `retry_failed.py` sets this flag to `False` so a
second failure can't queue a third attempt. The retry is deliberately
limited to one extra try, not a retry loop.

## How to add a new bank

1. Visit the bank's live rates page first. Open dev tools and check
   whether the rate table is present in the raw HTML, only appears after
   JavaScript runs, or is a downloadable PDF or spreadsheet. Don't guess:
   this decides which technique the new module should use. Don't trust
   an assumed domain either. Several banks in this project turned out to
   live at a different domain than expected (Pan Asia's real site is
   `pabcbank.com`, not the commonly assumed `.lk` domain), or sit behind
   a bot-challenge that blocks a plain HTTP request even though a real
   browser gets through fine.
2. Check the bank's `/robots.txt` (the scraper does this automatically
   at runtime too, via `lib/robots.py`, before fetching any page). Fetch
   it with the project's own User-Agent rather than a bare
   `requests.get()`. Some banks' firewalls return 403 for unrecognised
   User-Agents on every path, including `/robots.txt`, which would
   otherwise make the scraper wrongly conclude the whole site disallows
   automated access.
3. Create `scraper/banks/<code>.py` with a single
   `scrape() -> list[RateRecord]` function, following the shape of an
   existing module that uses the same technique:
   - Static HTML: see `banks/boc.py`, `banks/seylan.py`, `banks/nsb.py`,
     `banks/peoples.py`.
   - JavaScript-rendered page: see `banks/panasia.py`, `banks/dfcc.py`,
     `banks/sampath.py` (all use Selenium).
   - PDF rate sheet: see `banks/nationstrust.py` (uses pdfplumber).
   - JSON API behind a JavaScript-rendered page: see `banks/hnb.py`.
     Before reaching for Selenium, check the page's network requests for
     a JSON endpoint the page itself calls. Calling that endpoint
     directly is simpler and faster than driving a browser.
4. Register the module in `scraper/banks/__init__.py`'s `SCRAPERS` dict.
5. Add a row to `db/seed_banks.sql` (and to the live `banks` table if the
   database already exists) with the bank's `code`, `website_url`,
   `rates_page_url`, and `scrape_method` (`html`, `js`, or `pdf`).
6. Run `python main.py` and confirm rows land in `rates` with a
   timestamp.

Every bank module is isolated. A parsing bug or a page redesign in one
module cannot affect any other bank's scrape, and the orchestrator keeps
running the rest even if one module raises an exception.

## Web app: a page-by-page tour

There are exactly three routes. Everything else, including the
calculator and the highlighted "top rates" cards, lives as a section
within one of these pages rather than as a separate URL, since none of
it needs to be bookmarked, shared, or indexed on its own.

- **Home page (`/`).** The main comparison view. A full-bleed hero
  carries the brand mark and headline, followed by a "Top rates today"
  strip that highlights the single best rate in each category (FD,
  savings, loan, card) as its own card. Below that is the full
  comparison table: every active bank's current rates, grouped into
  sortable category tabs, with each row carrying its source link and
  last-updated date so a visitor can check the figure directly with the
  bank. The deposit calculator sits further down the same page. On
  mobile, these sections become swappable tabs instead of one long
  scroll.
- **Per-bank page (`/bank/[code]`).** Statically generated at build time
  for every active bank. Breaks that bank's current rates down by
  category, with a Recharts trend line per tenure showing how the rate
  has moved over time, benchmarked against the CBSL national average.
- **About page (`/about`).** What SaveRateLK is, why it exists, the
  methodology behind how rates are collected and categorized, which
  banks are covered (and which are deliberately excluded, and why), and
  the disclaimer shown to every visitor. The same content also appears
  as a section on the home page, reached by scrolling or by the nav's
  "About" link. The standalone route mainly exists for anyone who lands
  on or shares that URL directly.

A few features that aren't routes, but matter to how the site feels to
use:

- **Deposit calculator.** Estimates the maturity value of a deposit,
  either by picking a real bank, tenure, and payment-frequency
  combination (which fills in that row's actual published rate and AER)
  or by typing in a custom rate. States its compounding assumptions
  plainly, since exact conventions differ from bank to bank, and the
  output is clearly labelled an estimate, not a guarantee.
- **Cursor-glow highlight cards.** The "Top rates today" cards track the
  cursor across the whole grid, not just one card at a time, so nearby
  cards light up together in their own category's color as the pointer
  passes near them. This is turned off below the `md` breakpoint, since
  there is no cursor to track on a touchscreen. Mobile gets a flat,
  cheaper card background instead.
- **Mobile navigation.** Below the `md` breakpoint, continuous scroll is
  replaced with an app-style bottom tab bar (switching sections with a
  `?tab=` query parameter) and a slim fixed top bar that just carries the
  brand mark, since the desktop floating nav doesn't fit that layout.
- **Loading splash screen.** A brief full-screen splash on first load:
  the brand mark animates in, then fades out. It runs for a fixed,
  short amount of time and does not wait on any real loading signal,
  since the page itself is already fast. It exists for the brand
  moment, not to mask load time.
- **Contact popup.** A single footer-triggered modal with a `mailto:`
  link to the contact address set in the environment. It has no form and
  no backend on purpose: nothing to validate, store, or spam.

## SEO

- Every page sets its own title, description, canonical URL, and Open
  Graph and Twitter metadata. `app/layout.tsx` provides the site-wide
  defaults through `metadataBase`, and each route overrides them with
  its own specifics.
- The home page emits a `FinancialProduct` JSON-LD block listing every
  current FD rate, so search engines can read the rate table as
  structured data instead of plain HTML.
- `app/sitemap.ts` lists the home page, the about page, and every active
  bank's detail page, cached for a day like the pages it lists.
  `app/robots.ts` allows all crawlers and points them at it.
- `app/icon.tsx` and `app/opengraph-image.tsx` generate the favicon and
  social-share preview image on demand with `next/og`, reusing the same
  red and blue "SaveRateLK" wordmark shown in the site's own header and
  footer. A link shared on social media or a chat app gets a real,
  on-brand preview instead of a blank card, with no separate design
  asset to keep in sync.

## Deployment (Vercel, Neon, and GitHub Actions)

There is no server to provision or maintain. The site is cached and the
scraper runs as a scheduled job, so nothing needs to stay running all
the time.

> The original VPS-based deployment (a local Postgres install, `cron`,
> and an Nginx and systemd-managed Next.js process) is kept in `deploy/`
> for reference only and is no longer how the site is run.

### Database (Neon)

1. Create a project at [neon.tech](https://neon.tech) and copy its
   connection string. Prefer the **pooled** variant (the hostname
   contains `-pooler`), since the web app runs as Vercel serverless
   functions, which can open many concurrent connections under load.
   The pooled endpoint handles that better than a direct connection.
2. Apply the schema once, from anywhere that can reach Neon:
   ```bash
   cd scraper
   cp .env.example .env   # paste the Neon connection string in
   pip install -r requirements.txt
   python init_db.py      # applies db/schema.sql and db/seed_banks.sql
   python main.py         # first pull, so the site has data right away
   ```

### Scraper (GitHub Actions)

The scraper uses Python, Selenium (three banks need a real rendered
browser), and pdfplumber (one bank publishes a PDF rate sheet). It can't
run as a Vercel serverless function, since there is no Chrome binary or
Python runtime there, so it keeps running on its own schedule through
`.github/workflows/scrape.yml`, which needs no server at all.

1. Push this repository to GitHub.
2. Add `DATABASE_URL` as a repository secret (**Settings → Secrets and
   variables → Actions → New repository secret**), using the same Neon
   connection string from above.
3. That's it. `.github/workflows/scrape.yml` already defines the
   schedule (once daily, plus one offset retry pass for whatever
   failed) and runs on GitHub's own runners, which come with Chrome
   pre-installed. Trigger it manually from the **Actions** tab
   (`workflow_dispatch`) to confirm it works before waiting for the
   first scheduled run.

### Web app (Vercel)

1. Import the repository at [vercel.com/new](https://vercel.com/new),
   and set the project's root directory to `web`.
2. Add the same environment variables as `web/.env.example`
   (`DATABASE_URL`, `SITE_URL`, `CONTACT_EMAIL`) under the project's
   **Settings → Environment Variables**.
3. Deploy. Vercel builds and serves the Next.js app directly. No Nginx,
   no systemd unit, no server to patch or restart.

## Data and ethics

- All rates shown are collected from each bank's own publicly published
  pages. Nothing here is non-public or paywalled data.
- The scraper checks each site's `robots.txt` before every fetch and
  skips any page that disallows automated access.
- Each bank is pulled on a fixed schedule (once a day by default, see
  [Scheduling and retry behavior](#scheduling-and-retry-behavior)),
  never on every visitor page view, with a deliberate delay between
  individual HTTP requests and an honest, identifying User-Agent.
- **HDFC (hdfc.lk) is intentionally excluded.** Its `robots.txt`
  disallows automated access, and that is respected rather than worked
  around.
- CBSL's AWDR, AWFDR, and policy rate are public-domain government
  statistics, used to benchmark every bank's rate against the national
  average.
- Every rate displayed in the UI carries a "last updated" timestamp and
  a link to the bank's official page. Every page carries a disclaimer
  that rates are indicative only and can change, and that visitors
  should always confirm the current rate directly with the bank before
  acting on it. This applies to the calculator's output too: it is
  clearly labelled an estimate.
- Amana Bank is excluded from the current product set. It operates
  under Islamic banking principles and publishes profit-sharing rates
  rather than interest, which don't average meaningfully against the
  interest-bearing products tracked here. It would need its own
  `profit` product type treated separately, not mixed into the FD and
  savings comparisons.

## Known limitations

- Bank rate pages change shape from time to time. When a bank's
  selectors break, only that one module fails. The orchestrator logs the
  failure to `scrape_runs`, queues the one-shot retry described above,
  and keeps scraping every other bank either way. Fixing one module
  never requires touching another.
- Some banks publish far more deposit product variants (branded savings
  accounts, senior-citizen tiers, promotional FDs) than are captured
  here. Each module focuses on the standard product range that's
  directly comparable across banks. Secondary or promotional variants
  are left out on purpose rather than guessed at.
- A couple of source pages have content quirks on the bank's own side,
  not the scraper's. Sampath's rates page renders its Term Deposit and
  Loan Rate tab content with no markup that distinguishes it from
  Savings Rates, and its `interest_rates_local` JSON API duplicates the
  same savings items under every category. `banks/sampath.py` documents
  exactly how it works around this. Treat any single bank's scraped data
  as only as reliable as that bank's own published page.
- CBSL does not currently publish a standing "maximum legal deposit
  rate" series. The cap seen during 2022 and 2023 was an emergency
  directive, not a recurring statistic, so the `deposit_cap` indicator
  has no live source right now and stays unpopulated until CBSL
  publishes one again.
- The one-shot retry queue is intentionally simple. It does not back
  off, escalate, or alert anyone on repeated failure. For a bank that
  stays broken across many scheduled runs, `scrape_runs` will show a
  streak of `failed` rows. That table is the place to check when
  monitoring this in production, not the retry queue itself, which is
  always empty between ticks by design.
