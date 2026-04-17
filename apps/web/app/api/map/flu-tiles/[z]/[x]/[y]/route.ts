import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";

const CACHE_MAX_AGE = 86400;
const CACHE_STALE = 604800;
const TILE_FETCH_TIMEOUT_MS = 10_000;

type RouteParams = { params: Promise<{ z: string; x: string; y: string }> };

/**
 * Future Land Use (FLU) vector tile proxy.
 *
 * Tile upstream is configured via FLU_TILE_ORIGIN (e.g. a parish Martin
 * instance or an ArcGIS VectorTileServer). When the env var is unset, this
 * route returns 204 so the layer renders nothing — the UX is ready but the
 * data plane can be wired later without code changes.
 *
 * Path template: `${FLU_TILE_ORIGIN}${FLU_TILE_PATH}` with `{z}`, `{x}`, `{y}`
 * substitutions. `FLU_TILE_PATH` defaults to `/get_flu_mvt/{z}/{x}/{y}`.
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

  const origin = process.env.FLU_TILE_ORIGIN?.trim();
  if (!origin) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`,
      },
    });
  }

  const pathTemplate = process.env.FLU_TILE_PATH?.trim() || "/get_flu_mvt/{z}/{x}/{y}";
  const path = pathTemplate
    .replace("{z}", String(zi))
    .replace("{x}", String(xi))
    .replace("{y}", String(yi));
  const url = `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const token = process.env.FLU_TILE_TOKEN?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TILE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...getCloudflareAccessHeadersFromEnv(),
      },
      signal: controller.signal,
    });

    if (response.status === 204 || response.status === 404) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_STALE}`,
        },
      });
    }

    if (!response.ok) {
      throw new Error(`FLU tile upstream returned ${response.status}`);
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
      tags: { route: "api.map.flu-tiles", method: "GET", timeout: String(isTimeout) },
    });
    return NextResponse.json(
      { error: isTimeout ? "FLU tile request timed out" : "Failed to fetch FLU tile" },
      { status: isTimeout ? 504 : 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
