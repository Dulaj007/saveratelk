/**
 * components/CategoryFlatTable.tsx
 *
 * The big flat comparison table at the bottom of the homepage — one row
 * per bank, columns depend on which of the four hero-pill categories is
 * selected. Replaces, for the homepage only, the old per-tenure/per-
 * category sub-tabs + history charts (FDRatesByTenure / SavingsByCategory
 * / LendingRates, still used as-is on the per-bank detail page) with a
 * single always-visible table, matching the target design's plain
 * "Bank × tenure columns" layout instead of a tabbed drill-down.
 *
 * Fixed Deposits gets the full Bank | 3/6/12-month | Min. deposit layout.
 * Savings keeps its old per-category sub-tabs (Normal/Minor/Senior/Money
 * Market/Special — see lib/categorize.ts) instead of collapsing to one
 * row per bank, since a bank's several named savings products are
 * genuinely different accounts, not variants of the same thing; cards
 * and loans likewise list every row rather than just each bank's
 * cheapest, so nothing scraped is hidden from the visitor.
 *
 * Each table also offers a "Sort by" control (default order is always
 * best/cheapest-first; re-sorting is local UI state, not a re-fetch) and
 * is followed by a history chart — by tenure for FDs, by bank for the
 * other three categories, since they don't have a tenure dimension to
 * split on.
 *
 * Client Component — sort order and the savings sub-tab are interactive
 * local state.
 */
"use client";

import { useState } from "react";
import { RateRow, HistoryRow } from "@/lib/db";
import { categorizeSavings, SAVINGS_CATEGORY_ORDER, SAVINGS_CATEGORY_LABELS, SavingsCategory } from "@/lib/categorize";
import { LENDING_PRODUCT_LABELS, LENDING_PRODUCT_TYPES } from "@/lib/productTypes";
import { CategoryKey, CATEGORY_TABLE_TITLES } from "@/lib/categories";
import { pivotFdTenureBest, pivotHistoryByBank } from "@/lib/history";
import BankLogo from "@/components/BankLogo";
import { IconExternalLink } from "@/components/icons";
import TenureHistoryChart from "@/components/TenureHistoryChart";
import HoverGlowCard from "@/components/HoverGlowCard";
import CardGlowGrid from "@/components/CardGlowGrid";

interface Props {
  category:       CategoryKey;
  fdRows:         RateRow[];
  savingsRows:    RateRow[];
  cardRows:       RateRow[];
  loanRows:       RateRow[];
  fdHistory:      HistoryRow[];
  savingsHistory: HistoryRow[];
  cardHistory:    HistoryRow[];
  loanHistory:    HistoryRow[];
  bankCount:      number;
}

const FD_TENURES = [3, 6, 12] as const;

/** "loan" category's sub-tabs — every lending type except cards, which get their own top-level category. */
const LOAN_PRODUCT_TYPES = LENDING_PRODUCT_TYPES.filter((t) => t !== "card");

interface FdLine {
  bankCode: string;
  bankName: string;
  ratesPageUrl: string;
  byTenure: Record<number, RateRow | undefined>;
  minDeposit: number | null;
}

function buildFdLines(rows: RateRow[]): FdLine[] {
  const byBank = new Map<string, FdLine>();
  for (const row of rows) {
    if (row.tenure_months == null || !(FD_TENURES as readonly number[]).includes(row.tenure_months)) continue;
    if (row.interest_payment != null && row.interest_payment !== "at-maturity") continue;

    const line = byBank.get(row.bank_code) ?? {
      bankCode: row.bank_code,
      bankName: row.bank_name,
      ratesPageUrl: row.rates_page_url,
      byTenure: {},
      minDeposit: null,
    };
    line.byTenure[row.tenure_months] = row;
    if (row.min_deposit != null) line.minDeposit = Number(row.min_deposit);
    byBank.set(row.bank_code, line);
  }

  return Array.from(byBank.values()).sort((a, b) => {
    const rateA = a.byTenure[12] ? Number(a.byTenure[12]!.interest_rate) : -1;
    const rateB = b.byTenure[12] ? Number(b.byTenure[12]!.interest_rate) : -1;
    return rateB - rateA;
  });
}

