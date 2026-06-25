/**
 * lib/logos.ts
 *
 * Manifest of which active banks have a logo file under public/logos
 * (fetched from each bank's own website, see web/public/logos), keyed by
 * bank code. A bank missing here (e.g. "panasia", whose site sits behind a
 * bot-challenge that blocks a plain fetch) falls back to the initials
 * monogram rendered by components/BankLogo.tsx instead of a broken <img>.
 */

export const BANK_LOGOS: Record<string, string> = {
  hnb:          "/logos/hnb.png",
  commercial:   "/logos/commercial.svg",
  boc:          "/logos/boc.svg",
  seylan:       "/logos/seylan.png",
  nsb:          "/logos/nsb.png",
  ndb:          "/logos/ndb.png",
  nationstrust: "/logos/nationstrust.svg",
  peoples:      "/logos/peoples.png",
  dfcc:         "/logos/dfcc.png",
  sampath:      "/logos/sampath.jpg",
};
