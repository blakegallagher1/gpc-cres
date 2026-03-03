import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const CreateGeofenceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  coordinates: z.array(z.array(z.array(z.number()))),
});

export async function GET(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; coordinates: unknown; created_at: Date }>>`
      select id::text as id, name, coordinates, created_at
      from saved_geofences
      where org_id = ${auth.orgId}::uuid
      order by created_at desc
      limit 100
    `;

    return NextResponse.json({
      geofences: rows.map((row) => ({
        id: row.id,
        name: row.name,
        coordinates: row.coordinates,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("[geofences-get]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = CreateGeofenceSchema.parse(await req.json());
    const [row] = await prisma.$queryRaw<Array<{ id: string; name: string; coordinates: unknown; created_at: Date }>>`
      insert into saved_geofences (org_id, user_id, name, coordinates)
      values (${auth.orgId}::uuid, ${auth.userId}::uuid, ${payload.name}, ${JSON.stringify(payload.coordinates)}::jsonb)
      returning id::text as id, name, coordinates, created_at
    `;

    return NextResponse.json(
      {
        geofence: {
          id: row.id,
          name: row.name,
          coordinates: row.coordinates,
          createdAt: row.created_at,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    console.error("[geofences-post]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