interface SingleRateLine {
  bankCode: string;
  bankName: string;
  ratesPageUrl: string;
  label:    string;
  rate:     number;
}

/** Every row mapped to a display line — deliberately not collapsed to one per bank, so a bank's several distinct products (e.g. four named savings accounts) all show up rather than just its best one. */
function buildFullRateLines(
  rows: RateRow[],
  labelFor: (row: RateRow) => string,
  lowerIsBetter: boolean
): SingleRateLine[] {
  const lines = rows.map((row) => ({
    bankCode: row.bank_code,
    bankName: row.bank_name,
    ratesPageUrl: row.rates_page_url,
    label: labelFor(row),
    rate: Number(row.interest_rate),
  }));
  return lines.sort((a, b) => (lowerIsBetter ? a.rate - b.rate : b.rate - a.rate));
}

function SourceLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 text-xs text-blue-400 hover:underline"
    >
      Source <IconExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}

function formatCurrency(amount: number): string {
  return `Rs. ${Math.round(amount).toLocaleString("en-LK")}`;
}

export default function CategoryFlatTable({
  category, fdRows, savingsRows, cardRows, loanRows,
  fdHistory, savingsHistory, cardHistory, loanHistory, bankCount,
}: Props) {
  const title = CATEGORY_TABLE_TITLES[category];

  return (
    <>
      <CardGlowGrid>
        <HoverGlowCard
          id="rates-table"
          glowColor="59, 130, 246"
          className="mt-6 overflow-hidden rounded-2xl z-10 relative border border-white/10 bg-white/[0.03]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-6 py-5">
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <p className="mt-0.5 text-sm text-neutral-400">
                {bankCount > 0 ? `Across ${bankCount} banks · LKR` : "LKR"}
              </p>
            </div>
          </div>

          {category === "fd" && <FdTable rows={fdRows} />}
          {category === "savings" && <SavingsTable rows={savingsRows} />}
          {category === "card" && (
            <SingleRateTable
              lines={buildFullRateLines(cardRows, () => "Credit Card", true)}
              rateColumnLabel="Rate"
              lowerIsBetter
            />
          )}
          {category === "loan" && <LoanTable rows={loanRows} />}
        </HoverGlowCard>
      </CardGlowGrid>

      {category === "fd" && <FdHistorySection history={fdHistory} />}
      {category === "savings" && (
        <BankHistorySection
          history={savingsHistory}
          lowerIsBetter={false}
          title="Best savings rate by bank"
          glowColor="59, 130, 246"
        />
      )}
      {category === "card" && (
        <BankHistorySection
          history={cardHistory}
          lowerIsBetter
          title="Cheapest credit card rate by bank"
          glowColor="96, 165, 250"
        />
      )}
      {category === "loan" && (
        <BankHistorySection
          history={loanHistory}
          lowerIsBetter
          title="Cheapest loan rate by bank"
          glowColor="96, 165, 250"
        />
      )}
    </>
  );
}

function FdHistorySection({ history }: { history: HistoryRow[] }) {
  const { data, series } = pivotFdTenureBest(
    history.map((h) => ({
      bankCode: h.bank_code,
      bankName: h.bank_name,
      tenureMonths: h.tenure_months ?? 0,
      interestPayment: h.interest_payment,
      rate: Number(h.interest_rate),
      scrapedAt: h.scraped_at,
    })),
    FD_TENURES
  );

  return (
    <CardGlowGrid>
      <HoverGlowCard glowColor="239, 68, 68" className="relative mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <TenureHistoryChart data={data} series={series} title="Highest rate by tenure, across all banks" />
      </HoverGlowCard>
    </CardGlowGrid>
  );
}

