create table if not exists saved_geofences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  coordinates jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_geofences_org_created
  on saved_geofences (org_id, created_at desc);

create index if not exists idx_saved_geofences_org_name
  on saved_geofences (org_id, name);
