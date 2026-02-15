import { NextResponse } from "next/server";

// Minimal 1x1 pixel neutral-gray PNG (base64-decoded to bytes).
// Generated via: canvas 1x1, fillStyle #c8c8c8, toBuffer("image/png")
// This is 67 bytes — the smallest valid PNG with a single gray pixel.
const GRAY_1X1_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPM+s9QDwAFHAIcuxMliwAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * Local placeholder tile endpoint for offline / CI environments.
 * Returns a 1x1 neutral-gray PNG with aggressive cache headers.
 * No auth required — these are non-sensitive base map tiles.
 */
export async function GET() {
  return new NextResponse(GRAY_1X1_PNG, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Length": String(GRAY_1X1_PNG.length),
    },
  });
}
