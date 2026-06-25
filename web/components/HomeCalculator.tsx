/**
 * components/HomeCalculator.tsx
 *
 * The site's only calculator — embedded directly on the homepage (after
 * the rate table's history graphs) rather than living on its own
 * /calculator page, so a visitor can estimate returns without leaving the
 * page. The "Calculator" nav link scrolls here via the #calculator anchor
 * (see CategoryFlatTable) instead of navigating to a separate route.
 *
 * Maturity-value math lives in lib/calculator.ts. Styled to match the
 * "Top rates today" highlighted cards: dark glass card, blue accent, and
 * the same cursor-light hover effect (HoverGlowCard/CardGlowGrid) those
 * cards use.
 *
 * Client Component: all calculation happens in the browser from the rate
 * list passed in as a prop (fetched server-side, so no extra round trip).
 */

"use client";

import { useMemo, useState } from "react";
import { RateRow } from "@/lib/db";
import { calculate, formatLkr } from "@/lib/calculator";
import { IconCalculator } from "@/components/icons";
import HoverGlowCard from "@/components/HoverGlowCard";
import CardGlowGrid from "@/components/CardGlowGrid";

interface Props {
  fdRates: RateRow[];
  savingsRates: RateRow[];
}

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50";
const labelClass = "mb-1 block text-sm font-medium text-neutral-300";

export default function HomeCalculator({ fdRates, savingsRates }: Props) {
  const [productType, setProductType] = useState<"fd" | "savings">("fd");
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [principal, setPrincipal] = useState(100000);

  const rates = productType === "fd" ? fdRates : savingsRates;
  const banks = useMemo(
    () => Array.from(new Map(rates.map((r) => [r.bank_code, r.bank_name])).entries()),
    [rates]
  );

  const [selectedBank, setSelectedBank] = useState<string>("");
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);

  const bankRows = useMemo(
    () => rates.filter((r) => r.bank_code === selectedBank),
    [rates, selectedBank]
  );
  const selectedRow = selectedRowIndex >= 0 ? bankRows[selectedRowIndex] : null;

  // Custom-rate inputs.
  const [customRate, setCustomRate] = useState(10);
  const [customTenureMonths, setCustomTenureMonths] = useState(12);
  const [customPayment, setCustomPayment] = useState<string>("at-maturity");

  const principalValid = principal > 0;

  const result = useMemo(() => {
    if (!principalValid) return null;

    if (!useCustomRate && selectedRow) {
      const tenureMonths = selectedRow.tenure_months ?? customTenureMonths;
      return calculate(
        principal,
        Number(selectedRow.interest_rate),
        selectedRow.annual_effective_rate != null ? Number(selectedRow.annual_effective_rate) : null,
        tenureMonths,
        selectedRow.interest_payment
      );
    }

    if (useCustomRate && customRate > 0 && customTenureMonths > 0) {
      return calculate(principal, customRate, null, customTenureMonths, customPayment);
    }

    return null;
  }, [useCustomRate, selectedRow, principal, principalValid, customRate, customTenureMonths, customPayment]);

  return (
    <CardGlowGrid>
      <HoverGlowCard
        glowColor="59, 130, 246"
        className="relative overflow-hidden rounded-2xl border border-blue-500/60 bg-blue-500/2 p-6 backdrop-blur-sm"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <IconCalculator className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-white">Calculate your returns</h2>
            <p className="text-sm text-neutral-400">Estimate what a deposit or savings balance grows to at maturity.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="flex overflow-hidden rounded-lg border border-white/10 text-sm">
            {(["fd", "savings"] as const).map((pt) => (
              <button
                key={pt}
                onClick={() => {
                  setProductType(pt);
                  setSelectedBank("");
                  setSelectedRowIndex(-1);
                }}
                className={`px-3 py-1.5 transition-colors ${
                  productType === pt ? "bg-blue-600 text-white" : "bg-white/5 text-neutral-300 hover:bg-white/10"
                }`}
              >
                {pt === "fd" ? "Fixed Deposit" : "Savings"}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={useCustomRate}
              onChange={(e) => setUseCustomRate(e.target.checked)}
              className="accent-blue-500"
            />
            Use a custom rate instead of a real bank rate
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Deposit amount (LKR)</label>
            <input
              type="number"
              min={0}
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value))}
              className={inputClass}
            />
          </div>

          {!useCustomRate ? (
            <>
              <div>
                <label className={labelClass}>Bank</label>
                <select
                  value={selectedBank}
                  onChange={(e) => {
                    setSelectedBank(e.target.value);
                    setSelectedRowIndex(-1);
                  }}
                  className={inputClass}
                >
                  <option value="">Select a bank…</option>
                  {banks.map(([code, name]) => (
                    <option key={code} value={code} className="bg-neutral-900">{name}</option>
                  ))}
                </select>
              </div>

              {selectedBank && (
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {productType === "fd" ? "Tenure & payment frequency" : "Savings product"}
                  </label>
                  <select
                    value={selectedRowIndex}
                    onChange={(e) => setSelectedRowIndex(Number(e.target.value))}
                    className={inputClass}
                  >
                    <option value={-1}>Select…</option>
                    {bankRows.map((row, i) => (
                      <option key={i} value={i} className="bg-neutral-900">
                        {productType === "fd"
                          ? `${row.tenure_months} months – ${row.interest_payment ?? "at maturity"} – ${Number(row.interest_rate).toFixed(2)}%`
                          : `${row.notes ?? "Savings"} – ${Number(row.interest_rate).toFixed(2)}%`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className={labelClass}>Annual interest rate (%)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={customRate}
                  onChange={(e) => setCustomRate(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Term (months)</label>
                <input
                  type="number"
                  min={1}
                  value={customTenureMonths}
                  onChange={(e) => setCustomTenureMonths(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Interest payment</label>
                <select
                  value={customPayment}
                  onChange={(e) => setCustomPayment(e.target.value)}
                  className={inputClass}
                >
                  <option value="at-maturity" className="bg-neutral-900">At maturity</option>
                  <option value="monthly" className="bg-neutral-900">Monthly</option>
                  <option value="quarterly" className="bg-neutral-900">Quarterly</option>
                  <option value="semi-annually" className="bg-neutral-900">Semi-annually</option>
                  <option value="annually" className="bg-neutral-900">Annually</option>
                </select>
              </div>
            </>
          )}
        </div>

        {result && (
          <div className="mt-5 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
            <div>
              <div className="text-xs text-neutral-500">Estimated value at maturity</div>
              <div className="text-2xl font-extrabold text-blue-400">LKR {formatLkr(result.maturityValue)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Total interest earned</div>
              <div className="text-2xl font-extrabold text-neutral-200">LKR {formatLkr(result.totalInterest)}</div>
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-neutral-500">
          Estimate only. Assumes interest paid out at a fixed frequency is
          withdrawn rather than reinvested, and that &ldquo;at maturity&rdquo; interest
          compounds annually at the published AER. Actual bank calculations
          may differ slightly — confirm with the bank before depositing.
        </p>
      </HoverGlowCard>
    </CardGlowGrid>
  );
}
