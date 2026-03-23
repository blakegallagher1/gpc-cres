# Gateway Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace direct Vercel→Cloudflare Tunnel→Gateway communication with a CF Worker proxy + D1 cache for zero-downtime property data, an admin dashboard on CF Pages, GitHub Actions CI/CD, and automated health monitoring.

**Architecture:** CF Worker at `gateway.gallagherpropco.com` is the single entry point. It proxies to the Windows gateway when online, falls back to D1 (edge SQLite) when offline. Admin dashboard on CF Pages. GitHub Actions deploys gateway code. CF Cron monitors health.

**Tech Stack:** Cloudflare Workers (Wrangler), D1 (SQLite at edge), CF Pages, GitHub Actions, TypeScript, Python (sync script)

**Design doc:** `docs/plans/2026-03-23-gateway-proxy-design.md`

---

## Phase 1: CF Worker Proxy (Pass-Through Mode)

### Task 1: Scaffold the CF Worker project

**Files:**
- Create: `infra/gateway-proxy/wrangler.toml`
- Create: `infra/gateway-proxy/package.json`
- Create: `infra/gateway-proxy/tsconfig.json`
- Create: `infra/gateway-proxy/src/index.ts`
- Create: `infra/gateway-proxy/.dev.vars.example`

**Step 1: Create project structure**

```bash
mkdir -p infra/gateway-proxy/src
```

**Step 2: Create `package.json`**

```json
{
  "name": "gpc-gateway-proxy",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260301.0",
    "vitest": "^3.0.0",
    "wrangler": "^3.100.0"
  }
}
```

**Step 3: Create `wrangler.toml`**

```toml
name = "gpc-gateway-proxy"
main = "src/index.ts"
compatibility_date = "2026-03-01"

[vars]
UPSTREAM_GATEWAY_URL = "https://api.gallagherpropco.com"

# D1 binding — will be created in Task 5
# [[d1_databases]]
# binding = "DB"
# database_name = "gpc-gateway-cache"
# database_id = "<created-later>"

# Cron triggers — enabled in Phase 5
# [triggers]
# crons = ["*/2 * * * *"]
```

**Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 5: Create `.dev.vars.example`**

```
GATEWAY_PROXY_TOKEN=your-proxy-token-here
LOCAL_API_KEY=your-local-api-key
CF_ACCESS_CLIENT_ID=your-cf-access-client-id
CF_ACCESS_CLIENT_SECRET=your-cf-access-client-secret
SYNC_TOKEN=your-sync-token-here
```

**Step 6: Create minimal `src/index.ts`** (health check only)

```typescript
export interface Env {
  UPSTREAM_GATEWAY_URL: string;
  GATEWAY_PROXY_TOKEN: string;
  LOCAL_API_KEY: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "gpc-gateway-proxy" });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

**Step 7: Install dependencies and verify**

```bash
cd infra/gateway-proxy && npm install && npx wrangler dev --local
```

Expected: Worker starts, `curl http://localhost:8787/health` returns `{"status":"ok","service":"gpc-gateway-proxy"}`

**Step 8: Commit**

```bash
git add infra/gateway-proxy/
git commit -m "feat(gateway-proxy): scaffold CF Worker project"
```

---

### Task 2: Implement auth middleware and upstream proxy

**Files:**
- Create: `infra/gateway-proxy/src/auth.ts`
- Create: `infra/gateway-proxy/src/upstream.ts`
- Modify: `infra/gateway-proxy/src/index.ts`
- Create: `infra/gateway-proxy/src/types.ts`

**Step 1: Create `src/types.ts`**

```typescript
export interface Env {
  UPSTREAM_GATEWAY_URL: string;
  GATEWAY_PROXY_TOKEN: string;
  LOCAL_API_KEY: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
  SYNC_TOKEN?: string;
  DB?: D1Database;
}

export type DataSource = "gateway" | "d1-cache" | "d1-stale";

export interface ProxyResponse<T = unknown> {
  data: T;
  source: DataSource;
  staleness_seconds: number | null;
}

export interface UpstreamResult {
  ok: boolean;
  status: number;
  data: unknown;
  raw: string;
}
```

**Step 2: Create `src/auth.ts`**

```typescript
import { Env } from "./types";

export function validateBearer(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === env.GATEWAY_PROXY_TOKEN;
}

export function upstreamHeaders(env: Env, requestId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${env.LOCAL_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (env.CF_ACCESS_CLIENT_ID) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
  }
  if (env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }
  if (requestId) {
    headers["x-request-id"] = requestId;
  }
  return headers;
}
```

**Step 3: Create `src/upstream.ts`**

```typescript
import { Env, UpstreamResult } from "./types";
import { upstreamHeaders } from "./auth";

const UPSTREAM_TIMEOUT_MS = 3000;

export async function proxyToUpstream(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
  requestId?: string
): Promise<UpstreamResult> {
  const url = `${env.UPSTREAM_GATEWAY_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers: upstreamHeaders(env, requestId),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const raw = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }

    return { ok: res.ok, status: res.status, data, raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream error";
    return { ok: false, status: 0, data: { error: message }, raw: "" };
  } finally {
    clearTimeout(timeout);
  }
}
```

**Step 4: Update `src/index.ts` with auth + pass-through proxy**

```typescript
import { Env } from "./types";
import { validateBearer } from "./auth";
import { proxyToUpstream } from "./upstream";

function jsonResponse(data: unknown, status = 200, source = "gateway"): Response {
  return Response.json(data, {
    status,
    headers: {
      "X-GPC-Source": source,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      });
    }

    const url = new URL(request.url);

    // Health check — no auth required
    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok", service: "gpc-gateway-proxy" });
    }

    // Auth check
    if (!validateBearer(request, env)) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const requestId = crypto.randomUUID();

    // Route mapping: proxy URL → upstream gateway URL + method
    const route = matchRoute(url.pathname, request.method);
    if (!route) {
      return jsonResponse({ error: "not found" }, 404);
    }

    // Build upstream body from query params or request body
    let body: unknown;
    if (request.method === "POST") {
      body = await request.json().catch(() => ({}));
    } else if (route.buildBody) {
      body = route.buildBody(url.searchParams);
    }

    const result = await proxyToUpstream(env, route.upstreamMethod, route.upstreamPath, body, requestId);

    if (result.ok) {
      return jsonResponse(
        { data: result.data, source: "gateway", staleness_seconds: null },
        200,
        "gateway"
      );
    }

    // For now (pass-through mode), just return the upstream error
    // D1 fallback will be added in Phase 2
    return jsonResponse(
      { data: null, source: "gateway", staleness_seconds: null, error: "upstream unavailable" },
      502,
      "gateway"
    );
  },
} satisfies ExportedHandler<Env>;

interface RouteMatch {
  upstreamMethod: string;
  upstreamPath: string;
  buildBody?: (params: URLSearchParams) => unknown;
  cacheKey?: string;
}

function matchRoute(pathname: string, method: string): RouteMatch | null {
  // GET /parcels/search?address=...&polygon=...&limit=...
  if (pathname === "/parcels/search" && method === "GET") {
    return {
      upstreamMethod: "POST",
      upstreamPath: "/tools/parcel.bbox",
      buildBody: (params) => ({
        address: params.get("address") || undefined,
        polygon: params.get("polygon") || undefined,
        limit: params.get("limit") ? Number(params.get("limit")) : 50,
      }),
    };
  }

  // GET /parcels/:id
  const parcelMatch = pathname.match(/^\/parcels\/([^/]+)$/);
  if (parcelMatch && method === "GET") {
    return {
      upstreamMethod: "POST",
      upstreamPath: "/tools/parcel.lookup",
      buildBody: () => ({ parcel_id: parcelMatch[1] }),
    };
  }

  // POST /parcels/sql
  if (pathname === "/parcels/sql" && method === "POST") {
    return {
      upstreamMethod: "POST",
      upstreamPath: "/tools/parcels.sql",
    };
  }

  // GET /screening/:type/:parcelId
  const screenMatch = pathname.match(/^\/screening\/([^/]+)\/([^/]+)$/);
  if (screenMatch && method === "GET") {
    const type = screenMatch[1];
    const parcelId = screenMatch[2];
    return {
      upstreamMethod: "POST",
      upstreamPath: `/tools/screen.${type}`,
      buildBody: () => ({ parcel_id: parcelId }),
    };
  }

  // POST /screening/full/:parcelId
  const fullScreenMatch = pathname.match(/^\/screening\/full\/([^/]+)$/);
  if (fullScreenMatch && method === "POST") {
    return {
      upstreamMethod: "POST",
      upstreamPath: "/api/screening/full",
      buildBody: () => ({ parcelId: fullScreenMatch[1] }),
    };
  }

  return null;
}
```

**Step 5: Test locally**

```bash
cd infra/gateway-proxy && npx wrangler dev --local
# In another terminal:
curl -H "Authorization: Bearer test-token" http://localhost:8787/parcels/search?address=test
```

Expected: 502 (no upstream gateway in dev) but response shape is `{ data: null, source: "gateway", error: "upstream unavailable" }`

**Step 6: Commit**

```bash
git add infra/gateway-proxy/src/
git commit -m "feat(gateway-proxy): auth middleware and upstream pass-through proxy"
```

---

### Task 3: Write tests for auth and routing

**Files:**
- Create: `infra/gateway-proxy/vitest.config.ts`
- Create: `infra/gateway-proxy/tests/auth.test.ts`
- Create: `infra/gateway-proxy/tests/routing.test.ts`

**Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

**Step 2: Write auth tests**

```typescript
// tests/auth.test.ts
import { describe, it, expect } from "vitest";
import { validateBearer } from "../src/auth";

