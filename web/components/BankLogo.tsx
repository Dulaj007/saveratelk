/**
 * components/BankLogo.tsx
 *
 * Small branded mark shown next to a bank's name throughout the rate
 * tables and bank picker. Renders the bank's real logo (see lib/logos.ts,
 * fetched from each bank's own site) inside a white rounded chip so logos
 * with transparent backgrounds stay legible against any row color; falls
 * back to a colored initials monogram for banks lib/logos.ts has no entry
 * for (their site sits behind a bot-challenge that blocks a plain fetch).
 *
 * Server Component — purely presentational, no client state needed.
 */

import Image from "next/image";
import { BANK_LOGOS } from "@/lib/logos";

const MONOGRAM_COLORS = [
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
];

/** Deterministic color pick so the same bank always gets the same monogram color. */
function colorFor(code: string): string {
  let hash = 0;
  for (const ch of code) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length];
}

/** Up to two initials from a bank's name, skipping generic words like "Bank". */
function initialsFor(name: string): string {
  const skip = new Set(["of", "the", "and", "bank", "plc", "corporation", "banking"]);
  const words = name.replace(/[''""]/g, "").split(/\s+/).filter(Boolean);
  const significant = words.filter((w) => !skip.has(w.toLowerCase()));
  const pick = significant.length > 0 ? significant : words;
  return pick.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

interface Props {
  code: string;
  name: string;
  size?: number;
  /** Overrides `size` for just the width, for a non-square chip (e.g. a wider wordmark logo). */
  width?: number;
  /** Overrides `size` for just the height. */
  height?: number;
}

export default function BankLogo({ code, name, size = 32, width, height }: Props) {
  const src = BANK_LOGOS[code];
  const w = width ?? size;
  const h = height ?? size;

  if (!src) {
    return (
      <span
        style={{ width: w, height: h, fontSize: Math.max(10, Math.min(w, h) * 0.34) }}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg font-bold shadow-sm ${colorFor(code)}`}
      >
        {initialsFor(name)}
      </span>
    );
  }

  return (
    <span
      style={{ width: w, height: h }}
      className="relative inline-block shrink-0 overflow-hidden rounded-lg bg-white p-1.5 shadow-sm ring-1 ring-gray-200 transition-transform duration-150 hover:scale-105 dark:ring-neutral-700"
    >
      <Image src={src} alt={`${name} logo`} fill sizes={`${Math.max(w, h)}px`} className="object-contain" />
    </span>
  );
}
