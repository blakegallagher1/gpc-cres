import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";

const CACHE_MAX_AGE = 86400;
const CACHE_STALE = 604800;
const TILE_FETCH_TIMEOUT_MS = 10_000;

type RouteParams = { params: Promise<{ z: string; x: string; y: string }> };

/**
 * Authenticated zoning tile proxy.
 *
 * The browser cannot reliably discover zoning-capable Martin sources on the
 * public tiles hostname, but the app server can fetch the gateway's
 * authenticated zoning tile endpoint and expose those bytes as a same-origin
 * vector tile source.
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TILE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${localApiUrl}/tiles/zoning/${zi}/${xi}/${yi}.pbf`, {
      headers: {
        Authorization: `Bearer ${localApiKey}`,
        ...getCloudflareAccessHeadersFromEnv(),
      },
      signal: controller.signal,
    });

    if (response.status === 204) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_STALE}`,
        },
      });
    }

    if (!response.ok) {
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
      tags: { route: "api.map.zoning-tiles", method: "GET", timeout: String(isTimeout) },
    });
    return NextResponse.json(
      { error: isTimeout ? "Tile server request timed out" : "Failed to fetch zoning tile from local API" },
      { status: isTimeout ? 504 : 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
