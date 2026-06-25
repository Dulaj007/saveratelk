/**
 * app/page.tsx
 *
 * Home page, the main rate comparison view.
 *
 * Fetches the most recent rates for every active bank from the database
 * (server-side): Fixed Deposits and Savings directly, plus every lending
 * product type, split into credit cards and "loans" (housing/personal/
 * leasing/education/pawning/overdraft) to match the four categories shown
 * as hero pills. HomeRatesSection (a Client Component) owns which of those
 * four is selected and renders the matching flat table; everything above
 * it (the JSON-LD block, the hero image/headline, and the always-visible
 * "Top rates today" highlights) is plain server-rendered markup.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentRates, getRateHistoryAll, getBanks, RateRow } from "@/lib/db";
import { LENDING_PRODUCT_TYPES } from "@/lib/productTypes";
import { formatUpdatedDate } from "@/lib/format";
import HomeRatesSection from "@/components/HomeRatesSection";

const TITLE = "Fixed Deposit & Savings Rates in Sri Lanka – SaveRateLK";
const DESCRIPTION =
  "Compare today's fixed deposit, savings, loan and credit card interest rates from HNB, Commercial Bank, BOC, Seylan, NSB, and more. Updated daily from official bank sources.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/" },
  twitter: { title: TITLE, description: DESCRIPTION },
};

/** Revalidate page data once per day. */
export const revalidate = 86400;

export default async function HomePage() {
  const [fdRates, savingsRates, lendingByType, banks, fdHistory, savingsHistory, lendingHistoryByType] =
    await Promise.all([
      getCurrentRates("fd").catch(() => []),
      getCurrentRates("savings").catch(() => []),
      Promise.all(LENDING_PRODUCT_TYPES.map((type) => getCurrentRates(type).catch(() => []))),
      getBanks().catch(() => []),
      getRateHistoryAll("fd").catch(() => []),
      getRateHistoryAll("savings").catch(() => []),
      Promise.all(LENDING_PRODUCT_TYPES.map((type) => getRateHistoryAll(type).catch(() => []))),
    ]);

  const lendingRates = lendingByType.flat();
  const cardRates = lendingRates.filter((r) => r.product_type === "card");
  const loanRates = lendingRates.filter((r) => r.product_type !== "card");

  const lendingHistory = lendingHistoryByType.flat();
  const cardHistory = lendingHistory.filter((h) => h.product_type === "card");
  const loanHistory = lendingHistory.filter((h) => h.product_type !== "card");

  // Structured data lets search engines understand the FD rate table as a
  // list of financial products rather than opaque HTML, improving how rich
  // results can be shown for "fixed deposit rates" style queries. Kept
  // over the full rate list (not just the standard tenures shown on
  // screen) since there's no reason to withhold the extra data from search
  // engines just because the UI groups it for readability.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Fixed Deposit Interest Rates in Sri Lanka",
    itemListElement: fdRates.map((r: RateRow, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "FinancialProduct",
        name: `${r.bank_name} Fixed Deposit${r.tenure_months ? ` (${r.tenure_months} months)` : ""}`,
        provider: { "@type": "BankOrCreditUnion", name: r.bank_name },
        interestRate: Number(r.interest_rate),
        url: r.rates_page_url,
      },
    })),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* HomeRatesSection reads the ?tab= query (useSearchParams) to decide
          which section is the active mobile tab. That hook requires a
          Suspense boundary so the rest of this statically-generated page
          isn't forced into fully dynamic rendering. */}
      <Suspense>
        <HomeRatesSection
          updatedLabel={formatUpdatedDate([fdRates, savingsRates, lendingRates])}
          bankCount={banks.length}
          banks={banks}
          fdRates={fdRates}
          savingsRates={savingsRates}
          lendingRates={lendingRates}
          cardRates={cardRates}
          loanRates={loanRates}
          fdHistory={fdHistory}
          savingsHistory={savingsHistory}
          cardHistory={cardHistory}
          loanHistory={loanHistory}
        />
      </Suspense>
    </div>
  );
}
