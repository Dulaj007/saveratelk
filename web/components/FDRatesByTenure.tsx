/**
 * components/FDRatesByTenure.tsx
 *
 * Fixed deposit comparison, one sub-tab per standard tenure (1 Month FD,
 * 3 Months FD, ... 5 Years FD) rather than all eight stacked vertically —
 * a flat wall of eight tables read as a spreadsheet dump; switching
 * between named tenures reads as "pick what you're comparing". Each
 * tenure's tab shows the existing two-column (Interest at Maturity /
 * Monthly Interest) comparison table plus a multi-bank history chart of
 * that tenure's at-maturity rate over time, so the trend — not just
 * today's snapshot — is visible without leaving the tab.
 *
 * Server Component — all grouping/pivoting happens once at render time
 * from the rows and history already fetched by the page; only the tab
 * switching itself (in RateTabs) needs client state.
 */

import { RateRow, HistoryRow } from "@/lib/db";
import { STANDARD_TENURES, TENURE_LABELS, isStandardTenure } from "@/lib/categorize";
import { pivotHistoryByBank } from "@/lib/history";
import BankLogo from "@/components/BankLogo";
import MultiBankHistoryChart from "@/components/MultiBankHistoryChart";
import RateTabs from "@/components/RateTabs";
import { IconStar, IconExternalLink } from "@/components/icons";

interface Props {
  rows:    RateRow[];
  history: HistoryRow[];
}

interface BankTenureRates {
  bankCode:     string;
  bankName:     string;
  ratesPageUrl: string;
  maturity:     RateRow | null;
  monthly:      RateRow | null;
  lastUpdated:  Date | null;
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Build one row per bank that has at least a maturity or monthly rate for tenureMonths. */
function buildBankRows(rows: RateRow[], tenureMonths: number): BankTenureRates[] {
  const byBank = new Map<string, BankTenureRates>();

  for (const row of rows) {
    if (row.tenure_months !== tenureMonths) continue;

    const existing = byBank.get(row.bank_code) ?? {
      bankCode: row.bank_code,
      bankName: row.bank_name,
      ratesPageUrl: row.rates_page_url,
      maturity: null,
      monthly: null,
      lastUpdated: null,
    };

    if (row.interest_payment === "at-maturity" || row.interest_payment == null) {
      existing.maturity = row;
    } else if (row.interest_payment === "monthly") {
      existing.monthly = row;
    }

    const rowDate = new Date(row.scraped_at);
    if (!existing.lastUpdated || rowDate > existing.lastUpdated) {
      existing.lastUpdated = rowDate;
    }

    byBank.set(row.bank_code, existing);
  }

  return Array.from(byBank.values()).sort((a, b) => {
    const rateA = a.maturity ? Number(a.maturity.interest_rate) : -1;
    const rateB = b.maturity ? Number(b.maturity.interest_rate) : -1;
    return rateB - rateA;
  });
}

export default function FDRatesByTenure({ rows, history }: Props) {
  const standardRows = rows.filter((r) => isStandardTenure(r.tenure_months));

  if (standardRows.length === 0) {
    return <p className="text-gray-500 text-sm mt-4 dark:text-neutral-400">No fixed deposit data available yet.</p>;
  }

  const tabs = STANDARD_TENURES.map((tenureMonths) => {
    const bankRows = buildBankRows(standardRows, tenureMonths);
    if (bankRows.length === 0) return null;

    const topRate = bankRows[0].maturity ? Number(bankRows[0].maturity.interest_rate) : null;

    // Headline trend = the at-maturity rate (or unspecified-payment rows,
    // same convention buildBankRows uses for the table's maturity column)
    // for this tenure, one line per bank.
    const { data, series } = pivotHistoryByBank(
      history
        .filter((h) => h.tenure_months === tenureMonths && (h.interest_payment === "at-maturity" || h.interest_payment == null))
        .map((h) => ({ bankCode: h.bank_code, bankName: h.bank_name, rate: Number(h.interest_rate), scrapedAt: h.scraped_at }))
    );

    const content = (
      <div className="space-y-6">
        <section className="surface-glow overflow-hidden rounded-xl border border-gray-200 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950">
          <div className="divide-y divide-gray-100 dark:divide-neutral-800">
            {bankRows.map((b) => {
              const maturityRate = b.maturity ? Number(b.maturity.interest_rate) : null;
              const isTop = topRate != null && maturityRate === topRate;
              return (
                <div
                  key={b.bankCode}
                  className={`flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-green-50/60 dark:hover:bg-green-900/20 ${isTop ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <BankLogo code={b.bankCode} name={b.bankName} size={36} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900 dark:text-neutral-100">{b.bankName}</span>
                        {isTop && <IconStar className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                      </div>
                      <p className="truncate text-xs text-gray-500 dark:text-neutral-400">
                        {b.lastUpdated ? formatDate(b.lastUpdated) : "—"}
                        {" · "}
                        <a
                          href={b.ratesPageUrl}
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
                    {b.maturity ? (
                      <p className={`text-xl font-bold leading-tight ${isTop ? "text-amber-600 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
                        {maturityRate!.toFixed(2)}%
                      </p>
                    ) : (
                      <p className="text-xl font-bold leading-tight text-gray-300 dark:text-neutral-600">—</p>
                    )}
                    {b.maturity?.annual_effective_rate != null && (
                      <p className="text-[11px] text-gray-400 dark:text-neutral-500">
                        AER {Number(b.maturity.annual_effective_rate).toFixed(2)}%
                      </p>
                    )}
                    {b.monthly && (
                      <p className="text-[11px] text-gray-400 dark:text-neutral-500">
                        {Number(b.monthly.interest_rate).toFixed(2)}% paid monthly
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="surface-glow rounded-xl border border-gray-200 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950">
          <MultiBankHistoryChart data={data} series={series} title={`${TENURE_LABELS[tenureMonths]} — rate history`} />
        </section>
      </div>
    );

    return { key: String(tenureMonths), label: TENURE_LABELS[tenureMonths], content };
  }).filter((tab): tab is NonNullable<typeof tab> => tab !== null);

  return (
    <div className="mt-4">
      <RateTabs tabs={tabs} variant="underline" />
    </div>
  );
}
