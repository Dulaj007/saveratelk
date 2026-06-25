/**
 * app/bank/[code]/page.tsx
 *
 * Per-bank detail page.
 *
 * Displays the bank's current rates, each grouped into the same per-
 * tenure/per-category sub-tabs as the home page — and since FDRatesByTenure
 * and SavingsByCategory already chart whichever banks are passed in, here
 * that's just this one bank's trend line per sub-tab, replacing what used
 * to be a single standalone "12-month FD history" chart at the top of the
 * page with a chart in every sub-tab instead.
 *
 * The [code] segment matches the bank's short code (e.g. "hnb", "boc").
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBanks, getCurrentRates, getRateHistoryAll, Bank, RateRow, HistoryRow } from "@/lib/db";
import { LENDING_PRODUCT_TYPES } from "@/lib/productTypes";
import FDRatesByTenure from "@/components/FDRatesByTenure";
import SavingsByCategory from "@/components/SavingsByCategory";
import LendingRates from "@/components/LendingRates";
import BankLogo from "@/components/BankLogo";
import Disclaimer from "@/components/Disclaimer";

interface Props {
  params: Promise<{ code: string }>;
}

/**
 * Pre-generate pages for all active banks at build time.
 * Falls back to an empty list when the database is unreachable (e.g. local dev
 * without Postgres), in which case pages are generated on first request instead.
 */
export async function generateStaticParams() {
  try {
    const banks = await getBanks();
    return banks.map((b: Bank) => ({ code: b.code }));
  } catch {
    return [];
  }
}

/** Allow on-demand rendering for bank codes not pre-generated. */
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const banks = await getBanks();
  const bank  = banks.find((b) => b.code === code);
  if (!bank) return {};

  const title = `${bank.name} Interest Rates & History – SaveRateLK`;
  const description = `Track ${bank.name}'s fixed deposit and savings rates over time. Compare against the CBSL national average.`;
  const url = `/bank/${bank.code}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
    twitter: { title, description },
  };
}

export const revalidate = 86400;

export default async function BankPage({ params }: Props) {
  const { code } = await params;
  const banks    = await getBanks();
  const bank     = banks.find((b: Bank) => b.code === code);

  if (!bank) notFound();

  const [fdRates, savingsRates, fdHistory, savingsHistory, lendingByType, lendingHistoryByType] = await Promise.all([
    getCurrentRates("fd"),
    getCurrentRates("savings"),
    getRateHistoryAll("fd"),
    getRateHistoryAll("savings"),
    Promise.all(LENDING_PRODUCT_TYPES.map((type) => getCurrentRates(type).catch(() => []))),
    Promise.all(LENDING_PRODUCT_TYPES.map((type) => getRateHistoryAll(type).catch(() => []))),
  ]);

  const bankFdRates        = fdRates.filter((r: RateRow) => r.bank_code === code);
  const bankSavingsRates   = savingsRates.filter((r: RateRow) => r.bank_code === code);
  const bankFdHistory      = fdHistory.filter((h: HistoryRow) => h.bank_code === code);
  const bankSavingsHistory = savingsHistory.filter((h: HistoryRow) => h.bank_code === code);
  const bankLendingRates   = lendingByType.flat().filter((r: RateRow) => r.bank_code === code);
  const bankLendingHistory = lendingHistoryByType.flat().filter((h: HistoryRow) => h.bank_code === code);

  return (
    <div>
      <div className="flex items-center gap-3">
        <BankLogo code={bank.code} name={bank.name} size={56} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">{bank.name}</h1>
      </div>
      <p className="text-sm text-gray-500 mt-1 dark:text-neutral-400">
        Source:{" "}
        <a
          href={bank.rates_page_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          {bank.rates_page_url} ↗
        </a>
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-neutral-100">Current Fixed Deposit Rates</h2>
        <FDRatesByTenure rows={bankFdRates} history={bankFdHistory} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-neutral-100">Current Savings Rates</h2>
        <SavingsByCategory rows={bankSavingsRates} history={bankSavingsHistory} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-neutral-100">Loans & Cards</h2>
        <LendingRates rows={bankLendingRates} history={bankLendingHistory} />
      </section>

      <Disclaimer />
    </div>
  );
}
