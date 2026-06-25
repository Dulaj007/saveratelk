/**
 * lib/categories.ts
 *
 * The four top-level rate categories shown on the homepage hero pills and
 * used to pick which flat table CategoryFlatTable renders. Split out from
 * lib/productTypes.ts's seven lending types because the homepage groups
 * "Loans" (housing/personal/leasing/education/pawning/overdraft) together
 * and gives credit cards their own pill, matching how a saver actually
 * thinks about these products rather than the schema's product_type list.
 */

export type CategoryKey = "fd" | "savings" | "card" | "loan";

export const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "fd", label: "Fixed Deposits" },
  { key: "savings", label: "Savings" },
  { key: "card", label: "Credit Cards" },
  { key: "loan", label: "Loans" },
];

export const CATEGORY_TABLE_TITLES: Record<CategoryKey, string> = {
  fd: "Fixed deposit rates",
  savings: "Savings account rates",
  card: "Credit card rates",
  loan: "Loan rates",
};
