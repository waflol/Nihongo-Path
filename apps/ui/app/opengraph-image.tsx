import { ImageResponse } from "next/og";
import { siteConfig } from "./site";

// Open Graph image dimensions (1200x630 recommended).
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

/**
 * Placeholder OG image generated at request time (next/og).
 * Replace the visual with the approved brand template later (spec §17.2).
 */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #4f46e5 0%, #1e1b4b 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: "-2px",
          }}
        >
          {siteConfig.name}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 40,
            opacity: 0.9,
            maxWidth: 900,
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          {siteConfig.tagline}
        </div>
      </div>
    ),
  );
}
