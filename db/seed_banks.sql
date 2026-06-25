/*
 * seed_banks.sql
 *
 * Inserts the initial set of banks into the registry.
 * Run after schema.sql to populate the banks table.
 *
 * scrape_method values: "html" (static HTML), "js" (JavaScript-rendered),
 *                       "pdf" (rate-sheet PDF)
 *
 * HDFC is intentionally excluded: robots.txt disallows automated access.
 * Amana Bank is excluded from v1; it uses profit-sharing rates (not interest)
 * and requires a separate product_type model.
 */

INSERT INTO banks (code, name, website_url, rates_page_url, scrape_method, is_active)
VALUES
    (
        'hnb',
        'Hatton National Bank',
        'https://www.hnb.lk',
        'https://www.hnb.lk/interest-rates',
        'html',
        TRUE
    ),
    (
        'commercial',
        'Commercial Bank of Ceylon',
        'https://www.combank.lk',
        'https://www.combank.lk/rates-tariff',
        'html',
        TRUE
    ),
    (
        'boc',
        'Bank of Ceylon',
        'https://www.boc.lk',
        'https://www.boc.lk/rates-tariff',
        'html',
        TRUE
    ),
    (
        'seylan',
        'Seylan Bank',
        'https://www.seylan.lk',
        'https://www.seylan.lk/interest-rates',
        'html',
        TRUE
    ),
    (
        'nsb',
        'National Savings Bank',
        'https://www.nsb.lk',
        'https://www.nsb.lk/rates-tarriffs/rupee-deposit-rates/',
        'html',
        TRUE
    ),
    (
        'panasia',
        'Pan Asia Banking Corporation',
        'https://www.pabcbank.com',
        'https://www.pabcbank.com/personal-banking/savings-investments/fixed-deposits/general-fixed-deposits/',
        'js',
        TRUE
    ),
    (
        'ndb',
        'National Development Bank',
        'https://www.ndbbank.com',
        'https://www.ndbbank.com/rates/interest-rates-on-deposits',
        'html',
        TRUE
    ),
    (
        'nationstrust',
        'Nations Trust Bank',
        'https://www.nationstrust.com',
        'https://www.nationstrust.com/rates-tariffs',
        'pdf',
        TRUE
    ),
    (
        'peoples',
        'People''s Bank',
        'https://www.peoplesbank.lk',
        'https://www.peoplesbank.lk/interest-rates/',
        'html',
        TRUE
    ),
    (
        'dfcc',
        'DFCC Bank',
        'https://www.dfcc.lk',
        'https://www.dfcc.lk/rates-and-tariff?tab=fixed_deposits',
        'js',
        TRUE
    ),
    (
        'sampath',
        'Sampath Bank',
        'https://www.sampath.lk',
        'https://www.sampath.lk/rates-and-charges?activeTab=interest-rates-local',
        'js',
        TRUE
    )
ON CONFLICT (code) DO NOTHING;
