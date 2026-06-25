/**
 * lib/bankInfo.ts
 *
 * Short promotional blurb per bank, keyed by `banks.code`, shown on the
 * About page's bank list. Kept separate from lib/db.ts since this is
 * editorial copy (written once, rarely touched) rather than scraped data
 * — there is no `description` column in the database.
 *
 * A bank with no entry here (e.g. a newly added one) just renders without
 * a blurb rather than breaking the page.
 */

export const BANK_BLURBS: Record<string, string> = {
  boc: "Sri Lanka's oldest and largest state-owned bank, with the most extensive branch network in the country and a heritage stretching back to 1939.",
  commercial: "The country's largest private bank by assets, known for a strong digital banking platform and award-winning customer service.",
  dfcc: "Grew out of Sri Lanka's first development finance institution and remains a go-to choice for SME and project financing alongside everyday banking.",
  hnb: "One of Sri Lanka's largest private banks, with a wide retail network and a long-standing reputation for personal banking.",
  ndb: "Combines development-finance roots with a full range of modern personal and corporate banking products.",
  nsb: "Sri Lanka's state-owned savings bank — deposits carry a government guarantee, making it a popular choice for risk-averse savers.",
  nationstrust: "Operates the American Express franchise in Sri Lanka and is known for innovative digital banking and card products.",
  panasia: "A fast-growing private bank recognised for competitive fixed deposit rates and a steadily expanding digital presence.",
  peoples: "One of Sri Lanka's two largest state-owned banks, with an island-wide branch network reaching even rural communities.",
  sampath: "A leading private bank known for its strong digital banking platform and consistent customer-service awards.",
  seylan: "A well-established private bank known for personalised service and a strong focus on SME and retail banking.",
};
