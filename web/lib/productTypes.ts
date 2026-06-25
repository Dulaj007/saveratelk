/**
 * lib/productTypes.ts
 *
 * Single source of truth for the rate categories the UI knows about,
 * mirroring the `rates.product_type` CHECK constraint in db/schema.sql.
 * Deposit types (fd, savings) keep their own dedicated grouping
 * components (FDRatesByTenure, SavingsByCategory); LENDING_PRODUCT_TYPES
 * is the list rendered generically by LendingRates.tsx in the "Loans &
 * Cards" tab. Sections for types with no scraped rows simply don't render.
 */

export type LendingProductType =
  | "card"
  | "housing_loan"
  | "personal_loan"
  | "leasing"
  | "education_loan"
  | "pawning"
  | "overdraft";

export type ProductType = "fd" | "savings" | "profit" | LendingProductType;

export const LENDING_PRODUCT_TYPES: LendingProductType[] = [
  "card",
  "housing_loan",
  "personal_loan",
  "leasing",
  "education_loan",
  "pawning",
  "overdraft",
];

export const LENDING_PRODUCT_LABELS: Record<LendingProductType, string> = {
  card:           "Credit Cards",
  housing_loan:   "Housing Loans",
  personal_loan:  "Personal Loans",
  leasing:        "Leasing / Vehicle Loans",
  education_loan: "Education Loans",
  pawning:        "Pawning / Gold Loans",
  overdraft:      "Overdraft (OD)",
};
