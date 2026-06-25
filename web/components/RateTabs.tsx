/**
 * components/RateTabs.tsx
 *
 * Tab switcher used at two levels: the main rate views on the home page
 * (Fixed Deposits, Savings Accounts, Loans & Cards) and, nested one level
 * deeper inside Fixed Deposits/Savings Accounts, the per-tenure/per-
 * category sub-tabs (e.g. "1 Month FD", "Senior Citizens' Savings"). A
 * Client Component only for the tab-switching state. Each tab's content
 * is still rendered server-side by the page, so switching tabs is just a
 * visibility toggle, not a fresh data fetch.
 *
 * Takes a generic list of tabs rather than fixed named props so new tabs
 * don't require special-casing this component, and a `variant` so the
 * nested sub-tab level reads as visually subordinate to the main tabs
 * instead of repeating the same pill style twice.
 */

"use client";

import { useState } from "react";

export interface Tab {
  key:     string;
  label:   string;
  content: React.ReactNode;
}

interface Props {
  tabs:    Tab[];
  variant?: "pill" | "underline";
}

export default function RateTabs({ tabs, variant = "pill" }: Props) {
  const [active, setActive] = useState(tabs[0]?.key);

  if (variant === "underline") {
    return (
      <div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-gray-200 dark:border-neutral-800">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`-mb-px border-b-2 px-0.5 py-2 text-sm font-medium transition-colors ${
                active === tab.key
                  ? "border-green-700 text-green-700 dark:border-green-400 dark:text-green-400"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {tabs.map((tab) => (
          <div key={tab.key} className={active === tab.key ? "block mt-4" : "hidden"}>
            {tab.content}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-gray-200 bg-gray-50 p-1 dark:border-neutral-800 dark:bg-neutral-900">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
              active === tab.key
                ? "bg-green-700 text-white shadow-md"
                : "text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div key={tab.key} className={active === tab.key ? "block" : "hidden"}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