const env = {
  UPSTREAM_GATEWAY_URL: "https://api.gallagherpropco.com",
  GATEWAY_PROXY_TOKEN: "test-token",
  LOCAL_API_KEY: "local-key",
  CF_ACCESS_CLIENT_ID: "cf-id",
  CF_ACCESS_CLIENT_SECRET: "cf-secret",
};

describe("validateBearer", () => {
  it("accepts valid token", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer test-token" },
    });
    expect(validateBearer(req, env)).toBe(true);
  });

  it("rejects missing header", () => {
    const req = new Request("http://localhost");
    expect(validateBearer(req, env)).toBe(false);
  });

  it("rejects wrong token", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(validateBearer(req, env)).toBe(false);
  });
});
```

**Step 3: Write routing tests**

Test the `matchRoute` function. Since it's not exported, either export it or test via the full handler. Simplest: export `matchRoute` from index.ts or extract to `src/routes.ts`.

Extract `matchRoute` into `src/routes.ts`:

```typescript
// src/routes.ts
export interface RouteMatch {
  upstreamMethod: string;
  upstreamPath: string;
  buildBody?: (params: URLSearchParams) => unknown;
}

export function matchRoute(pathname: string, method: string): RouteMatch | null {
  // (move the matchRoute function body here from index.ts)
  // ... same implementation as Task 2 Step 4
}
```

Then write tests:

```typescript
// tests/routing.test.ts
import { describe, it, expect } from "vitest";
import { matchRoute } from "../src/routes";

describe("matchRoute", () => {
  it("matches GET /parcels/search", () => {
    const route = matchRoute("/parcels/search", "GET");
    expect(route).not.toBeNull();
    expect(route!.upstreamMethod).toBe("POST");
    expect(route!.upstreamPath).toBe("/tools/parcel.bbox");
  });

  it("builds body from search params for parcel search", () => {
    const route = matchRoute("/parcels/search", "GET");
    const params = new URLSearchParams({ address: "123 Main St", limit: "10" });
    const body = route!.buildBody!(params);
    expect(body).toEqual({ address: "123 Main St", polygon: undefined, limit: 10 });
  });

  it("matches GET /parcels/:id", () => {
    const route = matchRoute("/parcels/ABC-123", "GET");
    expect(route).not.toBeNull();
    expect(route!.upstreamMethod).toBe("POST");
    expect(route!.upstreamPath).toBe("/tools/parcel.lookup");
  });

  it("matches POST /parcels/sql", () => {
    const route = matchRoute("/parcels/sql", "POST");
    expect(route).not.toBeNull();
    expect(route!.upstreamPath).toBe("/tools/parcels.sql");
  });

  it("matches GET /screening/:type/:parcelId", () => {
    const route = matchRoute("/screening/flood/ABC-123", "GET");
    expect(route).not.toBeNull();
    expect(route!.upstreamPath).toBe("/tools/screen.flood");
  });

  it("matches POST /screening/full/:parcelId", () => {
    const route = matchRoute("/screening/full/ABC-123", "POST");
    expect(route).not.toBeNull();
    expect(route!.upstreamPath).toBe("/api/screening/full");
  });

  it("returns null for unknown routes", () => {
    expect(matchRoute("/unknown", "GET")).toBeNull();
  });

  it("returns null for wrong method", () => {
    expect(matchRoute("/parcels/search", "DELETE")).toBeNull();
  });
});
```

**Step 4: Run tests**

```bash
cd infra/gateway-proxy && npx vitest run
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add infra/gateway-proxy/vitest.config.ts infra/gateway-proxy/tests/ infra/gateway-proxy/src/routes.ts
git commit -m "test(gateway-proxy): auth validation and route matching tests"
```

---

### Task 4: Deploy CF Worker and configure DNS

**Files:**
- Modify: `infra/gateway-proxy/wrangler.toml` (add route)

**Step 1: Create the Worker secrets**

```bash
cd infra/gateway-proxy
npx wrangler secret put GATEWAY_PROXY_TOKEN
# Enter: generate a strong random token (e.g., openssl rand -hex 32)
npx wrangler secret put LOCAL_API_KEY
# Enter: the existing LOCAL_API_KEY value from Vercel env
npx wrangler secret put CF_ACCESS_CLIENT_ID
# Enter: existing value
npx wrangler secret put CF_ACCESS_CLIENT_SECRET
# Enter: existing value
```

**Step 2: Update `wrangler.toml` with route**

```toml
name = "gpc-gateway-proxy"
main = "src/index.ts"
compatibility_date = "2026-03-01"
routes = [
  { pattern = "gateway.gallagherpropco.com/*", zone_name = "gallagherpropco.com" }
]

[vars]
UPSTREAM_GATEWAY_URL = "https://api.gallagherpropco.com"
```

**Step 3: Deploy**

```bash
cd infra/gateway-proxy && npx wrangler deploy
```

Expected: Worker deployed. `curl https://gateway.gallagherpropco.com/health` returns `{"status":"ok","service":"gpc-gateway-proxy"}`

**Step 4: Test proxy with auth**

```bash
curl -H "Authorization: Bearer <your-proxy-token>" \
  "https://gateway.gallagherpropco.com/parcels/search?address=Airline+Hwy&limit=5"
```

Expected: Returns property data from upstream gateway with `X-GPC-Source: gateway` header.

**Step 5: Commit**

```bash
git add infra/gateway-proxy/wrangler.toml
git commit -m "feat(gateway-proxy): deploy Worker with route to gateway.gallagherpropco.com"
```

---

## Phase 2: D1 Cache Layer

### Task 5: Create D1 database and schema

**Files:**
- Create: `infra/gateway-proxy/schema.sql`
- Modify: `infra/gateway-proxy/wrangler.toml` (add D1 binding)

**Step 1: Create D1 database**

```bash
cd infra/gateway-proxy
npx wrangler d1 create gpc-gateway-cache
```

Copy the `database_id` from the output.

**Step 2: Create `schema.sql`**

```sql
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
```

**Step 3: Apply schema to D1**

```bash
npx wrangler d1 execute gpc-gateway-cache --file=./schema.sql
```

Expected: Tables created successfully.

**Step 4: Update `wrangler.toml` with D1 binding**

Add to wrangler.toml:

```toml
[[d1_databases]]
binding = "DB"
database_name = "gpc-gateway-cache"
database_id = "<paste-id-from-step-1>"
```

**Step 5: Commit**

```bash
git add infra/gateway-proxy/schema.sql infra/gateway-proxy/wrangler.toml
git commit -m "feat(gateway-proxy): create D1 database with schema for cache, health, deploys"
```

---

### Task 6: Implement D1 cache read/write and fallback logic

**Files:**
- Create: `infra/gateway-proxy/src/cache.ts`
- Modify: `infra/gateway-proxy/src/index.ts`
- Create: `infra/gateway-proxy/tests/cache.test.ts`

**Step 1: Create `src/cache.ts`**

