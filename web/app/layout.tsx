/**
 * app/layout.tsx
 *
 * Root layout for all SaveRateLK pages.
 *
 * Sets the default metadata (site title and description used by search engines
 * when a page does not override them), applies global Tailwind styles, and
 * renders the persistent site header and footer around each page's content.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import AuroraBackground from "@/components/AuroraBackground";
import Footer from "@/components/Footer";
import SplashScreen from "@/components/SplashScreen";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

const SITE_URL = process.env.SITE_URL ?? "https://saveratelk.cloud";
const SITE_TITLE = "SaveRateLK – Compare Bank Interest Rates in Sri Lanka";
const SITE_DESCRIPTION =
  "Compare fixed deposit and savings interest rates from all major Sri Lankan banks in one place. Track rate history and benchmark against CBSL averages.";

/**
 * `metadataBase` is what lets every page below just write a relative path
 * (or nothing at all, falling back to opengraph-image.tsx) for openGraph/
 * twitter images and have Next resolve it to a full URL. Without it,
 * those resolve relative to the request itself, which breaks for anyone
 * sharing a link from a tool that fetches the page server-side.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "SaveRateLK",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.className} min-h-screen bg-black text-neutral-100 antialiased`}>
        <SplashScreen />
        <AuroraBackground />

        <SiteHeader />
        <MobileTopBar />

        <main className="mx-auto max-w-6xl px-4 pt-16">
          {children}
        </main>

        <Footer />

        {/* Bottom app-style tab bar, mobile only (Nav/SiteHeader take over
            at md: and up). Needs its own Suspense boundary the same way
            HomeRatesSection does, since it reads the ?tab= query too. */}
        <Suspense>
          <MobileTabBar />
        </Suspense>
      </body>
    </html>
  );
}
