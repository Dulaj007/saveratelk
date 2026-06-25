/**
 * components/AboutSection.tsx
 *
 * The same About copy (AboutContent) shown directly on the homepage,
 * right after the calculator, instead of a separate page. Nav's "About"
 * pill scrolls here (#about) rather than navigating away, so the whole
 * site reads as one continuous page. (The standalone /about route still
 * exists for anyone who lands on or shares that URL directly.)
 *
 * Gets its own full-bleed background photo, distinct from Hero's, faded
 * in via IntersectionObserver once scrolled into view rather than
 * visible from page load. A static background wouldn't read as a
 * "reveal" since this section starts well below the fold.
 *
 * Client Component: IntersectionObserver needs the browser.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Bank } from "@/lib/db";
import AboutContent from "@/components/AboutContent";

interface Props {
  banks: Bank[];
}

export default function AboutSection({ banks }: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-15% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      id="about"
      ref={sectionRef}
      className="relative left-1/2 -mx-[50vw] -mt-16 w-screen scroll-mt-24 overflow-hidden md:mt-0"
    >
      <div className="absolute inset-0">
        <Image
          src="/about-bg.jpg"
          alt=""
          fill
          sizes="100vw"
          className={`object-cover transition-opacity duration-[1500ms] ${visible ? "opacity-60" : "opacity-0"}`}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/55 to-black" />
      </div>

      {/* Less top padding on mobile than desktop's py-20, since this is its
          own isolated tab screen there (HomeRatesSection's tabClass),
          starting right under MobileTopBar. pt-14 (56px) clears the top
          bar's own height (h-12, 48px) with a little room to spare; the
          outer div's `-mt-16 md:mt-0` above cancels out <main>'s top
          padding so the background photo itself starts flush at the very
          top, with this inner padding controlling where the heading sits
          relative to the fixed bar above it. */}
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 md:py-20">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">About SaveRateLK</h2>
        <div className="mt-6">
          <AboutContent banks={banks} />
        </div>
      </div>
    </div>
  );
}
