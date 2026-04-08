import { prisma } from "@entitlement-os/db";
import { ensureSavedGeofencesTable } from "../search/geofence-table.service";

type SavedGeofenceRow = {
  id: string;
  name: string;
  coordinates: unknown;
  created_at: Date;
};

export type SavedGeofenceRecord = {
  id: string;
  name: string;
  coordinates: unknown;
  createdAt: string;
};

export class GeofenceNotFoundError extends Error {
  constructor(message: string = "Geofence not found") {
    super(message);
    this.name = "GeofenceNotFoundError";
  }
}

function toSavedGeofenceRecord(row: SavedGeofenceRow): SavedGeofenceRecord {
  return {
    id: row.id,
    name: row.name,
    coordinates: row.coordinates,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listGeofences(orgId: string): Promise<SavedGeofenceRecord[]> {
  await ensureSavedGeofencesTable();
  const rows = await prisma.$queryRaw<SavedGeofenceRow[]>`
    select id::text as id, name, coordinates, created_at
    from saved_geofences
    where org_id = ${orgId}::uuid
    order by created_at desc
    limit 100
  `;

  return rows.map(toSavedGeofenceRecord);
}

export async function createGeofence(input: {
  orgId: string;
  userId: string;
  name: string;
  coordinates: number[][][];
}): Promise<SavedGeofenceRecord> {
  await ensureSavedGeofencesTable();
  const [row] = await prisma.$queryRaw<SavedGeofenceRow[]>`
    insert into saved_geofences (org_id, user_id, name, coordinates)
    values (
      ${input.orgId}::uuid,
      ${input.userId}::uuid,
      ${input.name},
      ${JSON.stringify(input.coordinates)}::jsonb
    )
    returning id::text as id, name, coordinates, created_at
  `;

  return toSavedGeofenceRecord(row);
}

export async function deleteGeofence(input: {
  orgId: string;
  geofenceId: string;
}): Promise<void> {
  await ensureSavedGeofencesTable();
  const deletedCount = await prisma.$executeRaw`
    delete from saved_geofences
    where id = ${input.geofenceId}::uuid
      and org_id = ${input.orgId}::uuid
  `;

  if (!deletedCount) {
    throw new GeofenceNotFoundError();
  }
}
