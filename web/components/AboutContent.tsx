/**
 * components/AboutContent.tsx
 *
 * "What is this, why does it exist, which banks" copy. Written once here
 * so it can't drift apart between the standalone /about page and
 * AboutSection (the same content inlined directly on the homepage after
 * the calculator).
 *
 * Plain presentational component. Banks (with website links) are fetched
 * server-side and passed in; per-bank blurbs come from lib/bankInfo.ts.
 */

import { Bank } from "@/lib/db";
import { BANK_BLURBS } from "@/lib/bankInfo";
import BankLogo from "@/components/BankLogo";
import Disclaimer from "@/components/Disclaimer";
import HoverGlowCard from "@/components/HoverGlowCard";
import CardGlowGrid from "@/components/CardGlowGrid";

interface Props {
  banks: Bank[];
}

export default function AboutContent({ banks }: Props) {
  return (
    <div className="max-w-6xl space-y-10">
      <section>
        <h2 className="text-lg font-bold text-white">What SaveRateLK does</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          SaveRateLK collects fixed deposit, savings, credit card, and loan
          interest rates from Sri Lanka&apos;s major banks and puts them in
          one place. You can see who pays the best rate today without
          checking a dozen different bank websites.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white">Why it exists</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          Bank rates change often and are hard to compare. Each bank
          publishes its own rates in its own format, usually a few clicks
          into its own site. SaveRateLK puts every bank&apos;s numbers on
          one page, laid out the same way, updated daily from each
          bank&apos;s own published pages.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white">Banks covered</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          Rates are collected directly from the official pages of the
          banks below. Each one is a licensed Sri Lankan bank. Tap a bank
          to visit its website.
        </p>

        <CardGlowGrid>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {banks.map((bank) => (
              <HoverGlowCard
                key={bank.code}
                glowColor="59, 130, 246"
                className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm transition-colors hover:border-blue-500/40 hover:bg-white/[0.06]"
              >
                <a href={bank.website_url} target="_blank" rel="noopener noreferrer" className="block p-4">
                  <div className="flex items-center gap-3">
                    <BankLogo code={bank.code} name={bank.name} size={36} />
                    <span className="font-semibold text-white">{bank.name}</span>
                  </div>
                  {BANK_BLURBS[bank.code] && (
                    <p className="mt-2 text-xs leading-relaxed text-neutral-300">{BANK_BLURBS[bank.code]}</p>
                  )}
                </a>
              </HoverGlowCard>
            ))}
          </div>
        </CardGlowGrid>
      </section>

      <Disclaimer />
    </div>
  );
}