/** One line per bank (savings/card/loan have no tenure dimension to split by, unlike FdHistorySection). */
function BankHistorySection({
  history, lowerIsBetter, title, glowColor,
}: { history: HistoryRow[]; lowerIsBetter: boolean; title: string; glowColor: string }) {
  const { data, series } = pivotHistoryByBank(
    history.map((h) => ({
      bankCode: h.bank_code,
      bankName: h.bank_name,
      rate: Number(h.interest_rate),
      scrapedAt: h.scraped_at,
    })),
    lowerIsBetter
  );

  return (
    <CardGlowGrid>
      <HoverGlowCard glowColor={glowColor} className="relative mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <TenureHistoryChart data={data} series={series} title={title} />
      </HoverGlowCard>
    </CardGlowGrid>
  );
}

type FdSortKey = "t12" | "t6" | "t3" | "minDeposit" | "name";

function FdTable({ rows }: { rows: RateRow[] }) {
  const [sortKey, setSortKey] = useState<FdSortKey>("t12");
  const lines = buildFdLines(rows);
  if (lines.length === 0) {
    return <p className="px-6 py-8 text-sm text-neutral-400">No fixed deposit data available yet.</p>;
  }
  const bestCode = lines[0]?.byTenure[12] ? lines[0].bankCode : null;

  const sorted = [...lines].sort((a, b) => {
    if (sortKey === "name") return a.bankName.localeCompare(b.bankName);
    if (sortKey === "minDeposit") return (a.minDeposit ?? Infinity) - (b.minDeposit ?? Infinity);
    const tenure = sortKey === "t12" ? 12 : sortKey === "t6" ? 6 : 3;
    const rateA = a.byTenure[tenure] ? Number(a.byTenure[tenure]!.interest_rate) : -1;
    const rateB = b.byTenure[tenure] ? Number(b.byTenure[tenure]!.interest_rate) : -1;
    return rateB - rateA;
  });

  return (
    <div>
      <SortSelect<FdSortKey>
        value={sortKey}
        onChange={setSortKey}
        options={[
          { value: "t12", label: "Best 12-month rate" },
          { value: "t6", label: "Best 6-month rate" },
          { value: "t3", label: "Best 3-month rate" },
          { value: "minDeposit", label: "Lowest min. deposit" },
          { value: "name", label: "Bank name (A–Z)" },
        ]}
      />
      {/* A bank × tenure grid is unreadable squeezed into a phone's width —
          text just wraps to three lines per cell — so mobile gets a
          simple stacked card per bank instead of the table; md: and up
          keep the full table. */}
      <div className="space-y-3 px-4 pb-2 md:hidden">
        {sorted.map((line) => {
          const isBest = line.bankCode === bestCode;
          return (
            <div
              key={line.bankCode}
              className={`rounded-xl border p-4 ${isBest ? "border-blue-500/40 bg-blue-500/[0.06]" : "border-white/10 bg-white/[0.02]"}`}
            >
              <div className="flex items-center gap-3">
                <BankLogo code={line.bankCode} name={line.bankName} width={56} height={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-neutral-100">{line.bankName}</span>
                    {isBest && (
                      <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                        Best
                      </span>
                    )}
                  </div>
                  <SourceLink url={line.ratesPageUrl} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {FD_TENURES.map((t) => {
                  const r = line.byTenure[t];
                  const last = t === 12;
                  return (
                    <div key={t} className={`rounded-lg px-2 py-2 ${last ? "bg-blue-500/10" : "bg-white/5"}`}>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{t} mo</div>
                      <div className={`mt-0.5 text-sm font-bold ${last ? (isBest ? "text-blue-300" : "text-white") : "text-neutral-200"}`}>
                        {r ? `${Number(r.interest_rate).toFixed(2)}%` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 flex justify-between text-xs text-neutral-400">
                <span>Min. deposit</span>
                <span className="text-neutral-200">{line.minDeposit != null ? formatCurrency(line.minDeposit) : "—"}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-6 py-3 font-medium">Bank</th>
              {FD_TENURES.map((t) => (
                <th key={t} className="px-4 py-3 text-right font-medium">{t} month</th>
              ))}
              <th className="px-6 py-3 text-right font-medium">Min. deposit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map((line) => {
              const isBest = line.bankCode === bestCode;
              return (
                <tr key={line.bankCode} className={isBest ? "bg-blue-500/[0.06]" : undefined}>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <BankLogo code={line.bankCode} name={line.bankName} width={62} height={38} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-neutral-100">{line.bankName}</span>
                          {isBest && (
                            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                              Best
                            </span>
                          )}
                        </div>
                        <SourceLink url={line.ratesPageUrl} />
                      </div>
                    </div>
                  </td>
                  {FD_TENURES.map((t) => {
                    const r = line.byTenure[t];
                    const last = t === 12;
                    return (
                      <td
                        key={t}
                        className={`px-4 py-3.5 text-right ${last ? "font-bold" : "text-neutral-300"} ${
                          last ? (isBest ? "text-blue-300" : "text-white") : ""
                        }`}
                      >
                        {r ? `${Number(r.interest_rate).toFixed(2)}%` : "—"}
                      </td>
                    );
                  })}
                  <td className="px-6 py-3.5 text-right text-neutral-400">
                    {line.minDeposit != null ? formatCurrency(line.minDeposit) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SortOption<T extends string> {
  value: T;
  label: string;
}

function SortSelect<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: SortOption<T>[] }) {
  return (
    <label className="flex items-center justify-end gap-2 px-6 pb-3 pt-4 text-xs text-neutral-400">
      Sort by
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-neutral-900">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type SingleSortKey = "rate" | "name";

function SingleRateTable({
  lines, rateColumnLabel, lowerIsBetter,
}: { lines: SingleRateLine[]; rateColumnLabel: string; lowerIsBetter: boolean }) {
  const [sortKey, setSortKey] = useState<SingleSortKey>("rate");
  if (lines.length === 0) {
    return <p className="px-6 py-8 text-sm text-neutral-400">No data available yet.</p>;
  }
  // A composite key, not just bankCode, since a bank can have several lines (e.g. four named
  // savings products) — bankCode alone would mark every one of that bank's rows as "Best".
  const bestKey = `${lines[0].bankCode}:${lines[0].label}`;

  const sorted = sortKey === "name" ? [...lines].sort((a, b) => a.bankName.localeCompare(b.bankName)) : lines;

  return (
    <div>
      <SortSelect<SingleSortKey>
        value={sortKey}
        onChange={setSortKey}
        options={[
          { value: "rate", label: lowerIsBetter ? "Cheapest rate" : "Best rate" },
          { value: "name", label: "Bank name (A–Z)" },
        ]}
      />
      {/* Mobile gets a stacked card per line instead of the table — see FdTable's identical split. */}
      <div className="space-y-3 px-4 pb-2 md:hidden">
        {sorted.map((line, i) => {
          const isBest = `${line.bankCode}:${line.label}` === bestKey;
          return (
            <div
              key={`${line.bankCode}-${line.label}-${i}`}
              className={`rounded-xl border p-4 ${isBest ? "border-blue-500/40 bg-blue-500/[0.06]" : "border-white/10 bg-white/[0.02]"}`}
            >
              <div className="flex items-center gap-3">
                <BankLogo code={line.bankCode} name={line.bankName} width={56} height={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-neutral-100">{line.bankName}</span>
                    {isBest && (
                      <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                        Best
                      </span>
                    )}
                  </div>
                  <SourceLink url={line.ratesPageUrl} />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="text-neutral-400">{line.label}</span>
                <span className={`font-bold ${isBest ? "text-blue-300" : "text-white"}`}>{line.rate.toFixed(2)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-6 py-3 font-medium">Bank</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-6 py-3 text-right font-medium">{rateColumnLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map((line, i) => {
              const isBest = `${line.bankCode}:${line.label}` === bestKey;
              return (
                <tr key={`${line.bankCode}-${line.label}-${i}`} className={isBest ? "bg-blue-500/[0.06]" : undefined}>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <BankLogo code={line.bankCode} name={line.bankName} width={62} height={38} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-neutral-100">{line.bankName}</span>
                          {isBest && (
                            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                              Best
                            </span>
                          )}
                        </div>
                        <SourceLink url={line.ratesPageUrl} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-neutral-400">{line.label}</td>
                  <td className={`px-6 py-3.5 text-right font-bold ${isBest ? "text-blue-300" : "text-white"}`}>
                    {line.rate.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Savings sub-tabs (Normal/Minor/Senior/Money Market/Special) — brought
 * back from the old SavingsByCategory component instead of the flat,
 * collapsed-to-one-row-per-bank list, since the five categories are
 * genuinely different account types a saver picks between, not variants
 * of "savings" to be averaged or best-of'd away.
 */
function SavingsTable({ rows }: { rows: RateRow[] }) {
  const categories = SAVINGS_CATEGORY_ORDER.filter((c) => rows.some((r) => categorizeSavings(r.notes) === c));
  const [activeCategory, setActiveCategory] = useState<SavingsCategory | undefined>(categories[0]);

  if (rows.length === 0 || categories.length === 0) {
    return <p className="px-6 py-8 text-sm text-neutral-400">No savings account data available yet.</p>;
  }

  const category = activeCategory && categories.includes(activeCategory) ? activeCategory : categories[0];
  const lines = buildFullRateLines(
    rows.filter((r) => categorizeSavings(r.notes) === category),
    (r) => r.notes ?? "Savings Account",
    false
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2 px-6 pt-4">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCategory(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              category === c ? "bg-blue-600 text-white" : "bg-white/10 text-neutral-300 hover:bg-white/20"
            }`}
          >
            {SAVINGS_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <SingleRateTable lines={lines} rateColumnLabel="Rate" lowerIsBetter={false} />
    </div>
  );
}

/**
 * Loan sub-tabs (Housing/Personal/Leasing/Education/Pawning/Overdraft) —
 * same idea as SavingsTable: these are genuinely different loan products,
 * not variants of "a loan" to collapse into one row per bank.
 */
function LoanTable({ rows }: { rows: RateRow[] }) {
  const types = LOAN_PRODUCT_TYPES.filter((t) => rows.some((r) => r.product_type === t));
  // Inferred (not explicitly annotated as LendingProductType) so it stays the same
  // "every lending type but card" union TS narrows `types` itself to via the filter above —
  // an explicit wider annotation here would make types.includes(activeType) a type error.
  const [activeType, setActiveType] = useState(types[0]);

  if (rows.length === 0 || types.length === 0) {
    return (
      <p className="px-6 py-8 text-sm text-neutral-400">
        No loan rate data available yet — many banks only quote these individually rather than publishing a flat rate.
      </p>
    );
  }

  const type = activeType && types.includes(activeType) ? activeType : types[0];
  const lines = buildFullRateLines(
    rows.filter((r) => r.product_type === type),
    (r) => r.notes ?? LENDING_PRODUCT_LABELS[type],
    true
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2 px-6 pt-4">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              type === t ? "bg-blue-600 text-white" : "bg-white/10 text-neutral-300 hover:bg-white/20"
            }`}
          >
            {LENDING_PRODUCT_LABELS[t]}
          </button>
        ))}
      </div>
      <SingleRateTable lines={lines} rateColumnLabel="Rate" lowerIsBetter />
    </div>
  );
}
