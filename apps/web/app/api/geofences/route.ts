import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  createGeofence,
  listGeofences,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const CreateGeofenceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  coordinates: z.array(z.array(z.array(z.number()))),
});

export async function GET(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const geofences = await listGeofences(auth.orgId);
    return NextResponse.json({ geofences });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.geofences", method: "GET" },
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = CreateGeofenceSchema.parse(await req.json());
    const geofence = await createGeofence({
      orgId: auth.orgId,
      userId: auth.userId,
      name: payload.name,
      coordinates: payload.coordinates,
    });

    return NextResponse.json({ geofence }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.geofences", method: "POST" },
    });
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
