/**
 * components/Hero.tsx
 *
 * Full-bleed hero banner, a background photo with a dark gradient overlay
 * (so text and whatever's passed in as `children` stay readable
 * regardless of what's in the image underneath), shared by the homepage
 * and the About page so both read as the same site rather than different
 * templates. `min-h-screen` gives it a stable floor: without it, a page
 * with shorter `children` (About) makes this section shorter, and since
 * the photo is `object-cover` inside it, a shorter section means a more
 * tightly cropped, oddly-framed slice of the same image. The floor
 * keeps the crop consistent no matter what's rendered below the
 * headline. Content taller than the screen (homepage's cards, About's
 * bank list) still grows the section past that floor as normal.
 *
 * `id="top"` is Nav's scrollspy anchor for the homepage's "Top" button.
 * Also carries a large "SaveRateLK" wordmark above the "Updated" badge.
 * the small brand mark in MobileTopBar/SiteHeader is just for orientation
 * while scrolled elsewhere, this is the real one.
 *
 * The content padding-top is smaller on mobile (`pt-20`) than desktop
 * (`md:pt-32`): desktop's floating nav pill needs more clearance than
 * mobile's plain top bar does, and using the desktop value everywhere
 * left mobile with a large dead gap of pure background photo above the
 * "Updated" badge.
 *
 * Escapes the page's centered max-w-6xl container with the
 * `left-1/2 -mx-[50vw] w-screen` full-bleed trick rather than changing the
 * shared layout's <main> wrapper, so every other page keeps its normal
 * centered padding untouched. Also cancels out that <main>'s top padding
 * with `-mt-16` (clearing the fixed, floating nav pill) so the image
 * still starts flush at y=0 instead of leaving a band of plain page
 * background above it. Every other page keeps that top padding so its
 * content clears the fixed nav.
 *
 * Plain presentational component, no hooks of its own.
 */

import Image from "next/image";

interface Props {
  updatedLabel: string;
  bankCount: number;
  children?: React.ReactNode;
}

export default function Hero({ updatedLabel, bankCount, children }: Props) {
  return (
    <section id="top" className="relative left-1/2 -mx-[50vw] -mt-16 min-h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">
        <Image src="/hero-bg.jpg" alt="" fill priority className="object-cover" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/80 to-black" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-20 md:pt-32">
        <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-neutral-300">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          Updated {updatedLabel}
        </span>
        <div className="mt-5 flex items-center text-2xl font-extrabold text-white sm:text-6xl">
          % <span className="pl-2 text-red-500">Save</span><span className="text-blue-500">Rate</span>LK
        </div>
        <h1 className="mt-2 max-w-4xl text-4xl font-extrabold leading-tight text-white sm:text-5xl">
          Compare every bank rate in Sri Lanka
        </h1>

        <p className="mt-4 max-w-xl text-base text-neutral-300">
          Fixed deposits, savings, credit cards &amp; loans
          {bankCount > 0 ? `, from ${bankCount} banks, updated daily.` : ", updated daily."}
        </p>

        {children}
      </div>
    </section>
  );
}
