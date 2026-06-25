/**
 * components/TopRatesToday.tsx
 *
 * "Top rates today", one card per product category showing whichever
 * bank currently has the best deal, rendered as Hero's children so the
 * cards sit as frosted glass over the tail end of the hero photo instead
 * of on the plain page background. Best Fixed Deposit and Best Savings
 * Rate get their own wide red/blue cards since they're the two headline
 * numbers; every other category is a plain small card in two rows below.
 *
 * Both headline cards name the specific product the rate came from (an
 * FD's tenure, a savings account's tier/plan name) rather than just a bare
 * "X.XX% p.a." A fixed deposit's best rate is almost always its longest
 * tenure, and showing the number with no tenure attached reads as "the"
 * rate when it's really one specific term among eight.
 *
 * Always shows every category's best rate regardless of which hero pill
 * is active. Unlike the flat table further down the page, this section
 * doesn't filter by the selected category.
 *
 * Server Component, no client state needed.
 */

import Image from "next/image";
import { RateRow } from "@/lib/db";
import { LendingProductType } from "@/lib/productTypes";
import { TENURE_LABELS, isStandardTenure } from "@/lib/categorize";
import { BANK_LOGOS } from "@/lib/logos";
import HoverGlowCard from "@/components/HoverGlowCard";
import CardGlowGrid from "@/components/CardGlowGrid";
import {
  IconTrendingUp,
  IconCard,
  IconHome,
  IconWallet,
  IconCar,
  IconCap,
  IconGem,
  IconMinusCircle,
  IconBarChart,
} from "@/components/icons";

interface Props {
  fdRates:      RateRow[];
  savingsRates: RateRow[];
  lendingRates: RateRow[];
}

interface Highlight {
  title: string;
  row:   RateRow;
}

/** "5 Years FD", or a plain "{n}-month FD" fallback for non-standard tenures. */
function fdTenureLabel(row: RateRow): string | null {
  if (row.tenure_months == null) return null;
  return isStandardTenure(row.tenure_months) ? TENURE_LABELS[row.tenure_months] : `${row.tenure_months}-month FD`;
}

const LENDING_TITLES: Record<LendingProductType, string> = {
  card:           "Cheapest Credit Card",
  housing_loan:   "Cheapest Housing Loan",
  personal_loan:  "Cheapest Personal Loan",
  leasing:        "Cheapest Vehicle Lease",
  education_loan: "Cheapest Education Loan",
  pawning:        "Cheapest Pawning Rate",
  overdraft:      "Lowest Overdraft Rate",
};

const LOAN_TYPES: LendingProductType[] = ["housing_loan", "personal_loan", "leasing", "education_loan"];
const MORE_TYPES: LendingProductType[] = ["card", "pawning", "overdraft"];

const LENDING_ICONS: Record<LendingProductType, (props: { className?: string }) => React.ReactElement> = {
  card:           IconCard,
  housing_loan:   IconHome,
  personal_loan:  IconWallet,
  leasing:        IconCar,
  education_loan: IconCap,
  pawning:        IconGem,
  overdraft:      IconMinusCircle,
};

/**
 * The annualized rate to rank a row by. Some long-tenure FDs (e.g. a
 * 10-year term) publish `interest_rate` as a cumulative/total-term figure
 * rather than a per-annum one, which makes it look far higher than it
 * actually is. `annual_effective_rate` is the apples-to-apples number, so
 * prefer it whenever the bank module recorded one.
 */
function rankRate(row: RateRow): number {
  return Number(row.annual_effective_rate ?? row.interest_rate);
}

function bestRow(rows: RateRow[], lowerIsBetter: boolean): RateRow | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => {
    const better = lowerIsBetter
      ? rankRate(r) < rankRate(best)
      : rankRate(r) > rankRate(best);
    return better ? r : best;
  });
}

function lendingHighlight(rows: RateRow[], type: LendingProductType): Highlight | null {
  const best = bestRow(rows.filter((r) => r.product_type === type), true);
  return best ? { title: LENDING_TITLES[type], row: best } : null;
}

/** Faint bank logo tucked into a card's bottom-right corner; brightens only when the pointer is directly over the logo itself, not just the card. */
function CardLogo({ code }: { code: string }) {
  const src = BANK_LOGOS[code];
  if (!src) return null;
  return (
    <div className="absolute bottom-3 right-3 -z-10">
      <Image
        src={src}
        alt=""
        width={100}
        height={100}
        className="object-contain opacity-[0.07] grayscale transition-opacity duration-300 hover:opacity-[0.14]"
      />
    </div>
  );
}