```typescript
import { DataSource } from "./types";

interface CacheEntry {
  value: string;
  updated_at: number;
  ttl_seconds: number;
}

interface CacheResult {
  data: unknown;
  source: DataSource;
  staleness_seconds: number;
}

export async function cacheGet(db: D1Database, key: string): Promise<CacheResult | null> {
  const row = await db
    .prepare("SELECT value, updated_at, ttl_seconds FROM cache WHERE key = ?")
    .bind(key)
    .first<CacheEntry>();

  if (!row) return null;

  const now = Math.floor(Date.now() / 1000);
  const age = now - row.updated_at;
  const isStale = age > row.ttl_seconds;

  return {
    data: JSON.parse(row.value),
    source: isStale ? "d1-stale" : "d1-cache",
    staleness_seconds: age,
  };
}

export async function cacheSet(
  db: D1Database,
  key: string,
  value: unknown,
  ttlSeconds = 900
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      "INSERT OR REPLACE INTO cache (key, value, updated_at, ttl_seconds) VALUES (?, ?, ?, ?)"
    )
    .bind(key, JSON.stringify(value), now, ttlSeconds)
    .run();
}

export function buildCacheKey(pathname: string, params?: URLSearchParams): string {
  const base = pathname.replace(/\//g, ":");
  if (!params || params.toString() === "") return base;
  // Sort params for consistent keys
  const sorted = new URLSearchParams([...params.entries()].sort());
  return `${base}:${sorted.toString()}`;
}
```

**Step 2: Update `src/index.ts` to use D1 fallback**

Replace the upstream error handling block in the fetch handler:

```typescript
// After proxyToUpstream call:
if (result.ok) {
  // Cache the successful response in D1 (fire-and-forget)
  if (env.DB) {
    const cacheKey = buildCacheKey(url.pathname, url.searchParams);
    ctx.waitUntil(cacheSet(env.DB, cacheKey, result.data));
  }
  return jsonResponse(
    { data: result.data, source: "gateway", staleness_seconds: null },
    200,
    "gateway"
  );
}

// Upstream failed — try D1 fallback
if (env.DB) {
  const cacheKey = buildCacheKey(url.pathname, url.searchParams);
  const cached = await cacheGet(env.DB, cacheKey);
  if (cached) {
    return jsonResponse(
      { data: cached.data, source: cached.source, staleness_seconds: cached.staleness_seconds },
      200,
      cached.source
    );
  }
}

// No cache available
return jsonResponse(
  { data: null, source: "gateway", staleness_seconds: null, error: "upstream unavailable, no cache" },
  502,
  "gateway"
);
```

Note: The `fetch` handler signature needs `ctx: ExecutionContext` added. Update the export:

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ...
  },
} satisfies ExportedHandler<Env>;
```

**Step 3: Write cache tests**

```typescript
// tests/cache.test.ts
import { describe, it, expect } from "vitest";
import { buildCacheKey } from "../src/cache";

describe("buildCacheKey", () => {
  it("converts pathname to colon-separated key", () => {
    expect(buildCacheKey("/parcels/search")).toBe(":parcels:search");
  });

  it("appends sorted params", () => {
    const params = new URLSearchParams({ limit: "10", address: "Main St" });
    const key = buildCacheKey("/parcels/search", params);
    expect(key).toBe(":parcels:search:address=Main+St&limit=10");
  });

  it("omits params when empty", () => {
    expect(buildCacheKey("/parcels/ABC", new URLSearchParams())).toBe(":parcels:ABC");
  });
});
```

**Step 4: Run tests**

```bash
cd infra/gateway-proxy && npx vitest run
```

Expected: All tests pass.

**Step 5: Deploy with D1 enabled**

```bash
npx wrangler deploy
```

**Step 6: Test fallback behavior**

```bash
# Normal request (gateway up) — should return source: gateway
curl -s -H "Authorization: Bearer <token>" \
  "https://gateway.gallagherpropco.com/parcels/search?address=Airline&limit=2" | jq .source

# Same request again — gateway caches it
# If you then take gateway offline, third request should return source: d1-cache
```

**Step 7: Commit**

```bash
git add infra/gateway-proxy/src/cache.ts infra/gateway-proxy/src/index.ts infra/gateway-proxy/tests/cache.test.ts
git commit -m "feat(gateway-proxy): D1 cache layer with fallback on upstream failure"
```

---

## Phase 3: Data Sync

### Task 7: Implement sync endpoint in the Worker

**Files:**
- Create: `infra/gateway-proxy/src/sync.ts`
- Modify: `infra/gateway-proxy/src/index.ts` (add sync routes)
- Modify: `infra/gateway-proxy/src/types.ts` (add SYNC_TOKEN)

**Step 1: Create `src/sync.ts`**

```typescript
import { Env } from "./types";

interface SyncBatch {
  parcels?: Array<{
    parcel_id: string;
    owner_name?: string;
    site_address?: string;
    zoning_type?: string;
    acres?: number;
    legal_description?: string;
    assessed_value?: number;
    geometry?: string;
    raw_json: string;
  }>;
  screening?: Array<{
    parcel_id: string;
    screen_type: string;
    result_json: string;
  }>;
}

export function validateSyncToken(request: Request, env: Env): boolean {
  const token = request.headers.get("X-Sync-Token");
  return !!env.SYNC_TOKEN && token === env.SYNC_TOKEN;
}

