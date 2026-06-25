/**
 * components/Nav.tsx
 *
 * Desktop nav: a small floating pill — Top / Rates / Calculator / About
 * — instead of a full-width header bar, for an app-like feel rather than
 * a website chrome. SiteHeader positions and hides/shows it on scroll;
 * this component owns which button is highlighted. Hidden below `md:` —
 * MobileTabBar is the equivalent for small screens, a bottom tab bar
 * with different (tap-to-switch-screens, not scroll) behavior, since
 * "scroll to an anchor on one long page" doesn't fit a phone screen the
 * way it does a desktop one.
 *
 * All four are same-page anchors into the homepage's own sections
 * (#top/#rates-table/#calculator/#about), so the whole site behaves like
 * one continuous scrolling page rather than separate routes — the
 * highlighted button on the homepage is whichever section the visitor
 * has scrolled to (a classic scrollspy: the last section whose top has
 * scrolled past the nav). The standalone /about route still exists for
 * direct links/sharing; landing there highlights About by pathname
 * instead, since none of the scroll sections exist on that page.
 *
 * Client Component: usePathname and the scroll listener both need the
 * browser.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconHome, IconBarChart, IconCalculator, IconInfo } from "@/components/icons";

const SECTION_IDS = ["top", "rates-table", "calculator", "about"];

const LINKS = [
  { id: "top", href: "/#top", label: "Top", icon: IconHome },
  { id: "rates-table", href: "/#rates-table", label: "Rates", icon: IconBarChart },
  { id: "calculator", href: "/#calculator", label: "Calculator", icon: IconCalculator },
  { id: "about", href: "/#about", label: "About", icon: IconInfo },
];

/** Last of SECTION_IDS whose element has scrolled at or above `offset` — the classic scrollspy rule. Homepage only. */
function useActiveSection(enabled: boolean): string {
  const [active, setActive] = useState(SECTION_IDS[0]);

  useEffect(() => {
    if (!enabled) return;

    function onScroll() {
      const offset = 96;
      let current = SECTION_IDS[0];
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) current = id;
      }
      setActive(current);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);

  return active;
}

export default function Nav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const activeSection = useActiveSection(isHome);

  return (
    <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1 shadow-lg shadow-black/40 backdrop-blur-xl md:flex">
      {LINKS.map(({ id, href, label, icon: Icon }) => {
        const active = isHome ? activeSection === id : id === "about" && pathname === "/about";
        return (
          <Link
            key={id}
            href={href}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-blue-600 text-white" : "text-neutral-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
