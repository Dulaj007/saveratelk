/**
 * components/LendingRates.tsx
 *
 * Loans & Cards comparison, one sub-tab per lending/credit product type
 * (Credit Cards, Housing Loans, Personal Loans, Leasing, Education Loans,
 * Pawning, Overdraft) — the same sub-tab + history-chart treatment
 * FDRatesByTenure and SavingsByCategory use, so all three main tabs read
 * consistently instead of Loans & Cards being the one flat, undifferentiated
 * list. Grouped by product_type directly rather than the notes-keyword
 * heuristic SavingsByCategory uses, since each row already arrives tagged
 * with the right type.
 *
 * Coverage here is intentionally best-effort: many Sri Lankan banks don't
 * publish a flat number for products like pawning or overdraft (rate is
 * AWPLR + an individually-assessed margin), so a sub-tab for a type with
 * zero scraped rows simply doesn't appear rather than showing an empty
 * table for every bank.
 *
 * Unlike deposit rates, a lower loan/card rate is the better deal for the
 * borrower, so every table and chart here is built with lowerIsBetter —
 * otherwise the "Best rate" badge and the history trend would track the
 * most expensive loan instead of the cheapest one.
 *
 * Server Component — all grouping/pivoting happens once at render time.
 */

import { RateRow, HistoryRow } from "@/lib/db";
import { LENDING_PRODUCT_TYPES, LENDING_PRODUCT_LABELS } from "@/lib/productTypes";
import { pivotHistoryByBank } from "@/lib/history";
import RateTable from "@/components/RateTable";
import MultiBankHistoryChart from "@/components/MultiBankHistoryChart";
import RateTabs from "@/components/RateTabs";

interface Props {
  rows:    RateRow[];
  history: HistoryRow[];
}

export default function LendingRates({ rows, history }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-gray-500 text-sm mt-4 dark:text-neutral-400">
        No loan or credit card rate data available yet — many banks only quote these
        individually rather than publishing a flat rate.
      </p>
    );
  }

  const tabs = LENDING_PRODUCT_TYPES.map((type) => {
    const typeRows = rows.filter((r) => r.product_type === type);
    if (typeRows.length === 0) return null;

    const { data, series } = pivotHistoryByBank(
      history
        .filter((h) => h.product_type === type)
        .map((h) => ({ bankCode: h.bank_code, bankName: h.bank_name, rate: Number(h.interest_rate), scrapedAt: h.scraped_at })),
      true // lowerIsBetter — track each bank's cheapest variant, not its most expensive
    );

    const content = (
      <div className="space-y-6">
        <RateTable rows={typeRows} lowerIsBetter />
        <section className="surface-glow rounded-xl border border-gray-200 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950">
          <MultiBankHistoryChart data={data} series={series} title={`${LENDING_PRODUCT_LABELS[type]} — rate history`} />
        </section>
      </div>
    );

    return { key: type, label: LENDING_PRODUCT_LABELS[type], content };
  }).filter((tab): tab is NonNullable<typeof tab> => tab !== null);

  return (
    <div className="mt-4">
      <RateTabs tabs={tabs} variant="underline" />
    </div>
  );
}
