/**
 * components/MultiBankHistoryChart.tsx
 *
 * One line per bank on a shared time axis, for the history chart shown
 * inside each FD-tenure / savings-category sub-tab. On the home page
 * that's every bank that has data for that tenure/category, and on a
 * per-bank detail page it naturally renders as a single line, since the
 * page already filtered the rows down to that one bank before pivoting.
 * Needs a fixed, distinguishable color per bank rather than a single
 * brand-green line, so colors are an explicit palette cycled by index
 * rather than the theme's CSS variables (those only carry one light/dark
 * pair, not enough distinct hues for up to ~11 banks).
 *
 * Lines are drawn as steps, not smooth curves: a published rate holds
 * flat until the day it actually changes, then jumps. A smooth diagonal
 * between two readings would imply the rate drifted continuously in
 * between, which isn't what happened and reads as a vague blur of
 * crossing lines rather than a clear up/down move on the day it occurred.
 *
 * A short flat-looking line here usually isn't a bug. It means the
 * scraper simply hasn't been running long enough yet to have recorded a
 * rate change. There's no public archive of "what was this bank's rate
 * last year" to backfill from (banks only ever publish today's number),
 * so real day-to-day variation can only build up the same way it's being
 * collected now: one more scrape at a time. A small note below the chart
 * says this explicitly rather than leaving a flat line looking broken.
 *
 * Rendered as a Client Component because Recharts requires the browser
 * DOM; the already-pivoted data/series arrays are computed server-side
 * (see lib/history.ts) and passed in as plain props.
 */

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartPoint, ChartSeries } from "@/lib/history";

const LINE_COLORS = [
  "#6366f1", "#f43f5e", "#f59e0b", "#14b8a6",
  "#8b5cf6", "#0ea5e9", "#84cc16", "#ec4899",
  "#f97316", "#06b6d4", "#10b981", "#a855f7",
];

interface Props {
  data:   ChartPoint[];
  series: ChartSeries[];
  title?: string;
}

export default function MultiBankHistoryChart({ data, series, title }: Props) {
  if (data.length === 0 || series.length === 0) {
    return <p className="text-gray-400 text-sm dark:text-neutral-500">No history data yet.</p>;
  }

  const isSparse = data.length < 5;

  return (
    <div className="w-full">
      {title && <h3 className="text-sm font-semibold text-gray-600 mb-2 dark:text-neutral-400">{title}</h3>}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--chart-text)" }} />
          <YAxis
            domain={[(min: number) => min - 0.5, (max: number) => max + 0.5]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11, fill: "var(--chart-text)" }}
            width={48}
          />
          <Tooltip
            formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
            contentStyle={{
              backgroundColor: "var(--chart-tooltip-bg)",
              borderColor: "var(--chart-tooltip-border)",
              color: "var(--chart-text)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "var(--chart-text)" }} />
          {series.map((s, i) => (
            <Line
              key={s.code}
              type="stepAfter"
              dataKey={s.code}
              name={s.name}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2, strokeWidth: 0, fill: LINE_COLORS[i % LINE_COLORS.length] }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {isSparse && (
        <p className="mt-2 text-xs text-gray-400 dark:text-neutral-500">
          Only {data.length} day{data.length === 1 ? "" : "s"} of history recorded so far. The trend will fill in as more daily scrapes come in.
        </p>
      )}
    </div>
  );
}
