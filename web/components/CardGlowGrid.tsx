/**
 * components/CardGlowGrid.tsx
 *
 * Drives the `.glow-card` cursor-light effect (globals.css) for every
 * HoverGlowCard nested anywhere inside it. Tracks the pointer across this
 * whole wrapped area — which may contain several separately-laid-out card
 * grids (e.g. TopRatesToday's headline pair plus its two rows of small
 * cards below) — rather than each card's own mouseenter/leave, so a card
 * the cursor is merely near, even in an adjacent row, still lights up,
 * fading out with distance. That's what makes several adjacent cards glow
 * at once instead of only the one directly under the pointer.
 *
 * Pure CSS-variable pushing — no animation library — so this stays a
 * small Client Component while the cards it wraps (passed as children)
 * stay server-rendered.
 */
'use client';

import { useRef } from "react";

/** Distance (px) from a card's edge within which its glow is fully on. */
const PROXIMITY = 110;
/** Distance (px) beyond which a card's glow has faded to nothing. */
const FADE_DISTANCE = 260;

interface Props {
  children: React.ReactNode;
}

export default function CardGlowGrid({ children }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const grid = gridRef.current;
    if (!grid) return;

    grid.querySelectorAll<HTMLElement>(".glow-card").forEach((card) => {
      const rect = card.getBoundingClientRect();
      const relativeX = ((e.clientX - rect.left) / rect.width) * 100;
      const relativeY = ((e.clientY - rect.top) / rect.height) * 100;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.max(0, Math.hypot(e.clientX - centerX, e.clientY - centerY) - Math.max(rect.width, rect.height) / 2);

      let intensity = 0;
      if (distance <= PROXIMITY) intensity = 1;
      else if (distance <= FADE_DISTANCE) intensity = (FADE_DISTANCE - distance) / (FADE_DISTANCE - PROXIMITY);

      card.style.setProperty("--glow-x", `${relativeX}%`);
      card.style.setProperty("--glow-y", `${relativeY}%`);
      card.style.setProperty("--glow-intensity", intensity.toString());
    });
  }

  function handleMouseLeave() {
    gridRef.current?.querySelectorAll<HTMLElement>(".glow-card").forEach((card) => {
      card.style.setProperty("--glow-intensity", "0");
    });
  }

  return (
    <div ref={gridRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      {children}
    </div>
  );
}
