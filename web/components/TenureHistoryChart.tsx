/**
 * components/TenureHistoryChart.tsx
 *
 * One line per FD tenure (3/6/12-month) on a shared time axis. The
 * Fixed Deposits category's history chart, showing how each tenure's
 * average rate across all banks has moved, rather than MultiBankHistoryChart's
 * one-line-per-bank view. Each tenure can be toggled off independently via
 * the pill buttons above the chart (not Recharts' built-in Legend, so the
 * "remove a line" interaction is an obvious clickable control rather than
 * a legend entry that happens to also toggle visibility).
 *
 * Rendered as a Client Component because Recharts requires the browser
 * DOM; the pivoted data/series arrays are computed server-side (see
 * lib/history.ts) and passed in as plain props.
 */

"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartPoint, ChartSeries } from "@/lib/history";

const LINE_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24"];

interface Props {
  data:   ChartPoint[];
  series: ChartSeries[];
  title?: string;
}

export default function TenureHistoryChart({ data, series, title }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  if (data.length === 0 || series.length === 0) {
    return <p className="text-sm text-neutral-500">No history data yet.</p>;
  }

  const isSparse = data.length < 5;

  function toggle(code: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  return (
    <div className="w-full">
      {title && <h3 className="mb-3 text-sm font-semibold text-neutral-300">{title}</h3>}

      <div className="mb-4 flex flex-wrap gap-2">
        {series.map((s, i) => {
          const isHidden = hidden.has(s.code);
          const color = LINE_COLORS[i % LINE_COLORS.length];
          return (
            <button
              key={s.code}
              onClick={() => toggle(s.code)}
              aria-pressed={!isHidden}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isHidden ? "border-white/10 text-neutral-500" : "border-white/20 text-neutral-200 bg-white/5"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: isHidden ? "#52525b" : color }} />
              {s.name}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#a3a3a3" }} />
          <YAxis
            domain={[(min: number) => min - 0.5, (max: number) => max + 0.5]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11, fill: "#a3a3a3" }}
            width={48}
          />
          <Tooltip
            formatter={(value, name, item) => {
              const bank = item?.dataKey != null ? item.payload?.[`${item.dataKey}__bank`] : undefined;
              return [`${Number(value).toFixed(2)}%${bank ? ` (${bank})` : ""}`, name];
            }}
            contentStyle={{ backgroundColor: "#171717", borderColor: "#404040", color: "#a3a3a3" }}
          />
          {series
            .filter((s) => !hidden.has(s.code))
            .map((s) => {
              const i = series.findIndex((x) => x.code === s.code);
              const color = LINE_COLORS[i % LINE_COLORS.length];
              return (
                <Line
                  key={s.code}
                  type="stepAfter"
                  dataKey={s.code}
                  name={s.name}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 2, strokeWidth: 0, fill: color }}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              );
            })}
        </LineChart>
      </ResponsiveContainer>

      {isSparse && (
        <p className="mt-2 text-xs text-neutral-500">
          Only {data.length} day{data.length === 1 ? "" : "s"} of history recorded so far. The trend will fill in as more daily scrapes come in.
        </p>
      )}
    </div>
  );
}
