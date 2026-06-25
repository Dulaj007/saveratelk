/**
 * components/HomeRatesSection.tsx
 *
 * Owns two pieces of client state the homepage needs:
 *  - `category`: which of the four hero pills (Fixed Deposits / Savings /
 *    Credit Cards / Loans) is selected, driving both the pill's own
 *    highlighted state (inside Hero) and which flat table
 *    CategoryFlatTable renders.
 *  - `tab` (read from the URL's `?tab=` query, not local state): on
 *    mobile, which of the four sections — Top / Rates / Calculator /
 *    About — is shown as its own full screen, app-style, instead of one
 *    continuous scroll. MobileTabBar (the bottom nav) is what actually
 *    changes this, by linking to `/?tab=rates` etc.
 *  - On desktop (`md:` and up) `tab` is ignored entirely — every section
 *    renders unconditionally and Nav's floating top pill scrollspies
 *    between them as before. `tabClass()` is the one-line trick that
 *    makes this work without two separate render paths: hidden/block
 *    based on the active tab at the base (mobile) breakpoint, forced
 *    back to `block` at `md:` regardless of which tab is "active".
 *
 * Hero, TopRatesToday, CategoryPills, and CategoryFlatTable are all plain
 * presentational components, not Server Components, since they need to
 * live inside this Client Component tree — but none of them do any data
 * fetching itself; all rows are computed once on the server in
 * app/page.tsx and passed down as props.
 *
 * TopRatesToday is rendered as Hero's children (not a sibling after it) so
 * its cards sit over the tail end of the hero photo/gradient rather than
 * starting fresh on the plain page background below.
 */

"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bank, RateRow, HistoryRow } from "@/lib/db";
import { CategoryKey } from "@/lib/categories";
import Hero from "@/components/Hero";
import TopRatesToday from "@/components/TopRatesToday";
import CategoryPills from "@/components/CategoryPills";
import CategoryFlatTable from "@/components/CategoryFlatTable";
import HomeCalculator from "@/components/HomeCalculator";
import AboutSection from "@/components/AboutSection";

interface Props {
  updatedLabel:    string;
  bankCount:       number;
  banks:           Bank[];
  fdRates:         RateRow[];
  savingsRates:    RateRow[];
  lendingRates:    RateRow[];
  cardRates:       RateRow[];
  loanRates:       RateRow[];
  fdHistory:       HistoryRow[];
  savingsHistory:  HistoryRow[];
  cardHistory:     HistoryRow[];
  loanHistory:     HistoryRow[];
}

type MobileTab = "top" | "rates" | "calculator" | "about";

/**
 * Below `md:`, visible only when it's the active mobile tab; at `md:` and
 * up, always visible. `pb-16` only matters on mobile, where each tab is
 * its own isolated screen — without it, whatever's at the bottom of the
 * active section (e.g. the calculator card) runs straight into Footer
 * with no breathing room.
 */
function tabClass(active: boolean): string {
  return `${active ? "block" : "hidden md:block"} pb-0 md:pb-0`;
}

export default function HomeRatesSection({
  updatedLabel, bankCount, banks, fdRates, savingsRates, lendingRates, cardRates, loanRates,
  fdHistory, savingsHistory, cardHistory, loanHistory,
}: Props) {
  const [category, setCategory] = useState<CategoryKey>("fd");
  const tab = (useSearchParams().get("tab") as MobileTab | null) ?? "top";

  return (
    <>
      <div className={tabClass(tab === "top")}>
        <Hero updatedLabel={updatedLabel} bankCount={bankCount}>
          <TopRatesToday fdRates={fdRates} savingsRates={savingsRates} lendingRates={lendingRates} />
        </Hero>
      </div>

      <div className={tabClass(tab === "rates")}>
        <div className="relative">
          {/* Fades from solid black (matching Hero's own ending color) down to
              transparent, so AuroraBackground's glow blobs ease into view
              instead of snapping on the instant Hero's opaque section ends.
              Desktop only — on mobile this tab is its own isolated screen
              with no preceding Hero to fade from, so it just reads as a
              stray dark band sitting on top of nothing. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 -mx-[50vw] hidden h-48 w-screen bg-gradient-to-b from-black to-transparent z-0 md:block"
          />

          <CategoryPills category={category} onCategoryChange={setCategory} />

          <CategoryFlatTable
            category={category}
            fdRows={fdRates}
            savingsRows={savingsRates}
            cardRows={cardRates}
            loanRows={loanRates}
            fdHistory={fdHistory}
            savingsHistory={savingsHistory}
            cardHistory={cardHistory}
            loanHistory={loanHistory}
            bankCount={bankCount}
          />
        </div>
      </div>

      <div id="calculator" className={`${tabClass(tab === "calculator")} scroll-mt-24`}>
        <HomeCalculator fdRates={fdRates} savingsRates={savingsRates} />
      </div>

      <div className={tabClass(tab === "about")}>
        {/* Overlaps whatever came before it (negative margin, not absolute,
            so it doesn't push AboutSection down) with a fade that's solid
            black at the seam and transparent above it — masks the hard
            line where the previous section's background meets
            AboutSection's own solid-black starting color. Desktop only —
            on mobile this tab is its own isolated screen with nothing
            above it to mask, so it just reads as a stray dark band. */}
        <div
          aria-hidden="true"
          className="pointer-events-none relative left-1/2 -mx-[50vw] hidden -mt-32 h-32 w-screen bg-gradient-to-t from-black to-transparent z-0 md:block"
        />

        <AboutSection banks={banks} />
      </div>
    </>
  );
}
