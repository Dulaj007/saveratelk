/**
 * app/robots.ts
 *
 * Generates robots.txt, allowing all crawlers and pointing them to the
 * dynamic sitemap. Next.js serves this at /robots.txt automatically because
 * of the file's special name and location.
 */

import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL ?? "https://saveratelk.cloud";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