export async function handleSyncBatch(db: D1Database, batch: SyncBatch): Promise<{ parcels: number; screening: number }> {
  const now = Math.floor(Date.now() / 1000);
  let parcelCount = 0;
  let screenCount = 0;

  if (batch.parcels?.length) {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO parcels
       (parcel_id, owner_name, site_address, zoning_type, acres, legal_description, assessed_value, geometry, raw_json, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // D1 batch limit is 100 statements per batch
    const chunks = chunkArray(batch.parcels, 100);
    for (const chunk of chunks) {
      await db.batch(
        chunk.map((p) =>
          stmt.bind(
            p.parcel_id,
            p.owner_name ?? null,
            p.site_address ?? null,
            p.zoning_type ?? null,
            p.acres ?? null,
            p.legal_description ?? null,
            p.assessed_value ?? null,
            p.geometry ?? null,
            p.raw_json,
            now
          )
        )
      );
      parcelCount += chunk.length;
    }
  }

  if (batch.screening?.length) {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO screening (parcel_id, screen_type, result_json, synced_at)
       VALUES (?, ?, ?, ?)`
    );
    const chunks = chunkArray(batch.screening, 100);
    for (const chunk of chunks) {
      await db.batch(
        chunk.map((s) => stmt.bind(s.parcel_id, s.screen_type, s.result_json, now))
      );
      screenCount += chunk.length;
    }
  }

  // Update sync status
  await db
    .prepare("UPDATE sync_status SET last_sync_at = ?, rows_synced = rows_synced + ?, last_error = NULL, updated_at = ? WHERE id = 'main'")
    .bind(now, parcelCount + screenCount, now)
    .run();

  return { parcels: parcelCount, screening: screenCount };
}

export async function getSyncStatus(db: D1Database) {
  const status = await db.prepare("SELECT * FROM sync_status WHERE id = 'main'").first();
  const parcelCount = await db.prepare("SELECT COUNT(*) as count FROM parcels").first<{ count: number }>();
  const screenCount = await db.prepare("SELECT COUNT(*) as count FROM screening").first<{ count: number }>();
  return {
    ...status,
    total_parcels: parcelCount?.count ?? 0,
    total_screening: screenCount?.count ?? 0,
  };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
```

**Step 2: Add sync routes to `src/index.ts`**

Add these route handlers inside the fetch handler, after auth check but before the route matching:

```typescript
// Sync endpoints — separate auth
if (url.pathname === "/admin/sync" && request.method === "POST") {
  if (!validateSyncToken(request, env)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (!env.DB) {
    return jsonResponse({ error: "D1 not configured" }, 500);
  }
  const batch = await request.json() as SyncBatch;
  const result = await handleSyncBatch(env.DB, batch);
  return jsonResponse({ ok: true, ...result });
}

if (url.pathname === "/admin/sync/status" && request.method === "GET") {
  if (!validateBearer(request, env)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (!env.DB) {
    return jsonResponse({ error: "D1 not configured" }, 500);
  }
  const status = await getSyncStatus(env.DB);
  return jsonResponse(status);
}
```

**Step 3: Deploy and test**

```bash
npx wrangler deploy

# Test sync status
curl -H "Authorization: Bearer <token>" \
  https://gateway.gallagherpropco.com/admin/sync/status
```

**Step 4: Commit**

```bash
git add infra/gateway-proxy/src/sync.ts infra/gateway-proxy/src/index.ts
git commit -m "feat(gateway-proxy): sync endpoint for D1 parcel data population"
```

---

### Task 8: Create Windows-side sync script

**Files:**
- Create: `infra/gateway-proxy/scripts/sync-to-d1.py`

**Step 1: Create sync script**

This script runs on the Windows PC as a scheduled task (every 15 min). It queries the Property DB and pushes batches to the CF Worker sync endpoint.

```python
#!/usr/bin/env python3
"""Sync Property DB parcels to CF Worker D1 cache.

Runs on the Windows PC via Windows Task Scheduler every 15 minutes.
Queries the local Property DB and POSTs batches to the CF Worker /admin/sync endpoint.

Usage:
  python sync-to-d1.py                    # incremental sync (since last run)
  python sync-to-d1.py --full             # full sync (all parcels)
  python sync-to-d1.py --dry-run          # show what would sync, don't push

Env vars:
  DATABASE_URL          - Property DB connection string (postgresql://...)
  GATEWAY_PROXY_URL     - CF Worker URL (https://gateway.gallagherpropco.com)
  SYNC_TOKEN            - Auth token for /admin/sync endpoint
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("pip install psycopg2-binary")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sync-to-d1")

BATCH_SIZE = 1000
SYNC_STATE_FILE = os.path.join(os.path.dirname(__file__), ".sync-state.json")


def load_last_sync() -> int:
    """Load unix timestamp of last successful sync."""
    try:
        with open(SYNC_STATE_FILE) as f:
            return json.load(f).get("last_sync_at", 0)
    except (FileNotFoundError, json.JSONDecodeError):
        return 0


def save_last_sync(ts: int):
    with open(SYNC_STATE_FILE, "w") as f:
        json.dump({"last_sync_at": ts, "synced_at_human": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()}, f)


def fetch_parcels(conn, since_ts: int, full: bool):
    """Yield batches of parcels from Property DB."""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if full:
        cur.execute("""
            SELECT parcel_id, owner_name, site_address, zoning_type,
                   acres, legal_description, assessed_value,
                   ST_AsGeoJSON(geom) as geometry
            FROM ebr_parcels
            ORDER BY parcel_id
        """)
    else:
        cur.execute("""
            SELECT parcel_id, owner_name, site_address, zoning_type,
                   acres, legal_description, assessed_value,
                   ST_AsGeoJSON(geom) as geometry
            FROM ebr_parcels
            WHERE EXTRACT(EPOCH FROM COALESCE(updated_at, created_at, NOW())) > %s
            ORDER BY parcel_id
        """, (since_ts,))

    batch = []
    for row in cur:
        raw = dict(row)
        batch.append({
            "parcel_id": raw["parcel_id"],
            "owner_name": raw.get("owner_name"),
            "site_address": raw.get("site_address"),
            "zoning_type": raw.get("zoning_type"),
            "acres": float(raw["acres"]) if raw.get("acres") else None,
            "legal_description": raw.get("legal_description"),
            "assessed_value": float(raw["assessed_value"]) if raw.get("assessed_value") else None,
            "geometry": raw.get("geometry"),
            "raw_json": json.dumps(raw, default=str),
        })
        if len(batch) >= BATCH_SIZE:
            yield batch
            batch = []
    if batch:
        yield batch
    cur.close()


def push_batch(gateway_url: str, sync_token: str, parcels: list) -> dict:
    """POST a batch of parcels to the CF Worker sync endpoint."""
    resp = requests.post(
        f"{gateway_url}/admin/sync",
        json={"parcels": parcels},
        headers={"X-Sync-Token": sync_token, "Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description="Sync Property DB to D1 cache")
    parser.add_argument("--full", action="store_true", help="Full sync (all parcels)")
    parser.add_argument("--dry-run", action="store_true", help="Show counts, don't push")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    gateway_url = os.environ.get("GATEWAY_PROXY_URL", "https://gateway.gallagherpropco.com")
    sync_token = os.environ.get("SYNC_TOKEN")

    if not db_url:
        log.error("DATABASE_URL not set")
        sys.exit(1)
    if not sync_token and not args.dry_run:
        log.error("SYNC_TOKEN not set")
        sys.exit(1)

    since_ts = 0 if args.full else load_last_sync()
    sync_start = int(time.time())

    log.info("Connecting to Property DB...")
    conn = psycopg2.connect(db_url)

    total_rows = 0
    total_batches = 0

    try:
        for batch in fetch_parcels(conn, since_ts, args.full):
            total_batches += 1
            total_rows += len(batch)

            if args.dry_run:
                log.info(f"[dry-run] Batch {total_batches}: {len(batch)} parcels")
                continue

            log.info(f"Pushing batch {total_batches} ({len(batch)} parcels)...")
            result = push_batch(gateway_url, sync_token, batch)
            log.info(f"  -> synced: {result}")

        if not args.dry_run:
            save_last_sync(sync_start)

        log.info(f"Done. {total_rows} parcels in {total_batches} batches.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
```

**Step 2: Test dry-run locally (requires DB access)**

```bash
# On the Windows PC (via SSH or directly):
cd /path/to/gallagher-cres/infra/gateway-proxy/scripts
pip install psycopg2-binary requests
DATABASE_URL="postgresql://postgres:password@localhost:5432/entitlement_os" \
  python sync-to-d1.py --full --dry-run
```

Expected: Logs batch counts, doesn't push.

**Step 3: Commit**

```bash
git add infra/gateway-proxy/scripts/sync-to-d1.py
git commit -m "feat(gateway-proxy): Python sync script for Windows PC → D1 data push"
```

---

### Task 9: Implement D1 parcel search fallback

**Files:**
- Create: `infra/gateway-proxy/src/d1-search.ts`
- Modify: `infra/gateway-proxy/src/index.ts`

**Step 1: Create `src/d1-search.ts`**

When the gateway is down and the generic cache doesn't have the exact query, search the D1 `parcels` table directly.

```typescript
export async function searchParcelsD1(
  db: D1Database,
  params: { address?: string; limit?: number }
): Promise<{ data: unknown[]; count: number } | null> {
  const limit = Math.min(params.limit ?? 50, 200);

  if (!params.address) return null;

  // Simple LIKE search on address and owner
  const term = `%${params.address}%`;
  const result = await db
    .prepare(
      `SELECT raw_json, synced_at FROM parcels
       WHERE site_address LIKE ?1 OR owner_name LIKE ?1
       ORDER BY site_address
       LIMIT ?2`
    )
    .bind(term, limit)
    .all();

  if (!result.results?.length) return null;

  return {
    data: result.results.map((r: Record<string, unknown>) => JSON.parse(r.raw_json as string)),
    count: result.results.length,
  };
}

export async function getParcelD1(
  db: D1Database,
  parcelId: string
): Promise<unknown | null> {
  const row = await db
    .prepare("SELECT raw_json FROM parcels WHERE parcel_id = ?")
    .bind(parcelId)
    .first<{ raw_json: string }>();

  return row ? JSON.parse(row.raw_json) : null;
}

export async function getScreeningD1(
  db: D1Database,
  parcelId: string,
  screenType: string
): Promise<unknown | null> {
  const row = await db
    .prepare("SELECT result_json FROM screening WHERE parcel_id = ? AND screen_type = ?")
    .bind(parcelId, screenType)
    .first<{ result_json: string }>();

  return row ? JSON.parse(row.result_json) : null;
}
```

**Step 2: Update `src/index.ts` to use D1 search as secondary fallback**

After the generic cache miss, before the 502 error, add:

```typescript
// Generic cache missed — try D1 parcel table search
if (env.DB && route.d1Fallback) {
  const d1Result = await route.d1Fallback(env.DB, url.searchParams);
  if (d1Result) {
    const now = Math.floor(Date.now() / 1000);
    // Find oldest synced_at to report staleness
    return jsonResponse(
      { data: d1Result, source: "d1-cache", staleness_seconds: null },
      200,
      "d1-cache"
    );
  }
}
```

Add `d1Fallback` to the `RouteMatch` interface and populate it for relevant routes in `src/routes.ts`:

```typescript
export interface RouteMatch {
  upstreamMethod: string;
  upstreamPath: string;
  buildBody?: (params: URLSearchParams) => unknown;
  d1Fallback?: (db: D1Database, params: URLSearchParams) => Promise<unknown | null>;
}
```

Wire up in the route matchers:

```typescript
// In the /parcels/search route:
d1Fallback: async (db, params) => {
  const { searchParcelsD1 } = await import("./d1-search");
  return searchParcelsD1(db, {
    address: params.get("address") ?? undefined,
    limit: params.get("limit") ? Number(params.get("limit")) : 50,
  });
}
```

**Step 3: Deploy and test**

```bash
npx wrangler deploy
```

**Step 4: Commit**

```bash
git add infra/gateway-proxy/src/d1-search.ts infra/gateway-proxy/src/index.ts infra/gateway-proxy/src/routes.ts
git commit -m "feat(gateway-proxy): D1 parcel search fallback when gateway is down"
```

---

## Phase 4: Gateway Client Package

### Task 10: Create the gateway-client package

**Files:**
- Create: `packages/gateway-client/package.json`
- Create: `packages/gateway-client/tsconfig.json`
- Create: `packages/gateway-client/src/index.ts`
- Create: `packages/gateway-client/src/client.ts`
- Create: `packages/gateway-client/src/types.ts`

**Step 1: Create `packages/gateway-client/package.json`**

```json
{
  "name": "@entitlement-os/gateway-client",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create `src/types.ts`**

```typescript
export type DataSource = "gateway" | "d1-cache" | "d1-stale";

export interface GatewayResponse<T> {
  data: T;
  source: DataSource;
  staleness_seconds: number | null;
  error?: string;
}

export interface BboxSearch {
  address?: string;
  polygon?: string;
  limit?: number;
}

export type ScreenType = "flood" | "soils" | "wetlands" | "epa" | "traffic" | "ldeq" | "zoning";

export interface GatewayClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}
```

**Step 3: Create `src/client.ts`**

```typescript
import { GatewayResponse, BboxSearch, ScreenType, GatewayClientOptions } from "./types";

export class GatewayClient {
  private baseUrl: string;
  private token: string;
  private timeoutMs: number;

  constructor(options: GatewayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<GatewayResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...options?.headers,
        },
        signal: controller.signal,
      });

      const json = await res.json() as GatewayResponse<T>;

      if (!res.ok) {
        return {
          data: null as T,
          source: json.source ?? "gateway",
          staleness_seconds: json.staleness_seconds ?? null,
          error: json.error ?? `HTTP ${res.status}`,
        };
      }

      return json;
    } catch (err) {
      const message = err instanceof Error ? err.message : "request failed";
      return {
        data: null as T,
        source: "gateway",
        staleness_seconds: null,
        error: message,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async searchParcels(params: BboxSearch): Promise<GatewayResponse<unknown[]>> {
    const qs = new URLSearchParams();
    if (params.address) qs.set("address", params.address);
    if (params.polygon) qs.set("polygon", params.polygon);
    if (params.limit) qs.set("limit", String(params.limit));
    return this.request(`/parcels/search?${qs.toString()}`);
  }

  async getParcel(parcelId: string): Promise<GatewayResponse<unknown>> {
    return this.request(`/parcels/${encodeURIComponent(parcelId)}`);
  }

  async screen(parcelId: string, type: ScreenType): Promise<GatewayResponse<unknown>> {
    return this.request(`/screening/${type}/${encodeURIComponent(parcelId)}`);
  }

  async screenFull(parcelId: string): Promise<GatewayResponse<unknown>> {
    return this.request(`/screening/full/${encodeURIComponent(parcelId)}`, {
      method: "POST",
    });
  }

  async sql(query: string): Promise<GatewayResponse<unknown[]>> {
    return this.request("/parcels/sql", {
      method: "POST",
      body: JSON.stringify({ sql: query }),
    });
  }

  async health(): Promise<GatewayResponse<{ status: string }>> {
    return this.request("/health");
  }
}
```

**Step 4: Create `src/index.ts`**

```typescript
export { GatewayClient } from "./client";
export type {
  GatewayResponse,
  BboxSearch,
  ScreenType,
  DataSource,
  GatewayClientOptions,
} from "./types";
```

**Step 5: Install deps and typecheck**

```bash
cd packages/gateway-client && pnpm install && pnpm typecheck
```

**Step 6: Commit**

```bash
git add packages/gateway-client/
git commit -m "feat(gateway-client): typed client package for CF Worker gateway proxy"
```

---

### Task 11: Write gateway-client tests

**Files:**
- Create: `packages/gateway-client/vitest.config.ts`
- Create: `packages/gateway-client/tests/client.test.ts`

**Step 1: Create test config and tests**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true } });
```

```typescript
// tests/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatewayClient } from "../src/client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(headers),
  };
}

describe("GatewayClient", () => {
  let client: GatewayClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GatewayClient({
      baseUrl: "https://gateway.gallagherpropco.com",
      token: "test-token",
    });
  });

  it("sends auth header on every request", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: [], source: "gateway", staleness_seconds: null }));
    await client.searchParcels({ address: "Main St" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/parcels/search"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
  });

  it("searchParcels builds query string", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: [{ id: 1 }], source: "gateway", staleness_seconds: null }));
    const result = await client.searchParcels({ address: "Airline Hwy", limit: 5 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("address=Airline+Hwy"),
      expect.anything()
    );
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it("getParcel encodes parcel ID", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: { id: "A/B" }, source: "gateway", staleness_seconds: null }));
    await client.getParcel("A/B");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/parcels/A%2FB"),
      expect.anything()
    );
  });

  it("screen routes to correct type endpoint", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: {}, source: "d1-cache", staleness_seconds: 120 }));
    const result = await client.screen("P-123", "flood");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/screening/flood/P-123"),
      expect.anything()
    );
    expect(result.source).toBe("d1-cache");
  });

  it("returns error on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    const result = await client.searchParcels({ address: "test" });
    expect(result.error).toBe("network error");
    expect(result.data).toBeNull();
  });

  it("returns error on HTTP error", async () => {
    mockFetch.mockResolvedValue(mockResponse({ error: "unauthorized", source: "gateway", staleness_seconds: null }, 401));
    const result = await client.searchParcels({ address: "test" });
    expect(result.error).toBe("unauthorized");
  });
});
```

**Step 2: Run tests**

```bash
cd packages/gateway-client && npx vitest run
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add packages/gateway-client/vitest.config.ts packages/gateway-client/tests/
git commit -m "test(gateway-client): unit tests for GatewayClient methods"
```

---

## Phase 5: Web App Migration

### Task 12: Create shared gateway-client instance

**Files:**
- Create: `apps/web/lib/server/gatewayClient.ts`

**Step 1: Create the singleton**

```typescript
// apps/web/lib/server/gatewayClient.ts
import "server-only";
import { GatewayClient } from "@entitlement-os/gateway-client";

let _client: GatewayClient | null = null;

export function getGatewayClient(): GatewayClient {
  if (!_client) {
    const baseUrl = process.env.GATEWAY_PROXY_URL;
    const token = process.env.GATEWAY_PROXY_TOKEN;

    if (!baseUrl || !token) {
      throw new Error("GATEWAY_PROXY_URL and GATEWAY_PROXY_TOKEN must be set");
    }

    _client = new GatewayClient({ baseUrl, token });
  }
  return _client;
}
```

**Step 2: Force-add to git** (remember: root `.gitignore` has `lib/` pattern)

```bash
git add -f apps/web/lib/server/gatewayClient.ts
git commit -m "feat(web): shared gateway-client singleton for server-side use"
```

---

### Task 13: Migrate parcels API route

**Files:**
- Modify: `apps/web/app/api/parcels/route.ts`

**Context:** This file currently has a 3-level fallback chain (gateway → org-scoped Prisma → org search matches). Read the current file first to understand the exact structure, then replace the gateway calls with `getGatewayClient().searchParcels()`.

**Step 1: Read the current file**

Examine `apps/web/app/api/parcels/route.ts` — understand how `gatewaySearchParcels()` is called and what the response normalization looks like.

**Step 2: Replace gateway calls**

Replace imports of `gatewaySearchParcels` / `gatewaySearchParcelsByPoint` with:

```typescript
import { getGatewayClient } from "@/lib/server/gatewayClient";
```

Replace the gateway call block. The old pattern:

```typescript
const gatewayResult = await gatewaySearchParcels(address, ...);
```

Becomes:

```typescript
const client = getGatewayClient();
const result = await client.searchParcels({ address, limit });
if (result.error) {
  // The CF Worker already handles fallback to D1 — if even D1 fails,
  // fall back to org-scoped Prisma (keep existing Prisma fallback)
}
```

**Step 3: Remove the 3-level fallback chain** — the CF Worker handles gateway→D1 fallback. Keep only a minimal Prisma fallback for when the Worker itself is unreachable (should be extremely rare since it's on Cloudflare's edge).

**Step 4: Add response source header**

```typescript
// Pass through the source from the Worker
const headers = new Headers();
headers.set("X-GPC-Source", result.source);
```

**Step 5: Run existing tests**

```bash
cd apps/web && pnpm test -- --grep parcels
```

Expected: Tests pass (may need to update mocks for new client).

**Step 6: Commit**

```bash
git add apps/web/app/api/parcels/route.ts
git commit -m "refactor(parcels): use gateway-client instead of direct gateway calls"
```

---

### Task 14: Migrate agent property tools

**Files:**
- Modify: `packages/openai/src/tools/propertyDbTools.ts`

**Context:** This file contains `gatewayPost()`, `gatewaySearchParcels()`, retry logic, CF Access headers, TTL cache. All of this moves into the CF Worker. The tools should use `GatewayClient` instead.

**Step 1: Read the current file**

Examine `packages/openai/src/tools/propertyDbTools.ts` to understand all exports and consumers.

**Step 2: Replace gateway internals**

Remove:
- `gatewayPost()` function
- `ttlCache` implementation
- CF Access header construction
- Retry/backoff logic

Replace with:

```typescript
import { GatewayClient } from "@entitlement-os/gateway-client";

function getClient(): GatewayClient {
  const baseUrl = process.env.GATEWAY_PROXY_URL;
  const token = process.env.GATEWAY_PROXY_TOKEN;
  if (!baseUrl || !token) throw new Error("Gateway proxy not configured");
  return new GatewayClient({ baseUrl, token });
}
```

Update each tool function to use `getClient()` methods. Keep the tool definitions (Zod schemas, descriptions) unchanged — only the implementation body changes.

**Step 3: Keep normalize functions** — these are still needed for converting gateway response shapes to Prisma model shapes. They stay in the file (or move to gateway-client if shared).

**Step 4: Run tests**

```bash
cd packages/openai && pnpm test
```

**Step 5: Commit**

```bash
git add packages/openai/src/tools/propertyDbTools.ts
git commit -m "refactor(tools): use gateway-client, remove direct gateway calls and retry logic"
```

---

### Task 15: Delete propertyDbRpc.ts and clean up

**Files:**
- Delete: `apps/web/lib/server/propertyDbRpc.ts`
- Modify: any files that import from it

**Step 1: Find all imports of propertyDbRpc**

```bash
grep -r "propertyDbRpc" apps/web/ packages/ --include="*.ts" --include="*.tsx" -l
```

**Step 2: Update each importing file** to use `getGatewayClient()` instead.

**Step 3: Delete the file**

```bash
rm apps/web/lib/server/propertyDbRpc.ts
```

**Step 4: Run full build**

```bash
pnpm build && pnpm typecheck
```

**Step 5: Run full test suite**

```bash
pnpm test
```

**Step 6: Commit**

```bash
git rm apps/web/lib/server/propertyDbRpc.ts
git add -A
git commit -m "refactor: delete propertyDbRpc.ts — all gateway calls via gateway-client"
```

---

### Task 16: Update Vercel environment variables

**Step 1: Add new env vars on Vercel**

```bash
vercel env add GATEWAY_PROXY_URL production
# Value: https://gateway.gallagherpropco.com

vercel env add GATEWAY_PROXY_TOKEN production
# Value: (the token you set as GATEWAY_PROXY_TOKEN in the Worker secrets)
```

**Step 2: Remove old env vars from Vercel** (after confirming new ones work)

These can be removed once migration is verified:
- `LOCAL_API_KEY` (now only in CF Worker)
- `CF_ACCESS_CLIENT_ID` (now only in CF Worker)
- `CF_ACCESS_CLIENT_SECRET` (now only in CF Worker)

**Step 3: Deploy to Vercel**

```bash
vercel --prod --archive=tgz
```

**Step 4: Verify production**

```bash
curl https://gallagherpropco.com/api/parcels?address=Airline+Hwy&limit=2
```

Expected: Returns parcels with `X-GPC-Source` header.

**Step 5: Commit env var documentation**

Update `.env.example` or docs with new vars. Commit if changed.

---

## Phase 6: Admin Dashboard

### Task 17: Scaffold admin dashboard on CF Pages

**Files:**
- Create: `infra/admin-dashboard/package.json`
- Create: `infra/admin-dashboard/public/index.html`
- Create: `infra/admin-dashboard/public/app.js`
- Create: `infra/admin-dashboard/public/style.css`
- Create: `infra/admin-dashboard/functions/api/health.ts`
- Create: `infra/admin-dashboard/functions/api/containers.ts`
- Create: `infra/admin-dashboard/functions/api/sync.ts`
- Create: `infra/admin-dashboard/functions/api/deploys.ts`
- Create: `infra/admin-dashboard/functions/api/sql.ts`
- Create: `infra/admin-dashboard/wrangler.toml`

**This task is large. Break it down into sub-tasks:**

**Step 1: Create project structure**

```bash
mkdir -p infra/admin-dashboard/{public,functions/api}
```

**Step 2: Create `wrangler.toml`**

```toml
name = "gpc-admin-dashboard"
pages_build_output_dir = "./public"

[[d1_databases]]
binding = "DB"
database_name = "gpc-gateway-cache"
database_id = "<same-id-as-gateway-proxy>"

[vars]
GATEWAY_PROXY_URL = "https://gateway.gallagherpropco.com"
```

**Step 3: Create `public/index.html`**

Build a single-page dashboard with tabs: Health, Containers, SQL, Deploys, Sync. Use vanilla HTML/JS with minimal CSS. The dashboard calls its own `/api/*` Pages Functions, which in turn call the CF Worker or read from D1.

Key features per tab:
- **Health:** Fetch `/api/health` → display gateway status, last sync, uptime chart (last 24h from D1 health_checks table)
- **Containers:** Fetch `/api/containers` → table with name, status, uptime, restart/stop/start buttons
- **SQL:** Textarea + run button → POST `/api/sql` → results table
- **Deploys:** Fetch `/api/deploys` → table of last 10, "Deploy Now" button (POST to GitHub API), rollback button
- **Sync:** Fetch `/api/sync` → last sync time, row counts, "Force Sync" button

**Step 4: Create Pages Functions** (one per API route)

Each function calls the upstream CF Worker (for gateway admin endpoints) or reads D1 directly (for health history, deploy history).

Example: `functions/api/health.ts`:

```typescript
interface Env {
  GATEWAY_PROXY_URL: string;
  GATEWAY_PROXY_TOKEN: string;
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;

  // Probe gateway via CF Worker
  const proxyHealth = await fetch(`${env.GATEWAY_PROXY_URL}/health`, {
    headers: { Authorization: `Bearer ${env.GATEWAY_PROXY_TOKEN}` },
    signal: AbortSignal.timeout(5000),
  }).then(r => r.json()).catch(() => ({ status: "down" }));

  // Get D1 stats
  const syncStatus = await env.DB.prepare("SELECT * FROM sync_status WHERE id = 'main'").first();
  const recentChecks = await env.DB.prepare(
    "SELECT * FROM health_checks ORDER BY checked_at DESC LIMIT 720"
  ).all(); // 720 = 24h at 2-min intervals

  return Response.json({
    gateway: proxyHealth,
    sync: syncStatus,
    health_history: recentChecks.results,
  });
};
```

**Step 5: Deploy**

```bash
cd infra/admin-dashboard && npx wrangler pages deploy ./public
```

**Step 6: Configure Cloudflare Access** — add `admin.gallagherpropco.com` to your Access policy (Blake only).

**Step 7: Commit**

```bash
git add infra/admin-dashboard/
git commit -m "feat(admin): CF Pages admin dashboard with health, containers, SQL, deploys, sync views"
```

---

### Task 18: Deploy admin API to production gateway

**Context:** The admin router (`infra/local-api/admin_router.py`) exists in the repo but is NOT deployed to the production gateway. This is a prerequisite for the Containers and SQL tabs to work.

**Step 1: Verify admin_router.py is still compatible**

Read `infra/local-api/admin_router.py` and `infra/local-api/main.py`. Confirm the admin router mounts correctly.

**Step 2: Deploy to Windows PC**

SSH to Windows PC and rebuild:

```bash
ssh cres_admin@ssh.gallagherpropco.com
cd C:\gpc-cres-backend
git pull --ff-only
docker compose up -d --build gateway
```

**Step 3: Verify admin endpoints**

```bash
curl -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  https://api.gallagherpropco.com/admin/health
```

Expected: JSON with container statuses and DB connectivity.

**Step 4: Commit** (if any changes were needed to admin_router.py)

---

## Phase 7: CI/CD

### Task 19: Create GitHub Action for gateway deploys

**Files:**
- Create: `.github/workflows/deploy-gateway.yml`

**Step 1: Create the workflow file**

```yaml
name: Deploy Gateway

on:
  push:
    branches: [main]
    paths:
      - 'infra/local-api/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Install cloudflared
        run: |
          curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
          chmod +x cloudflared
          sudo mv cloudflared /usr/local/bin/

      - name: Configure SSH
        env:
          SSH_KEY: ${{ secrets.WINDOWS_SSH_KEY }}
          CF_ACCESS_CLIENT_ID: ${{ secrets.CF_ACCESS_CLIENT_ID }}
          CF_ACCESS_CLIENT_SECRET: ${{ secrets.CF_ACCESS_CLIENT_SECRET }}
        run: |
          mkdir -p ~/.ssh
          echo "$SSH_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          cat >> ~/.ssh/config << 'EOF'
          Host gpc-windows
            HostName ssh.gallagherpropco.com
            User cres_admin
            IdentityFile ~/.ssh/id_ed25519
            ProxyCommand cloudflared access ssh --hostname %h --id $CF_ACCESS_CLIENT_ID --secret $CF_ACCESS_CLIENT_SECRET
            StrictHostKeyChecking no
          EOF

      - name: Deploy to Windows PC
        id: deploy
        run: |
          ssh gpc-windows 'cd C:\gpc-cres-backend && git pull --ff-only && docker compose up -d --build gateway'
          echo "Waiting 30s for gateway startup..."
          sleep 30

      - name: Health check
        id: healthcheck
        env:
          GATEWAY_ADMIN_TOKEN: ${{ secrets.GATEWAY_ADMIN_TOKEN }}
          CF_ACCESS_CLIENT_ID: ${{ secrets.CF_ACCESS_CLIENT_ID }}
          CF_ACCESS_CLIENT_SECRET: ${{ secrets.CF_ACCESS_CLIENT_SECRET }}
        run: |
          STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
            -H "Authorization: Bearer $GATEWAY_ADMIN_TOKEN" \
            -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
            -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
            https://api.gallagherpropco.com/admin/health)
          if [ "$STATUS" != "200" ]; then
            echo "Health check failed with status $STATUS"
            exit 1
          fi
          echo "Gateway healthy"

      - name: Report deploy status
        if: always()
        env:
          GATEWAY_PROXY_TOKEN: ${{ secrets.GATEWAY_PROXY_TOKEN }}
        run: |
          STATUS="${{ steps.healthcheck.outcome }}"
          COMMIT=$(git rev-parse --short HEAD)
          curl -s -X POST \
            -H "Authorization: Bearer $GATEWAY_PROXY_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"commit\": \"$COMMIT\", \"status\": \"$STATUS\", \"triggered_by\": \"github-action\"}" \
            https://gateway.gallagherpropco.com/admin/deploys/report || true
```

**Step 2: Add GitHub Secrets**

In the repo's GitHub Settings → Secrets and Variables → Actions, add:
- `WINDOWS_SSH_KEY` — the SSH private key for `cres_admin`
- `CF_ACCESS_CLIENT_ID` — Cloudflare Access service token ID
- `CF_ACCESS_CLIENT_SECRET` — Cloudflare Access service token secret
- `GATEWAY_ADMIN_TOKEN` — the `ADMIN_API_KEY` for the gateway
- `GATEWAY_PROXY_TOKEN` — the proxy token for the CF Worker

**Step 3: Add deploy reporting endpoint to CF Worker**

Add to `infra/gateway-proxy/src/index.ts`:

```typescript
// POST /admin/deploys/report
if (url.pathname === "/admin/deploys/report" && request.method === "POST") {
  if (!validateBearer(request, env)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 500);
  const body = await request.json() as { commit?: string; status?: string; triggered_by?: string };
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO deploys (deployed_at, commit_hash, status, triggered_by) VALUES (?, ?, ?, ?)"
  ).bind(now, body.commit ?? "unknown", body.status ?? "unknown", body.triggered_by ?? "unknown").run();
  return jsonResponse({ ok: true });
}
```

**Step 4: Commit**

```bash
git add .github/workflows/deploy-gateway.yml infra/gateway-proxy/src/index.ts
git commit -m "feat(ci): GitHub Action for automated gateway deploys with health check"
```

---

## Phase 8: Health Monitoring

### Task 20: Implement CF Cron health monitoring

**Files:**
- Create: `infra/gateway-proxy/src/health.ts`
- Modify: `infra/gateway-proxy/src/index.ts` (add scheduled handler)
- Modify: `infra/gateway-proxy/wrangler.toml` (enable cron trigger)

**Step 1: Create `src/health.ts`**

```typescript
import { Env } from "./types";

interface ProbeResult {
  name: string;
  ok: boolean;
  latency_ms: number;
  error?: string;
}

async function probe(url: string, headers: Record<string, string>, timeoutMs: number): Promise<ProbeResult> {
  const start = Date.now();
  const name = new URL(url).pathname || url;
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { name, ok: res.ok, latency_ms: Date.now() - start };
  } catch (err) {
    return { name, ok: false, latency_ms: Date.now() - start, error: String(err) };
  }
}

export async function runHealthCheck(env: Env): Promise<{
  gateway_ok: boolean;
  tiles_ok: boolean;
  latency_ms: number;
  probes: ProbeResult[];
  action_taken: string | null;
}> {
  const upstreamHeaders: Record<string, string> = {
    "Authorization": `Bearer ${env.LOCAL_API_KEY}`,
  };
  if (env.CF_ACCESS_CLIENT_ID) {
    upstreamHeaders["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
  }
  if (env.CF_ACCESS_CLIENT_SECRET) {
    upstreamHeaders["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }

  const probes = await Promise.all([
    probe(`${env.UPSTREAM_GATEWAY_URL}/health`, upstreamHeaders, 3000),
    probe("https://tiles.gallagherpropco.com/health", {}, 3000),
  ]);

  const gateway_ok = probes[0].ok;
  const tiles_ok = probes[1].ok;
  const latency_ms = Math.max(...probes.map(p => p.latency_ms));

  let action_taken: string | null = null;

  // Auto-recovery: if gateway is down, try restart via admin API
  if (!gateway_ok) {
    try {
      const restartRes = await fetch(
        `${env.UPSTREAM_GATEWAY_URL}/admin/containers/gateway/restart`,
        { method: "POST", headers: upstreamHeaders, signal: AbortSignal.timeout(5000) }
      );
      action_taken = restartRes.ok ? "restart_attempted" : "restart_failed";
    } catch {
      action_taken = "restart_unreachable";
    }
  }

  return { gateway_ok, tiles_ok, latency_ms, probes, action_taken };
}

export async function saveHealthCheck(db: D1Database, result: Awaited<ReturnType<typeof runHealthCheck>>) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    `INSERT INTO health_checks (checked_at, gateway_ok, tiles_ok, latency_ms, error, action_taken)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    now,
    result.gateway_ok ? 1 : 0,
    result.tiles_ok ? 1 : 0,
    result.latency_ms,
    result.probes.filter(p => !p.ok).map(p => p.error).join("; ") || null,
    result.action_taken
  ).run();

  // Prune old entries (keep 7 days = 5040 entries at 2-min intervals)
  const cutoff = now - 7 * 24 * 60 * 60;
  await db.prepare("DELETE FROM health_checks WHERE checked_at < ?").bind(cutoff).run();
}

