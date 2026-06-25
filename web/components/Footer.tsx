/**
 * components/Footer.tsx
 *
 * Site footer — replaces the old single copyright line in app/layout.tsx
 * with something that actually orients a visitor who scrolls all the
 * way down: the brand mark + a one-line description, a few quick links
 * back into the homepage's own sections (mirroring Nav, since the site
 * has no other pages to link to), the "Contact us" popup (ContactModal),
 * and finally the legal/data-source line plus a "Made with care" credit.
 *
 * Reads CONTACT_EMAIL server-side and passes it down as a prop rather
 * than having ContactModal read it itself, since that's a Client
 * Component and plain (non-NEXT_PUBLIC_) env vars aren't available in
 * the browser.
 *
 * Two separate link sets, like Nav/MobileTabBar: desktop's carries a
 * `#id` hash to scroll-to-anchor on the one continuous page; mobile's
 * carries none, since landing on a section's hash anchor scrolls past
 * whatever sits above it within that section (e.g. CategoryPills, which
 * comes before #rates-table) instead of the section's actual top — for
 * mobile's tab-switch model, `?tab=` alone (plus Next's default
 * scroll-to-top-on-navigation) is what gets it right.
 */

import Link from "next/link";
import ContactModal from "@/components/ContactModal";

const QUICK_LINKS_DESKTOP = [
  { href: "/?tab=top#top", label: "Top" },
  { href: "/?tab=rates#rates-table", label: "Rates" },
  { href: "/?tab=calculator#calculator", label: "Calculator" },
  { href: "/?tab=about#about", label: "About" },
];

const QUICK_LINKS_MOBILE = [
  { href: "/?tab=top", label: "Top" },
  { href: "/?tab=rates", label: "Rates" },
  { href: "/?tab=calculator", label: "Calculator" },
  { href: "/?tab=about", label: "About" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black px-4 pb-24 pt-10 text-sm text-neutral-400 md:pb-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-sm">
            <div className="flex items-center text-lg font-extrabold text-white">
              % <span className="pl-2 text-red-500">Save</span><span className="text-blue-500">Rate</span>LK
            </div>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              Comparing fixed deposit, savings, credit card, and loan interest
              rates from Sri Lanka&apos;s major banks, refreshed daily.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm md:hidden">
            {QUICK_LINKS_MOBILE.map((link) => (
              <Link key={link.href} href={link.href} className="text-neutral-400 transition-colors hover:text-white">
                {link.label}
              </Link>
            ))}
          </nav>
          <nav className="hidden flex-wrap gap-x-6 gap-y-2 text-sm md:flex">
            {QUICK_LINKS_DESKTOP.map((link) => (
              <Link key={link.href} href={link.href} className="text-neutral-400 transition-colors hover:text-white">
                {link.label}
              </Link>
            ))}
          </nav>

          <ContactModal contactEmail={process.env.CONTACT_EMAIL ?? "contact@saveratelk.com"} />
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} SaveRateLK · rates are indicative — always confirm with your bank.</span>
          <span>Data sourced from each bank&apos;s official published pages.</span>
        </div>

        <p className="mt-3 text-center text-xs text-neutral-600 sm:text-left">
          Made with care in Sri Lanka.
        </p>
      </div>
    </footer>
  );
}
