/**
 * components/SplashScreen.tsx
 *
 * A brief full-screen splash shown on first load, before the rest of the
 * page is visible: the "%" mark pops in, the wordmark fades in beside it,
 * then the whole thing fades out and removes itself from the DOM.
 *
 * Client Component: it only needs to run once per page load in the
 * browser and has no effect on the server-rendered HTML underneath it.
 * Fixed minimum hold time rather than waiting on a real loading signal,
 * since the page itself is ISR-cached and already fast; this exists for
 * the brand moment, not to mask actual load time.
 */

"use client";

import { useEffect, useState } from "react";

const HOLD_MS = 700;
const FADE_MS = 400;

export default function SplashScreen() {
  const [stage, setStage] = useState<"visible" | "fading" | "done">("visible");

  useEffect(() => {
    const fadeTimer = setTimeout(() => setStage("fading"), HOLD_MS);
    const doneTimer = setTimeout(() => setStage("done"), HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (stage === "done") return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity duration-[400ms] ${
        stage === "fading" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex items-center text-3xl font-extrabold text-white sm:text-4xl">
        <span className="animate-splash-mark flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 sm:h-14 sm:w-14">
          %
        </span>
        <span className="animate-splash-word pl-3">
          <span className="text-red-500">Save</span>
          <span className="text-blue-500">Rate</span>LK
        </span>
      </div>
    </div>
  );
}
