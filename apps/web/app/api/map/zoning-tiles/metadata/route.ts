import { NextResponse } from "next/server";
import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";

const CACHE_MAX_AGE = 3600; // 1h — metadata changes rarely

/**
 * Proxies Martin TileJSON metadata for the zoning MVT source.
 * Needed because Martin may not have permissive CORS for browser requests.
 */
export async function GET() {
  const localApiUrl = process.env.LOCAL_API_URL;
  const localApiKey = process.env.LOCAL_API_KEY;

  if (!localApiUrl || !localApiKey) {
    return NextResponse.json({ error: "Local API not configured" }, { status: 503 });
  }

  const tileBaseUrl = process.env.TILE_SERVER_URL
    ?? localApiUrl.replace("api.", "tiles.");
  const sourceId = process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_ID?.trim() || "get_zoning_mvt";

  try {
    const response = await fetch(`${tileBaseUrl}/${sourceId}`, {
      headers: {
        Authorization: `Bearer ${localApiKey}`,
        ...getCloudflareAccessHeadersFromEnv(),
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Martin returned ${response.status}` },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`,
      },
    });
  } catch (err) {
    console.error("[zoning-tiles/metadata] Proxy error:", err);
    return NextResponse.json({ error: "Failed to fetch zoning metadata" }, { status: 503 });
  }
}