export async function sendAlert(env: Env, result: Awaited<ReturnType<typeof runHealthCheck>>) {
  // Only alert if gateway is down
  if (result.gateway_ok) return;

  const message = `Gateway DOWN. Action: ${result.action_taken}. Probes: ${JSON.stringify(result.probes)}`;

  // Sentry alert (if SENTRY_DSN configured)
  // For now, log to console (visible in Worker logs)
  console.error(`[HEALTH ALERT] ${message}`);

  // TODO: Add Slack webhook integration
  // const slackUrl = env.SLACK_WEBHOOK_URL;
  // if (slackUrl) { await fetch(slackUrl, { method: "POST", body: JSON.stringify({ text: message }) }); }
}
```

**Step 2: Add scheduled handler to `src/index.ts`**

```typescript
import { runHealthCheck, saveHealthCheck, sendAlert } from "./health";

// Add to the export default:
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ... existing fetch handler
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const result = await runHealthCheck(env);

    if (env.DB) {
      ctx.waitUntil(saveHealthCheck(env.DB, result));
    }

    if (!result.gateway_ok) {
      ctx.waitUntil(sendAlert(env, result));
    }
  },
} satisfies ExportedHandler<Env>;
```

**Step 3: Enable cron in `wrangler.toml`**

```toml
[triggers]
crons = ["*/2 * * * *"]
```

**Step 4: Deploy**

```bash
cd infra/gateway-proxy && npx wrangler deploy
```

**Step 5: Verify cron is running**

Check Cloudflare dashboard → Workers → gpc-gateway-proxy → Triggers → Cron Triggers. Should show `*/2 * * * *` active.

**Step 6: Commit**

```bash
git add infra/gateway-proxy/src/health.ts infra/gateway-proxy/src/index.ts infra/gateway-proxy/wrangler.toml
git commit -m "feat(gateway-proxy): CF Cron health monitoring with auto-restart and alerting"
```

---

## Phase 9: Windows Sync Setup

### Task 21: Configure sync on the Windows PC

**This task requires SSH access to the Windows PC.**

**Step 1: Copy sync script to Windows**

```bash
scp infra/gateway-proxy/scripts/sync-to-d1.py cres_admin@ssh.gallagherpropco.com:C:/gpc-cres-backend/scripts/
```

**Step 2: SSH in and install Python deps**

```bash
ssh cres_admin@ssh.gallagherpropco.com
pip install psycopg2-binary requests
```

**Step 3: Create environment file**

```bash
# On Windows PC, create C:\gpc-cres-backend\scripts\.env.sync
DATABASE_URL=postgresql://postgres:password@localhost:5432/entitlement_os
GATEWAY_PROXY_URL=https://gateway.gallagherpropco.com
SYNC_TOKEN=<the-sync-token-from-wrangler-secrets>
```

**Step 4: Test sync**

```bash
cd C:\gpc-cres-backend\scripts
set /p line=<.env.sync & python sync-to-d1.py --full --dry-run
```

Then run for real:

```bash
python sync-to-d1.py --full
```

Expected: All ~198K parcels synced in batches of 1000.

**Step 5: Create Windows Scheduled Task** (every 15 minutes)

```powershell
$action = New-ScheduledTaskAction -Execute "python" -Argument "C:\gpc-cres-backend\scripts\sync-to-d1.py" -WorkingDirectory "C:\gpc-cres-backend\scripts"
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 365) -At (Get-Date)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "GPC-D1-Sync" -Action $action -Trigger $trigger -Settings $settings -User "cres_admin" -RunLevel Highest
```

**Step 6: Verify scheduled task**

```powershell
Get-ScheduledTask -TaskName "GPC-D1-Sync" | Format-List
```

**Step 7: Verify sync status via Worker**

```bash
curl -H "Authorization: Bearer <token>" https://gateway.gallagherpropco.com/admin/sync/status
```

Expected: Shows total_parcels ~198K, last_sync_at recent.

---

## Phase 10: Cleanup and Verification

### Task 22: Remove old env vars from Vercel

**Step 1: Verify the new gateway-client is working in production**

```bash
curl -v https://gallagherpropco.com/api/parcels?address=Airline+Hwy&limit=2 2>&1 | grep X-GPC-Source
```

Expected: `X-GPC-Source: gateway`

**Step 2: Remove old env vars**

```bash
vercel env rm LOCAL_API_KEY production
vercel env rm CF_ACCESS_CLIENT_ID production
vercel env rm CF_ACCESS_CLIENT_SECRET production
```

**Step 3: Redeploy**

```bash
rm -rf apps/web/.next && vercel --prod --archive=tgz
```

**Step 4: Verify nothing broke**

Test all surfaces: property search, parcel detail, screening, map tiles, chat.

---

### Task 23: Update documentation

**Files:**
- Modify: `CLAUDE.md` — update Database Topology section, remove scattered gateway references, add Gateway Proxy section
- Modify: `docs/claude/architecture.md` — update architecture diagram
- Modify: `docs/claude/backend.md` — update gateway section

**Step 1: Update CLAUDE.md**

Add a new section:

```markdown
## Gateway Proxy (gateway.gallagherpropco.com)

