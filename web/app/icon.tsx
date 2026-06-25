/**
 * app/icon.tsx
 *
 * Generates the site favicon at request time via next/og. There is no
 * static icon asset to keep in sync, and this renders the same "%" brand
 * mark used everywhere else (Hero, MobileTopBar, Footer) instead of the
 * default Next.js icon.
 */

import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          borderRadius: 6,
          color: "#ffffff",
          fontSize: 22,
          fontWeight: 800,
        }}
      >
        %
      </div>
    ),
    { ...size }
  );
}
