/**
 * lib/bankInfo.ts
 *
 * Short promotional blurb per bank, keyed by `banks.code`, shown on the
 * About page's bank list. Kept separate from lib/db.ts since this is
 * editorial copy (written once, rarely touched) rather than scraped data,
 * since there is no `description` column in the database.
 *
 * A bank with no entry here (e.g. a newly added one) just renders without
 * a blurb rather than breaking the page.
 */

export const BANK_BLURBS: Record<string, string> = {
  boc: "Sri Lanka's oldest and largest state-owned bank, founded in 1939, with the largest branch network in the country.",
  commercial: "The largest private bank in Sri Lanka by assets, with a well-known digital banking platform.",
  dfcc: "Started as Sri Lanka's first development finance institution. Still active in SME and project financing alongside everyday banking.",
  hnb: "One of Sri Lanka's largest private banks, with a wide retail branch network.",
  ndb: "A bank with roots in development finance, now offering a full range of personal and corporate banking products.",
  nsb: "Sri Lanka's state-owned savings bank. Deposits carry a government guarantee.",
  nationstrust: "Operates the American Express franchise in Sri Lanka, with a focus on digital banking and card products.",
  panasia: "A growing private bank known for competitive fixed deposit rates.",
  peoples: "One of Sri Lanka's two largest state-owned banks, with branches across the country, including rural areas.",
  sampath: "A private bank known for its digital banking platform and customer service.",
  seylan: "A private bank with a focus on personalised service, SME banking, and retail banking.",
};
