-- Parcel data cache (synced from Property DB)
CREATE TABLE IF NOT EXISTS parcels (
  parcel_id TEXT PRIMARY KEY,
  owner_name TEXT,
  site_address TEXT,
  zoning_type TEXT,
  acres REAL,
  legal_description TEXT,
  assessed_value REAL,
  geometry TEXT,
  raw_json TEXT NOT NULL,
  synced_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parcels_address ON parcels(site_address);
CREATE INDEX IF NOT EXISTS idx_parcels_owner ON parcels(owner_name);
CREATE INDEX IF NOT EXISTS idx_parcels_zoning ON parcels(zoning_type);
CREATE INDEX IF NOT EXISTS idx_parcels_synced ON parcels(synced_at);

-- Screening results cache
CREATE TABLE IF NOT EXISTS screening (
  parcel_id TEXT NOT NULL,
  screen_type TEXT NOT NULL,
  result_json TEXT NOT NULL,
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (parcel_id, screen_type)
);

-- Generic response cache (for SQL queries and other responses)
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  ttl_seconds INTEGER NOT NULL DEFAULT 900
);

-- Sync metadata
CREATE TABLE IF NOT EXISTS sync_status (
  id TEXT PRIMARY KEY DEFAULT 'main',
  last_sync_at INTEGER,
  rows_synced INTEGER DEFAULT 0,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO sync_status (id, updated_at) VALUES ('main', 0);

-- Health check history (7-day rolling)
CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at INTEGER NOT NULL,
  gateway_ok INTEGER NOT NULL,
  tiles_ok INTEGER NOT NULL,
  latency_ms INTEGER,
  error TEXT,
  action_taken TEXT
);

CREATE INDEX IF NOT EXISTS idx_health_checked ON health_checks(checked_at);

-- Deploy history
CREATE TABLE IF NOT EXISTS deploys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployed_at INTEGER NOT NULL,
  commit_hash TEXT,
  status TEXT NOT NULL,
  log TEXT,
  triggered_by TEXT
);
