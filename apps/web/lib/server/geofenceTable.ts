import { prisma } from "@entitlement-os/db";

let ensurePromise: Promise<void> | null = null;

export async function ensureSavedGeofencesTable(): Promise<void> {
  if (ensurePromise) {
    await ensurePromise;
    return;
  }

  ensurePromise = (async () => {
    await prisma.$executeRawUnsafe(`
      create table if not exists saved_geofences (
        id uuid primary key default gen_random_uuid(),
        org_id uuid not null references orgs(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        name text not null,
        coordinates jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
    await prisma.$executeRawUnsafe(`
      create index if not exists idx_saved_geofences_org_created
      on saved_geofences (org_id, created_at desc);
    `);
    await prisma.$executeRawUnsafe(`
      create index if not exists idx_saved_geofences_org_name
      on saved_geofences (org_id, name);
    `);
  })();

  try {
    await ensurePromise;
  } catch (error) {
    ensurePromise = null;
    throw error;
  }
}
