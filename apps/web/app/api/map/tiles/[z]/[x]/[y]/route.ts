import { NextResponse } from "next/server";

const CACHE_MAX_AGE = 86400; // 24h — tiles are immutable for given xyz
const CACHE_STALE = 604800; // 7d — allow CDN to serve stale while revalidating

type RouteParams = { params: Promise<{ z: string; x: string; y: string }> };

/**
 * Vector tile endpoint: returns parcel boundaries as Mapbox Vector Tiles (.pbf).
 * Proxies to local FastAPI server via Cloudflare Tunnel.
 * No auth — base map tiles; aggressive CDN caching.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { z, x, y } = await params;
  const zi = parseInt(z, 10);
  const xi = parseInt(x, 10);
  const yi = parseInt(y, 10);

  if (!Number.isFinite(zi) || !Number.isFinite(xi) || !Number.isFinite(yi)) {
    return NextResponse.json(
      { error: "Invalid tile coordinates" },
      { status: 400 }
    );
  }

  if (zi < 0 || zi > 22 || xi < 0 || xi >= Math.pow(2, zi) || yi < 0 || yi >= Math.pow(2, zi)) {
    return NextResponse.json({ error: "Tile out of range" }, { status: 400 });
  }

  const localApiUrl = process.env.LOCAL_API_URL;
  const localApiKey = process.env.LOCAL_API_KEY;

  if (!localApiUrl || !localApiKey) {
    return NextResponse.json(
      { error: "Local API not configured" },
      { status: 503 }
    );
  }

  // Martin tile server is on a separate subdomain from the gateway.
  // Derive the tile URL: api.gallagherpropco.com → tiles.gallagherpropco.com
  const tileBaseUrl = process.env.TILE_SERVER_URL
    ?? localApiUrl.replace("api.", "tiles.");
  const tileLayer = process.env.TILE_LAYER_NAME ?? "ebr_parcels";

  try {
    const response = await fetch(
      `${tileBaseUrl}/${tileLayer}/${zi}/${xi}/${yi}`,
      {
        headers: {
          Authorization: `Bearer ${localApiKey}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 204) {
        // No data for this tile
        return new NextResponse(null, {
          status: 204,
          headers: {
            "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_STALE}`,
          },
        });
      }
      throw new Error(`Local API returned ${response.status}`);
    }

    const data = await response.arrayBuffer();

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_STALE}, immutable`,
        "Content-Length": String(data.byteLength),
      },
    });
  } catch (err) {
    console.error("[tiles] Proxy error:", err);
    return NextResponse.json(
      { error: "Failed to fetch tile from local API" },
      { status: 503 }
    );
  }
}
