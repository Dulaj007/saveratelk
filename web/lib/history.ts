/**
 * lib/history.ts
 *
 * Pivots a flat list of (bank, rate, date) history rows into the shape
 * Recharts needs to draw one line per bank on a shared time axis: an
 * array of { date, [bankCode]: rate } points plus the list of banks
 * present. Used by FDRatesByTenure and SavingsByCategory to build the
 * multi-bank history chart shown inside each tenure/category sub-tab.
 *
 * Grouped by calendar day rather than the exact scrape timestamp, since
 * banks aren't all scraped at the same instant — aligning to "day" is
 * what makes their points fall on the same x-axis tick instead of each
 * bank fragmenting into its own sparse column. When a bank has more than
 * one reading on the same day (e.g. a savings or lending category with
 * several notes-variants for the same bank, or a retried scrape), the
 * *best* rate for that day wins rather than picking one arbitrarily —
 * same lowerIsBetter rule as RateTable, since a lending category's
 * "best" trend line should track the cheapest variant, not the most
 * expensive one.
 */

export interface ChartSeries {
  code: string;
  name: string;
}

export interface ChartPoint {
  date: string;
  [bankCode: string]: number | string;
}

export interface HistoryInput {
  bankCode:  string;
  bankName:  string;
  rate:      number;
  scrapedAt: Date;
}

function startOfDayMs(d: Date): number {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function pivotHistoryByBank(
  rows: HistoryInput[],
  lowerIsBetter = false
): { data: ChartPoint[]; series: ChartSeries[] } {
  const seriesMap = new Map<string, string>(); // bankCode -> bankName
  const byDay = new Map<number, Map<string, number>>(); // start-of-day ms -> bankCode -> rate

  for (const row of rows) {
    seriesMap.set(row.bankCode, row.bankName);

    const dayMs = startOfDayMs(row.scrapedAt);
    let dayRates = byDay.get(dayMs);
    if (!dayRates) {
      dayRates = new Map();
      byDay.set(dayMs, dayRates);
    }
    const existing = dayRates.get(row.bankCode);
    const better = existing === undefined || (lowerIsBetter ? row.rate < existing : row.rate > existing);
    if (better) {
      dayRates.set(row.bankCode, row.rate);
    }
  }

  const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);
  const data: ChartPoint[] = sortedDays.map((dayMs) => {
    const point: ChartPoint = { date: formatDay(dayMs) };
    for (const [code, rate] of byDay.get(dayMs)!) {
      point[code] = rate;
    }
    return point;
  });

  const series: ChartSeries[] = Array.from(seriesMap.entries()).map(([code, name]) => ({ code, name }));

  return { data, series };
}

export interface TenureHistoryInput {
  bankCode:        string;
  bankName:        string;
  tenureMonths:    number;
  interestPayment: string | null;
  rate:            number;
  scrapedAt:       Date;
}

/**
 * Pivots FD history into one line per tenure (e.g. 3/6/12-month) instead
 * of one line per bank — each day's point is the HIGHEST at-maturity rate
 * any bank published for that tenure that day, plus which bank gave it
 * (stashed under a sibling `t{tenure}__bank` key so the chart's tooltip
 * can name the bank behind the number). Used by the homepage's Fixed
 * Deposits chart, which compares tenures against each other rather than
 * banks against each other.
 */
export function pivotFdTenureBest(
  rows: TenureHistoryInput[],
  tenures: readonly number[]
): { data: ChartPoint[]; series: ChartSeries[] } {
  const byDay = new Map<number, Map<number, { rate: number; bankName: string }>>(); // start-of-day ms -> tenure -> best rate that day

  for (const row of rows) {
    if (!tenures.includes(row.tenureMonths)) continue;
    if (row.interestPayment != null && row.interestPayment !== "at-maturity") continue;

    const dayMs = startOfDayMs(row.scrapedAt);
    let dayBest = byDay.get(dayMs);
    if (!dayBest) {
      dayBest = new Map();
      byDay.set(dayMs, dayBest);
    }
    const existing = dayBest.get(row.tenureMonths);
    if (!existing || row.rate > existing.rate) {
      dayBest.set(row.tenureMonths, { rate: row.rate, bankName: row.bankName });
    }
  }

  const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);
  const data: ChartPoint[] = sortedDays.map((dayMs) => {
    const point: ChartPoint = { date: formatDay(dayMs) };
    const dayBest = byDay.get(dayMs)!;
    for (const tenure of tenures) {
      const best = dayBest.get(tenure);
      if (best) {
        point[`t${tenure}`] = best.rate;
        point[`t${tenure}__bank`] = best.bankName;
      }
    }
    return point;
  });

  const series: ChartSeries[] = tenures.map((t) => ({ code: `t${t}`, name: `${t} month` }));

  return { data, series };
}
