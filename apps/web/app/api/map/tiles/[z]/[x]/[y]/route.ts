import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db/client";

const CACHE_MAX_AGE = 86400; // 24h — tiles are immutable for given xyz
const CACHE_STALE = 604800; // 7d — allow CDN to serve stale while revalidating

type RouteParams = { params: Promise<{ z: string; x: string; y: string }> };

/**
 * Vector tile endpoint: returns parcel boundaries as Mapbox Vector Tiles (.pbf).
 * Calls get_parcel_mvt(z,x,y) RPC. Requires Supavisor (port 6543) for serverless.
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

  try {
    const rows = await prisma.$queryRawUnsafe<
      { get_parcel_mvt: Buffer | null }[]
    >("SELECT get_parcel_mvt($1::int, $2::int, $3::int) AS get_parcel_mvt", zi, xi, yi);

    const buf = rows?.[0]?.get_parcel_mvt ?? null;
    if (!buf || buf.length === 0) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_STALE}`,
        },
      });
    }

    return new NextResponse(Buffer.from(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_STALE}, immutable`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (err) {
    console.error("[tiles]", err);
    return new NextResponse(null, { status: 204 });
  }
}
