/**
 * lib/categorize.ts
 *
 * Groups raw rate rows into the fixed set of categories the UI presents,
 * instead of showing every scraped tenure/product name as its own row.
 * Banks publish dozens of oddly-tenured or oddly-branded variants; without
 * this grouping the comparison tables become an unreadable wall of rows
 * that don't line up bank to bank.
 *
 * Two groupings live here:
 *   - FD tenures are bucketed into the eight standard terms savers
 *     actually compare across banks. Non-standard tenures (e.g. 7, 9, 13,
 *     15, 30, 100, 120 months) are deliberately left out of this view —
 *     they still exist in the database and on that bank's raw history,
 *     just not in the cross-bank comparison tables.
 *   - Savings products are classified into five categories by keyword
 *     matching on the bank's own free-text product name (the `notes`
 *     column). This is a best-effort heuristic, not a guarantee: a bank's
 *     product naming is whatever marketing chose, not a controlled
 *     vocabulary, so an unusual name can land in the "Special" catch-all
 *     even if a human would call it something else.
 */

export const STANDARD_TENURES = [1, 3, 6, 12, 24, 36, 48, 60] as const;
export type StandardTenure = (typeof STANDARD_TENURES)[number];

export const TENURE_LABELS: Record<StandardTenure, string> = {
  1:  "1 Month FD",
  3:  "3 Months FD",
  6:  "6 Months FD",
  12: "12 Months / 1 Year FD",
  24: "2 Years FD",
  36: "3 Years FD",
  48: "4 Years FD",
  60: "5 Years FD",
};

/** True if tenureMonths is one of the eight standard comparison terms. */
export function isStandardTenure(tenureMonths: number | null): tenureMonths is StandardTenure {
  return tenureMonths != null && (STANDARD_TENURES as readonly number[]).includes(tenureMonths);
}

// ---------------------------------------------------------------------------
// Savings categories
// ---------------------------------------------------------------------------

export type SavingsCategory = "normal" | "minor" | "senior" | "money_market" | "special";

export const SAVINGS_CATEGORY_ORDER: SavingsCategory[] = [
  "normal", "minor", "senior", "money_market", "special",
];

export const SAVINGS_CATEGORY_LABELS: Record<SavingsCategory, string> = {
  normal:       "Normal Savings",
  minor:        "Minor Savings / Children's Savings",
  senior:       "Senior Citizens' Savings",
  money_market: "Money Market Savings",
  special:      "High Interest Savings / Special Savings",
};

/**
 * Classify a savings row into one of the five UI categories from its
 * `notes` text (the product name or balance-tier label the bank module
 * recorded). See module docstring for why this is a heuristic, not exact.
 */
export function categorizeSavings(notes: string | null): SavingsCategory {
  const text = (notes ?? "").toLowerCase().trim();
  if (!text) return "normal";

  if (/senior|sathkara|pension|adhistana/.test(text)) return "senior";
  if (/minor|child|teen|junior|youth|\bkid\b|kirikatiyo|\blama\b|pixel|\bzee\b|sapiri|pubudu/.test(text)) {
    return "minor";
  }
  if (/money market/.test(text)) return "money_market";
  // An explicit "ordinary/normal/easy saver" name, or a label that is just
  // a balance tier with no brand name attached (e.g. "Below LKR 50,000") —
  // the latter pattern means the surrounding bank module only scraped one
  // savings product at all, so it must be that bank's basic account.
  if (/^(ordinary|normal|easy saver)\b/.test(text)) return "normal";
  if (/^(below|up to|lkr|rs\.?\s?\d|\d)/.test(text)) return "normal";

  return "special";
}
