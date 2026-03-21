import { NextResponse } from "next/server";
import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";
import * as Sentry from "@sentry/nextjs";

const CACHE_MAX_AGE = 86400; // 24h — tiles are immutable for given xyz
const CACHE_STALE = 604800; // 7d — allow CDN to serve stale while revalidating
const TILE_FETCH_TIMEOUT_MS = 10_000; // 10s — prevent hanging if Martin is unresponsive

type RouteParams = { params: Promise<{ z: string; x: string; y: string }> };

/**
 * Vector tile endpoint: returns parcel boundaries as Mapbox Vector Tiles (.pbf).
 * Proxies to local FastAPI server via Cloudflare Tunnel.
 * Public by design (anonymous geometry tiles) and typically served through
 * Cloudflare Tunnel + CDN caching for caching and protection.
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TILE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${tileBaseUrl}/${tileLayer}/${zi}/${xi}/${yi}`,
      {
        headers: {
          Authorization: `Bearer ${localApiKey}`,
          ...getCloudflareAccessHeadersFromEnv(),
        },
        signal: controller.signal,
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
    const isTimeout = err instanceof Error && err.name === "AbortError";
    Sentry.captureException(err, {
      tags: { route: "api.map.tiles", method: "GET", timeout: String(isTimeout) },
    });
    console.error("[tiles] Proxy error:", isTimeout ? `request timed out after ${TILE_FETCH_TIMEOUT_MS}ms` : err);
    return NextResponse.json(
      { error: isTimeout ? "Tile server request timed out" : "Failed to fetch tile from local API" },
      { status: isTimeout ? 504 : 503 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