All property data requests go through the CF Worker at `gateway.gallagherpropco.com`. The Worker proxies to the Windows gateway when online, falls back to D1 (Cloudflare edge SQLite) when offline.

- **Web app config:** `GATEWAY_PROXY_URL` + `GATEWAY_PROXY_TOKEN` env vars
- **Client package:** `packages/gateway-client/` — `GatewayClient` class
- **Worker code:** `infra/gateway-proxy/`
- **Admin dashboard:** `admin.gallagherpropco.com` (CF Pages)
- **CI/CD:** `.github/workflows/deploy-gateway.yml` — auto-deploys on push to `infra/local-api/**`
- **Health monitoring:** CF Cron every 2 min with auto-restart
- **Data sync:** Windows PC pushes to D1 every 15 min
```

Remove the old notes about `LOCAL_API_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` being needed in the web app.

**Step 2: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: update architecture for gateway proxy migration"
```

---

### Task 24: End-to-end verification

**Step 1: Test normal flow** (gateway up)

```bash
# Property search
curl -H "Authorization: Bearer <token>" "https://gateway.gallagherpropco.com/parcels/search?address=Airline&limit=2"
# Expected: source: "gateway"

# Parcel detail
curl -H "Authorization: Bearer <token>" "https://gateway.gallagherpropco.com/parcels/E0001234"
# Expected: source: "gateway"

# Screening
curl -H "Authorization: Bearer <token>" "https://gateway.gallagherpropco.com/screening/flood/E0001234"
# Expected: source: "gateway"

# SQL
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"sql": "SELECT COUNT(*) FROM ebr_parcels"}' \
  "https://gateway.gallagherpropco.com/parcels/sql"
# Expected: source: "gateway"
```

