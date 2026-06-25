/**
 * components/SavingsByCategory.tsx
 *
 * Savings account comparison, one sub-tab per category (Normal, Minor/
 * Children's, Senior Citizens, Money Market, Special) instead of all
 * five stacked vertically — see lib/categorize.ts for how a row's free-
 * text product name is classified into one of these; it's a keyword
 * heuristic, not an exact mapping, so an unusually-named product can
 * land in "Special" even when it might reasonably belong elsewhere. Each
 * category's tab shows the existing comparison table (shared with the
 * other single-rate-column product types via RateTable) plus a multi-
 * bank history chart of that category's rate over time.
 *
 * Server Component — all grouping/pivoting happens once at render time.
 */

import { RateRow, HistoryRow } from "@/lib/db";
import { SAVINGS_CATEGORY_ORDER, SAVINGS_CATEGORY_LABELS, categorizeSavings } from "@/lib/categorize";
import { pivotHistoryByBank } from "@/lib/history";
import RateTable from "@/components/RateTable";
import MultiBankHistoryChart from "@/components/MultiBankHistoryChart";
import RateTabs from "@/components/RateTabs";

interface Props {
  rows:    RateRow[];
  history: HistoryRow[];
}

export default function SavingsByCategory({ rows, history }: Props) {
  if (rows.length === 0) {
    return <p className="text-gray-500 text-sm mt-4 dark:text-neutral-400">No savings account data available yet.</p>;
  }

  const tabs = SAVINGS_CATEGORY_ORDER.map((category) => {
    const categoryRows = rows.filter((r) => categorizeSavings(r.notes) === category);
    if (categoryRows.length === 0) return null;

    const { data, series } = pivotHistoryByBank(
      history
        .filter((h) => categorizeSavings(h.notes) === category)
        .map((h) => ({ bankCode: h.bank_code, bankName: h.bank_name, rate: Number(h.interest_rate), scrapedAt: h.scraped_at }))
    );

    const content = (
      <div className="space-y-6">
        <RateTable rows={categoryRows} />
        <section className="surface-glow rounded-xl border border-gray-200 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950">
          <MultiBankHistoryChart data={data} series={series} title={`${SAVINGS_CATEGORY_LABELS[category]} — rate history`} />
        </section>
      </div>
    );

    return { key: category, label: SAVINGS_CATEGORY_LABELS[category], content };
  }).filter((tab): tab is NonNullable<typeof tab> => tab !== null);

  return (
    <div className="mt-4">
      <RateTabs tabs={tabs} variant="underline" />
    </div>
  );
}
