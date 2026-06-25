/**
 * components/BenchmarkBadge.tsx
 *
 * Inline badge comparing a bank rate against a CBSL benchmark.
 *
 * Shows whether the rate is above or below the CBSL average (AWFDR) and
 * flags rates that are at or near the legal deposit rate cap. This visual
 * comparison is the headline differentiator of SaveRateLK.
 *
 * "Near cap" threshold: within 0.25 percentage points of the cap.
 */

interface Props {
  rate:     number;  // the bank's rate as a percentage
  awfdr:    number;  // CBSL Average Weighted Fixed Deposit Rate
  cap:      number;  // CBSL maximum allowed deposit rate
}

const NEAR_CAP_MARGIN = 0.25;

export default function BenchmarkBadge({ rate, awfdr, cap }: Props) {
  const diff        = rate - awfdr;
  const aboveAvg    = diff >= 0;
  const nearCap     = rate >= cap - NEAR_CAP_MARGIN;
  const diffLabel   = `${aboveAvg ? "+" : ""}${diff.toFixed(2)}% vs avg`;

  return (
    <span className="inline-flex gap-1 items-center">
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          aboveAvg
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
        }`}
      >
        {diffLabel}
      </span>

      {nearCap && (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
          Near cap
        </span>
      )}
    </span>
  );
}
