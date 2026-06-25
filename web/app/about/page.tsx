/**
 * app/about/page.tsx
 *
 * About page — what this site is, why it exists, and which banks it
 * covers (with a short blurb and a link to each, as a small bit of
 * promotion for them), ending with the disclaimer.
 *
 * Reuses Hero exactly as the homepage does (same background photo, same
 * headline/subtitle) so the page reads as a continuation of the same
 * site rather than a different template — only what comes after the
 * subtitle changes: instead of the "Top rates today" cards, this page's
 * own content fades in (.animate-rise-in) in that spot.
 *
 * The disclaimer used to also appear at the bottom of the homepage; it
 * now lives only here, since repeating it on every page added noise
 * without adding clarity.
 */

import type { Metadata } from "next";
import { getBanks, getCurrentRates } from "@/lib/db";
import { formatUpdatedDate } from "@/lib/format";
import Hero from "@/components/Hero";
import AboutContent from "@/components/AboutContent";

const TITLE = "About SaveRateLK – Methodology & Banks Covered";
const DESCRIPTION =
  "What SaveRateLK is, why it exists, and the Sri Lankan banks whose fixed deposit, savings, credit card, and loan rates it compares daily.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/about" },
  twitter: { title: TITLE, description: DESCRIPTION },
};

/** Revalidate page data once per day. */
export const revalidate = 86400;

export default async function AboutPage() {
  const [banks, fdRates] = await Promise.all([
    getBanks().catch(() => []),
    getCurrentRates("fd").catch(() => []),
  ]);

  return (
    <Hero updatedLabel={formatUpdatedDate([fdRates])} bankCount={banks.length}>
      <div className="animate-rise-in mt-10">
        <AboutContent banks={banks} />
      </div>
    </Hero>
  );
}
