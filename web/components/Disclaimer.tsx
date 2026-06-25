/**
 * components/Disclaimer.tsx
 *
 * Global indicative-rates disclaimer displayed on every page.
 *
 * Reminds visitors that rates shown are collected from publicly published
 * sources, may not reflect real-time changes, and must be confirmed directly
 * with the bank before any financial decision is made.
 */

export default function Disclaimer() {
  return (
    <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
      <strong>Disclaimer:</strong> All rates shown are collected from each
      bank&apos;s publicly published pages and are indicative only. Rates can
      change at any time without notice. Always confirm the current rate
      directly with your bank before making any financial decision. SaveRateLK
      is not affiliated with any bank listed on this site.
    </div>
  );
}
