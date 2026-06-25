/**
 * app/sitemap.ts
 *
 * Generates sitemap.xml, listing the home page, the about page, and one
 * entry per active bank's detail page. Next.js serves this at
 * /sitemap.xml automatically because of the file's special name and location.
 *
 * Cached for a day like the pages it lists — without a `revalidate`
 * export this hits the database on every single crawl, which defeats
 * the point of moving to Neon + ISR to begin with.
 */

import type { MetadataRoute } from "next";
import { getBanks } from "@/lib/db";

export const revalidate = 86400;

const SITE_URL = process.env.SITE_URL ?? "https://saveratelk.cloud";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let banks: { code: string }[] = [];
  try {
    banks = await getBanks();
  } catch {
    banks = [];
  }

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const bankEntries: MetadataRoute.Sitemap = banks.map((bank) => ({
    url: `${SITE_URL}/bank/${bank.code}`,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [...staticEntries, ...bankEntries];
}