function SmallCard({ h }: { h: Highlight }) {
  const Icon = LENDING_ICONS[h.row.product_type as LendingProductType];
  return (
    <HoverGlowCard
      glowColor="96, 165, 250"
      className="relative overflow-hidden rounded-2xl border border-white/10 p-5 backdrop-blur-sm"
    >
      <CardLogo code={h.row.bank_code} />
      <div className="flex items-start justify-between gap-2">
        {Icon && (
          <span className="inline-flex absolute right-4 top-3  items-center justify-center rounded-lg  text-blue-400 opacity-70">
            <Icon className="h-6 w-6" />
          </span>
        )}
      </div>
      <p className="mt-1  flex items-baseline gap-1">
        <span className="text-2xl font-extrabold text-blue-400">{Number(h.row.interest_rate).toFixed(2)}</span>
        <span className="text-lg font-bold text-blue-400">%</span>
        <span className="text-xs font-medium text-neutral-400">p.a.</span>
      </p>
      <p className="mt-1 text-sm text-neutral-300">{h.row.bank_name}</p>
       <p className="text-xs  text-neutral-500">{h.title}</p>
    </HoverGlowCard>
  );
}

export default function TopRatesToday({ fdRates, savingsRates, lendingRates }: Props) {
  // "Best Fixed Deposit" compares the 12-month/1-year tenure specifically. FDs of
  // different lengths aren't a fair head-to-head, and 1 year is the term savers
  // most commonly shop for.
  const oneYearFdRates = fdRates.filter((r) => r.tenure_months === 12);
  const bestFd = bestRow(oneYearFdRates.length > 0 ? oneYearFdRates : fdRates, false);
  const bestSavings = bestRow(savingsRates, false);
  const loans = LOAN_TYPES.map((type) => lendingHighlight(lendingRates, type)).filter((h): h is Highlight => h !== null);
  const more = MORE_TYPES.map((type) => lendingHighlight(lendingRates, type)).filter((h): h is Highlight => h !== null);

  if (!bestFd && !bestSavings && loans.length === 0 && more.length === 0) return null;

  return (
    <section className="mt-20">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-white">
            <IconBarChart className="h-5 w-5 text-blue-400" />
            Top rates today
          </h2>
          <p className="mt-1 text-sm text-neutral-400">The best rate in each category, refreshed daily.</p>
        </div>
     
      </div>

      <CardGlowGrid>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {bestFd && (
            <HoverGlowCard
              glowColor="239, 68, 68"
              className="relative overflow-hidden rounded-2xl border border-red-500/60 bg-red-500/2  p-5 backdrop-blur-sm"
            >
              <CardLogo code={bestFd.bank_code} />
              <div className="flex justify-end">
                <span className="inline-flex shrink-0 items-center rounded-full bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-300">
                  Best Fixed Deposit <IconTrendingUp className="ml-1 h-4 w-4" />
                </span>
              </div>

              <p className="mt-3 flex flex-wrap items-baseline gap-1.5">
                <span className="text-4xl font-extrabold text-red-500 sm:text-5xl">{Number(bestFd.interest_rate).toFixed(2)}</span>
                <span className="text-2xl font-bold text-red-500 sm:text-3xl">%</span>
                <span className="text-lg font-medium text-neutral-400 sm:text-xl">p.a.</span>
                {bestFd.annual_effective_rate != null && (
                  <span className="text-xs font-medium text-neutral-500">AER {Number(bestFd.annual_effective_rate).toFixed(2)}%</span>
                )}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div>
                  <p className="text-xl font-medium text-neutral-300">{bestFd.bank_name}</p>
                  <p className="text-sm text-neutral-500">
                    {fdTenureLabel(bestFd) ?? "Fixed Deposit"}
                    {bestFd.interest_payment === "monthly" && " · paid monthly"}
                  </p>
                </div>
              </div>
            </HoverGlowCard>
          )}

          {bestSavings && (
            <HoverGlowCard
              glowColor="59, 130, 246"
              className="relative overflow-hidden rounded-2xl border border-blue-500/60 bg-blue-500/2 p-5 backdrop-blur-sm"
            >
              <CardLogo code={bestSavings.bank_code} />
              <div className="flex justify-end">
                <span className="inline-flex shrink-0 items-center rounded-full bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-300">
                  Best Savings Rate <IconTrendingUp className="ml-1 h-4 w-4" />
                </span>
              </div>

              <p className="mt-3 flex flex-wrap items-baseline gap-1.5">
                <span className="text-4xl font-extrabold text-blue-500 sm:text-5xl">{Number(bestSavings.interest_rate).toFixed(2)}</span>
                <span className="text-2xl font-bold text-blue-500 sm:text-3xl">%</span>
                <span className="text-lg font-medium text-neutral-400 sm:text-xl">p.a.</span>
                {bestSavings.annual_effective_rate != null && (
                  <span className="text-xs font-medium text-neutral-500">AER {Number(bestSavings.annual_effective_rate).toFixed(2)}%</span>
                )}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div>
                  <p className="text-xl font-medium text-neutral-300">{bestSavings.bank_name}</p>
                  <p className="text-sm text-neutral-500">{bestSavings.notes ?? "Savings Account"}</p>
                </div>
              </div>
            </HoverGlowCard>
          )}
        </div>

        {loans.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {loans.map((h) => <SmallCard key={h.title} h={h} />)}
          </div>
        )}

        {more.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {more.map((h) => <SmallCard key={h.title} h={h} />)}
          </div>
        )}
      </CardGlowGrid>
    </section>
  );
}
