/**
 * lib/format.ts
 *
 * Small formatting helpers shared across pages that render Hero's
 * "Updated {date}" badge (currently the homepage and the About page).
 */

import { RateRow } from "./db";

/** The most recent scraped_at across any number of rate-row batches, as a "12 Jun 2026"-style string. */
export function formatUpdatedDate(rows: RateRow[][]): string {
  const latest = rows.flat().reduce<Date | null>((max, r) => {
    const d = new Date(r.scraped_at);
    return !max || d > max ? d : max;
  }, null);
  return (latest ?? new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
