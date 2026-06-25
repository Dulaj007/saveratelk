/**
 * components/icons.tsx
 *
 * Small hand-rolled line-icon set, one per rate category, so the "Today's
 * Best Rates" cards (and anywhere else a category needs a glance-able
 * identity) can be read by shape instead of by reading a text label first.
 * Deliberately not an icon library: nine simple stroke paths don't
 * justify a new dependency, and keeping them inline matches how
 * ThemeToggle's sun/moon icons are already done in this project.
 *
 * All icons share one visual language (24x24, currentColor stroke, round
 * caps/joins) so swapping between them never looks like a style mismatch.
 */

interface IconProps {
  className?: string;
}

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Fixed Deposit, a locked-in rate, shown as a percent sign. */
export function IconPercent({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="7" cy="7" r="2.25" />
      <circle cx="17" cy="17" r="2.25" />
      <path d="M17 7L7 17" />
    </svg>
  );
}

/** Savings: growth over time. */
export function IconTrendingUp({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

/** Credit Card. */
export function IconCard({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10.5h18" />
      <path d="M6.5 15h4" />
    </svg>
  );
}

/** Housing Loan. */
export function IconHome({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 11.5L12 4l8.5 7.5" />
      <path d="M5.5 9.8V19a1 1 0 0 0 1 1h4v-6h3v6h4a1 1 0 0 0 1-1V9.8" />
    </svg>
  );
}

/** Personal Loan, a wallet. */
export function IconWallet({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
      <rect x="3.5" y="9.5" width="17" height="9.5" rx="2" />
      <circle cx="16" cy="14.25" r="1.25" />
    </svg>
  );
}

/** Leasing / Vehicle Loan, a car. */
export function IconCar({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 16l1.3-4.6A2 2 0 0 1 7.7 10h8.6a2 2 0 0 1 1.9 1.4l1.3 4.6" />
      <rect x="3" y="16" width="18" height="3.2" rx="1.2" />
      <circle cx="7.5" cy="19.2" r="1.4" />
      <circle cx="16.5" cy="19.2" r="1.4" />
    </svg>
  );
}

/** Education Loan, a graduation cap. */
export function IconCap({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4l9.5 4.6L12 13.2 2.5 8.6 12 4z" />
      <path d="M6.5 10.8v4.4c0 1.4 2.46 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4.4" />
    </svg>
  );
}

/** Pawning / Gold Loan, a gem. */
export function IconGem({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3.5h12l4 5.5L12 20.5 2 9z" />
      <path d="M2 9h20M9 3.5l3 5.5-3 11M15 3.5l-3 5.5 3 11" />
    </svg>
  );
}

/** Overdraft: running below zero. */
export function IconMinusCircle({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  );
}

/** "This is the best one" marker, used instead of a text badge. */
export function IconStar({ className }: IconProps) {
  return (
    <svg {...base} fill="currentColor" stroke="none" className={className} viewBox="0 0 24 24">
      <path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.6 6.8L12 17.6l-6.2 3.4 1.6-6.8-5.2-4.7 6.9-.7L12 2.5z" />
    </svg>
  );
}

/** External-link glyph, replacing the "Official page ↗" text link. */
export function IconExternalLink({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14 4h6v6" />
      <path d="M20 4L10 14" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

/** Footer: Contact us, an envelope. */
export function IconMail({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5L12 13l8.5-6.5" />
    </svg>
  );
}

/** Nav: Rates, a simple bar chart. */
export function IconBarChart({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 19V10M12 19V5M19 19v-7" />
    </svg>
  );
}

/** Nav: Calculator. */
export function IconCalculator({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8" />
      <path d="M8.5 11.5h0M12 11.5h0M15.5 11.5h0M8.5 15h0M12 15h0M15.5 15h0" strokeWidth="2.4" />
    </svg>
  );
}

/** Nav: About. */
export function IconInfo({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h0" strokeWidth="2.4" />
      <path d="M11 11.5h1.3v5" />
    </svg>
  );
}

/** Mobile nav toggle: hamburger. */
export function IconMenu({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/** Mobile nav toggle: close. */
export function IconClose({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
