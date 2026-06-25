/**
 * components/RateTable.tsx
 *
 * Shared list used for every product type that's just "one bank, one
 * rate" (savings categories, and the lending/credit-card types in
 * LendingRates), as opposed to FDRatesByTenure's two-column maturity/
 * monthly layout, which has its own renderer.
 *
 * Deliberately a list of rows, not a literal <table>: a table forces a
 * visitor to scan across five columns to read one bank's rate, which is
 * exactly the "feels like a spreadsheet" complaint this was rewritten to
 * fix. Each row instead reads top-to-bottom: logo and bank name first,
 * then one big number, with the secondary details (product name, last
 * updated, source link) folded into a single small muted line underneath
 * rather than their own columns. The best row is marked with a star icon
 * rather than a "Best rate" text badge, for the same reason.
 *
 * "Best" depends on which side of the product the rate is paid from: for
 * a deposit (savings) the highest rate is best for the saver, but for a
 * loan/credit-card rate the LOWEST is best for the borrower.
 * lowerIsBetter flips both the sort and the star so LendingRates doesn't
 * end up starring the most expensive loan as if it were the best deal.
 *
 * Server Component, since all sorting happens once at render time.
 */

import { RateRow } from "@/lib/db";
import BankLogo from "@/components/BankLogo";
import { IconStar, IconExternalLink } from "@/components/icons";

interface Props {
  title?: string;
  rows: RateRow[];
  lowerIsBetter?: boolean;
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function RateTable({ title, rows, lowerIsBetter = false }: Props) {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) =>
    lowerIsBetter
      ? Number(a.interest_rate) - Number(b.interest_rate)
      : Number(b.interest_rate) - Number(a.interest_rate)
  );
  const bestRate = Number(sorted[0].interest_rate);

  return (
    <section className="surface-glow overflow-hidden rounded-xl border border-gray-200 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950">
      {title && (
        <h3 className="border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-base font-semibold text-gray-800 dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-100">
          {title}
        </h3>
      )}
      <div className="divide-y divide-gray-100 dark:divide-neutral-800">
        {sorted.map((row, i) => {
          const rate = Number(row.interest_rate);
          const isBest = rate === bestRate;
          return (
            <div
              key={i}
              className={`flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-green-50/60 dark:hover:bg-green-900/20 ${isBest ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <BankLogo code={row.bank_code} name={row.bank_name} size={36} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-gray-900 dark:text-neutral-100">{row.bank_name}</span>
                    {isBest && <IconStar className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  </div>
                  <p className="truncate text-xs text-gray-500 dark:text-neutral-400">
                    {row.notes && <span>{row.notes} · </span>}
                    {formatDate(row.scraped_at)}
                    {" · "}
                    <a
                      href={row.rates_page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Source <IconExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className={`text-xl font-bold leading-tight ${isBest ? "text-amber-600 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
                  {rate.toFixed(2)}%
                </p>
                {row.annual_effective_rate != null && (
                  <p className="text-[11px] text-gray-400 dark:text-neutral-500">
                    AER {Number(row.annual_effective_rate).toFixed(2)}%
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