**Step 2: Test fallback** (simulate gateway down)

Stop the gateway container on Windows, then repeat the same requests.

```bash
ssh cres_admin@ssh.gallagherpropco.com "docker compose stop gateway"

# Repeat parcel search
curl -H "Authorization: Bearer <token>" "https://gateway.gallagherpropco.com/parcels/search?address=Airline&limit=2"
# Expected: source: "d1-cache" or "d1-stale", data still returned

# Restart gateway
ssh cres_admin@ssh.gallagherpropco.com "docker compose start gateway"
```

**Step 3: Test admin dashboard**

Open `https://admin.gallagherpropco.com` — verify Health, Containers, SQL tabs work.

**Step 4: Test CI/CD**

Make a trivial change to `infra/local-api/`, push to main, verify GitHub Action runs and deploys.

**Step 5: Test health monitoring**

Check D1 for recent health_checks entries:

```bash
curl -H "Authorization: Bearer <token>" "https://gateway.gallagherpropco.com/admin/sync/status"
```

Or query D1 directly via wrangler:

```bash
cd infra/gateway-proxy && npx wrangler d1 execute gpc-gateway-cache \
  --command="SELECT * FROM health_checks ORDER BY checked_at DESC LIMIT 5"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1 | Tasks 1-4 | CF Worker proxy deployed, pass-through to gateway |
| 2 | Tasks 5-6 | D1 cache with automatic fallback |
| 3 | Tasks 7-9 | Data sync from Windows → D1, parcel search fallback |
| 4 | Tasks 10-11 | `@entitlement-os/gateway-client` package |
| 5 | Tasks 12-16 | Web app migrated to use gateway-client |
| 6 | Tasks 17-18 | Admin dashboard + admin API deployed |
| 7 | Task 19 | GitHub Actions CI/CD for gateway deploys |
| 8 | Task 20 | Health monitoring with auto-recovery |
| 9 | Task 21 | Windows sync scheduled task |
| 10 | Tasks 22-24 | Cleanup, docs, end-to-end verification |
