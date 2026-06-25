/**
 * components/MobileTabBar.tsx
 *
 * Mobile equivalent of Nav: a bottom-fixed tab bar (Top / Rates /
 * Calculator / About) instead of the floating top pill, the standard
 * "app" pattern for small screens. Hidden at `md:` and up (Nav takes
 * over there).
 *
 * Unlike desktop's scrollspy (one continuous page, the active tab is
 * whichever section has scrolled into view), each tab here is its own
 * full screen: tapping one sets `?tab=` in the URL, and
 * HomeRatesSection's `tabClass()` shows only that section and hides the
 * rest below `md:`. So this is plain Link navigation, not a scroll
 * action. These hrefs deliberately carry no `#id` hash (unlike Nav's
 * and Footer's), since scrolling to the section's own anchor would land
 * past whatever sits above it inside that section (e.g. CategoryPills,
 * which comes before #rates-table) instead of at the section's actual
 * top. With no hash, Next's default "scroll to (0,0) on navigation"
 * behavior does the right thing on its own.
 *
 * Active state: on the homepage, whichever tab matches the current
 * `?tab=` (defaulting to "top"); on the standalone /about route,
 * About is active by pathname instead, since that page has no `?tab=`.
 *
 * Client Component: usePathname/useSearchParams need the browser.
 */

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IconHome, IconBarChart, IconCalculator, IconInfo } from "@/components/icons";

const TABS = [
  { id: "top", href: "/?tab=top", label: "Top", icon: IconHome },
  { id: "rates", href: "/?tab=rates", label: "Rates", icon: IconBarChart },
  { id: "calculator", href: "/?tab=calculator", label: "Calculator", icon: IconCalculator },
  { id: "about", href: "/?tab=about", label: "About", icon: IconInfo },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const activeTab = useSearchParams().get("tab") ?? "top";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-white/10 bg-black/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      {TABS.map(({ id, href, label, icon: Icon }) => {
        const active = isHome ? activeTab === id : id === "about" && pathname === "/about";
        return (
          <Link
            key={id}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
              active ? "text-blue-400" : "text-neutral-500"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
