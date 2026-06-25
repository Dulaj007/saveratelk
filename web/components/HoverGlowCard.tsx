/**
 * components/HoverGlowCard.tsx
 *
 * Marks a card as participating in the `.glow-card` cursor-light effect
 * (see globals.css) and pins its glow to a specific theme color via
 * --glow-color (an "r, g, b" channel triplet, not a full CSS color, since
 * the underlying gradient needs rgba(var(...), a)). The actual cursor
 * tracking, and lighting up cards the pointer is merely near, not just
 * the one directly under it, happens once per grid in CardGlowGrid, so
 * this wrapper itself needs no event handlers and stays server-renderable.
 */
interface Props {
  /** "r, g, b" channel triplet, e.g. "239, 68, 68" for red-500. */
  glowColor: string;
  className?: string;
  id?: string;
  children: React.ReactNode;
}

export default function HoverGlowCard({ glowColor, className, id, children }: Props) {
  return (
    <div id={id} className={`glow-card ${className ?? ""}`} style={{ "--glow-color": glowColor } as React.CSSProperties}>
      {children}
    </div>
  );
}
