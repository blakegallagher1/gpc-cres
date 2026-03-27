import { NextResponse } from "next/server";
import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";
import * as Sentry from "@sentry/nextjs";

const CACHE_MAX_AGE = 86400;
const CACHE_STALE = 604800;
const TILE_FETCH_TIMEOUT_MS = 10_000;

type RouteParams = { params: Promise<{ z: string; x: string; y: string }> };

/**
 * Zoning vector tile proxy — proxies to Martin get_zoning_mvt via Cloudflare Tunnel.
 * Same-origin so MapLibre can fetch without CORS issues.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { z, x, y } = await params;
  const zi = parseInt(z, 10);
  const xi = parseInt(x, 10);
  const yi = parseInt(y, 10);

  if (!Number.isFinite(zi) || !Number.isFinite(xi) || !Number.isFinite(yi)) {
    return NextResponse.json({ error: "Invalid tile coordinates" }, { status: 400 });
  }

  if (zi < 0 || zi > 22 || xi < 0 || xi >= Math.pow(2, zi) || yi < 0 || yi >= Math.pow(2, zi)) {
    return NextResponse.json({ error: "Tile out of range" }, { status: 400 });
  }

  const localApiUrl = process.env.LOCAL_API_URL;
  const localApiKey = process.env.LOCAL_API_KEY;

  if (!localApiUrl || !localApiKey) {
    return NextResponse.json({ error: "Local API not configured" }, { status: 503 });
  }

  const tileBaseUrl = process.env.TILE_SERVER_URL
    ?? localApiUrl.replace("api.", "tiles.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TILE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${tileBaseUrl}/get_zoning_mvt/${zi}/${xi}/${yi}`,
      {
        headers: {
          Authorization: `Bearer ${localApiKey}`,
          ...getCloudflareAccessHeadersFromEnv(),
        },
        signal: controller.signal,
      }
    );

    if (response.status === 204) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_STALE}`,
        },
      });
    }

    if (!response.ok) {
      throw new Error(`Tile server returned ${response.status}`);
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
      tags: { route: "api.map.zoning-tiles", method: "GET", timeout: String(isTimeout) },
    });
    console.error("[zoning-tiles] Proxy error:", isTimeout ? `request timed out after ${TILE_FETCH_TIMEOUT_MS}ms` : err);
    return NextResponse.json(
      { error: isTimeout ? "Tile server request timed out" : "Failed to fetch zoning tile" },
      { status: isTimeout ? 504 : 503 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
