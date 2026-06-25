/**
 * components/CategoryPills.tsx
 *
 * The Fixed Deposits / Savings / Credit Cards / Loans switcher, split out
 * of Hero so it can sit below TopRatesToday on the page instead of inside
 * the hero image — selecting a pill changes which table
 * CategoryFlatTable renders further down.
 *
 * Plain presentational component — the selected-category state itself
 * lives in HomeRatesSection, the nearest shared ancestor.
 */

import { CATEGORIES, CategoryKey } from "@/lib/categories";

interface Props {
  category: CategoryKey;
  onCategoryChange: (key: CategoryKey) => void;
}

export default function CategoryPills({ category, onCategoryChange }: Props) {
  return (
    <div className=" flex flex-wrap gap-2 z-10 relative">
      {CATEGORIES.map((c) => (
        <button
          key={c.key}
          onClick={() => onCategoryChange(c.key)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            category === c.key
              ? "bg-blue-600 text-white"
              : "bg-white/10 text-neutral-200 hover:bg-white/20"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
