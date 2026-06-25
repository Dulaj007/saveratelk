/**
 * app/opengraph-image.tsx
 *
 * Generates the social-share preview image (Open Graph + Twitter card) at
 * request time via next/og, applied to every page that doesn't define its
 * own opengraph-image. There's no static design asset to keep in sync,
 * and this reuses the same red/blue "SaveRateLK" wordmark shown in the
 * site's own header and footer.
 */

import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800 }}>
          <span>%&nbsp;</span>
          <span style={{ color: "#ef4444" }}>Save</span>
          <span style={{ color: "#3b82f6" }}>Rate</span>
          <span>LK</span>
        </div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: "#a3a3a3" }}>
          Compare bank interest rates in Sri Lanka
        </div>
      </div>
    ),
    { ...size }
  );
}
