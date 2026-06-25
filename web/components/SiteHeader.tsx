/**
 * components/SiteHeader.tsx
 *
 * Positions Nav (the floating Top/Rates/Calculator/About pill) fixed near
 * the top of the viewport, centered, not a full-width bar, for an
 * app-like feel rather than a website header, and slides it smoothly
 * out of view on scroll-down, back in on scroll-up, the common
 * "auto-hide nav" pattern, so it doesn't permanently eat into the
 * viewport on long pages but is always one scroll-up away.
 *
 * No logo/brand bar or "Live"/CTA button here anymore, just the pill.
 *
 * Client Component: the scroll-direction tracking needs window/useEffect.
 * Hero.tsx still cancels out this being fixed (and so out of normal
 * flow) with a matching negative top margin, even though the pill itself
 * is small, so every other page's content still clears the same space.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import Nav from "@/components/Nav";

/** Ignore tiny scroll jitter (trackpad/momentum) below this many pixels. */
const SCROLL_DELTA_THRESHOLD = 6;

export default function SiteHeader() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastY.current;

      if (y < 60) {
        setHidden(false);
      } else if (Math.abs(delta) > SCROLL_DELTA_THRESHOLD) {
        setHidden(delta > 0);
      }
      lastY.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 top-4 z-50 flex justify-center transition-transform duration-300 ease-in-out ${
        hidden ? "-translate-y-24" : "translate-y-0"
      }`}
    >
      <Nav />
    </div>
  );
}
