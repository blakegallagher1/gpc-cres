import "server-only";

// ---------------------------------------------------------------------------
// Config — two-header auth pattern
//
// Kong API gateway checks `apikey` header (must be a recognized project key).
// PostgREST reads `Authorization: Bearer <JWT>` and sets the DB role from
// the JWT's `role` claim. The external_reader role can only EXECUTE 6 RPCs.
// ---------------------------------------------------------------------------

interface ChatgptAppsConfig {
  url: string;
  anonKey: string;
  extJwt: string;
  timeoutMs: number;
  maxRetries: number;
}

let _config: ChatgptAppsConfig | null = null;

function getConfig(): ChatgptAppsConfig {
  if (_config) return _config;

  const url = process.env.CHATGPT_APPS_SUPABASE_URL;
  const anonKey = process.env.CHATGPT_APPS_SUPABASE_ANON_KEY;
  const extJwt = process.env.CHATGPT_APPS_SUPABASE_EXT_JWT;

  if (!url || !anonKey || !extJwt) {
    throw new Error(
      "Missing chatgpt-apps env vars. Need: CHATGPT_APPS_SUPABASE_URL, " +
        "CHATGPT_APPS_SUPABASE_ANON_KEY, CHATGPT_APPS_SUPABASE_EXT_JWT",
    );
  }

  _config = {
    url: url.replace(/\/$/, ""),
    anonKey,
    extJwt,
    timeoutMs: parseInt(process.env.CHATGPT_APPS_RPC_TIMEOUT_MS || "5000", 10),
    maxRetries: parseInt(process.env.CHATGPT_APPS_RPC_MAX_RETRIES || "1", 10),
  };

  return _config;
}

// ---------------------------------------------------------------------------
// Core RPC caller
// ---------------------------------------------------------------------------

const MAX_RESPONSE_BYTES = 1_048_576; // 1 MB

export interface RpcResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
  requestId: string;
  durationMs: number;
}

async function callRpc<T = unknown>(
  functionName: string,
  params: Record<string, unknown>,
  requestId?: string,
): Promise<RpcResult<T>> {
  const rid = requestId ?? crypto.randomUUID();
  const start = Date.now();

  let config: ChatgptAppsConfig;
  try {
    config = getConfig();
  } catch {
    return {
      ok: false,
      error: "Integration not configured",
      requestId: rid,
      durationMs: Date.now() - start,
    };
  }

  const url = `${config.url}/rest/v1/rpc/${functionName}`;
  const body = { ...params, request_id: rid };

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt - 1)));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.extJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Payload size guard (Content-Length check)
      const cl = res.headers.get("content-length");
      if (cl && parseInt(cl, 10) > MAX_RESPONSE_BYTES) {
        const duration = Date.now() - start;
        console.log(
          JSON.stringify({
            rpc: functionName,
            request_id: rid,
            status: res.status,
            duration_ms: duration,
            error: "payload_too_large",
          }),
        );
        return {
          ok: false,
          error: "Upstream response exceeded size limit",
          status: 502,
          requestId: rid,
          durationMs: duration,
        };
      }

      const text = await res.text();

      // Payload size guard (body check)
      if (text.length > MAX_RESPONSE_BYTES) {
        const duration = Date.now() - start;
        console.log(
          JSON.stringify({
            rpc: functionName,
            request_id: rid,
            status: res.status,
            duration_ms: duration,
            error: "payload_too_large",
            body_length: text.length,
          }),
        );
        return {
          ok: false,
          error: "Upstream response exceeded size limit",
          status: 502,
          requestId: rid,
          durationMs: duration,
        };
      }

      if (!res.ok) {
        const duration = Date.now() - start;
        let errMsg = `HTTP ${res.status}`;
        try {
          const errBody = JSON.parse(text);
          errMsg = errBody.message || errBody.error || errMsg;
        } catch {
          // keep generic message
        }
        console.log(
          JSON.stringify({
            rpc: functionName,
            request_id: rid,
            status: res.status,
            duration_ms: duration,
            error: "upstream_error",
          }),
        );

        // Retry on 429 / 5xx
        if ((res.status === 429 || res.status >= 500) && attempt < config.maxRetries) {
          lastError = errMsg;
          continue;
        }

        return {
          ok: false,
          error: errMsg,
          status: res.status,
          requestId: rid,
          durationMs: duration,
        };
      }

      const data = JSON.parse(text) as T;

      // Application-level error detection: RPCs return { "error": "..." }
      if (
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof (data as Record<string, unknown>).error === "string"
      ) {
        const duration = Date.now() - start;
        console.log(
          JSON.stringify({
            rpc: functionName,
            request_id: rid,
            status: res.status,
            duration_ms: duration,
            error: "rpc_application_error",
          }),
        );
        return {
          ok: false,
          error: (data as Record<string, unknown>).error as string,
          requestId: rid,
          durationMs: duration,
        };
      }

      const duration = Date.now() - start;
      console.log(
        JSON.stringify({
          rpc: functionName,
          request_id: rid,
          status: res.status,
          duration_ms: duration,
          response_size: text.length,
        }),
      );
      return { ok: true, data, requestId: rid, durationMs: duration };
    } catch (err: unknown) {
      clearTimeout(timer);
      const duration = Date.now() - start;

      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = `Timeout after ${config.timeoutMs}ms`;
      } else {
        lastError = err instanceof Error ? err.message : "Unknown fetch error";
      }

      console.log(
        JSON.stringify({
          rpc: functionName,
          request_id: rid,
          duration_ms: duration,
          error: err instanceof DOMException && err.name === "AbortError" ? "timeout" : "fetch_error",
        }),
      );

      if (attempt < config.maxRetries) continue;
    }
  }

  return {
    ok: false,
    error: lastError || "Request failed",
    requestId: rid,
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Typed RPC wrappers
// ---------------------------------------------------------------------------

// 1. Parcel geometry
export interface ParcelGeometry {
  bbox: [number, number, number, number];
  centroid: { lat: number; lng: number };
  area_sqft: number;
  geom_simplified: string | null;
  srid: number;
  dataset_version: string;
}

export async function getParcelGeometry(
  parcelId: string,
  detailLevel: "low" | "medium" | "high" = "low",
  requestId?: string,
): Promise<RpcResult<ParcelGeometry>> {
  return callRpc<ParcelGeometry>(
    "rpc_get_parcel_geometry",
    { parcel_id: parcelId, detail_level: detailLevel },
    requestId,
  );
}

// 2. Parcel dimensions
export interface ParcelDimensions {
  width_ft: number;
  depth_ft: number;
  area_sqft: number;
  frontage_ft: number;
  depth_range_ft: [number, number];
  confidence: number;
  method: string;
}

export async function getParcelDimensions(
  parcelId: string,
  requestId?: string,
): Promise<RpcResult<ParcelDimensions>> {
  return callRpc<ParcelDimensions>(
    "rpc_get_parcel_dimensions",
    { parcel_id: parcelId },
    requestId,
  );
}

// 3. Zoning lookup by parcel
export interface ZoningResult {
  zoning_codes: Array<{
    zone_code: string;
    zone_label: string | null;
    overlap_pct: number;
  }>;
  jurisdiction: string;
  overlay: string[];
  dataset_version: string;
  source: string;
  last_updated: string;
}

export async function getZoningByParcel(
  parcelId: string,
  requestId?: string,
): Promise<RpcResult<ZoningResult>> {
  return callRpc<ZoningResult>(
    "rpc_zoning_lookup",
    { parcel_id: parcelId },
    requestId,
  );
}

// 4. Zoning lookup by lat/lng point
export async function getZoningByPoint(
  lat: number,
  lng: number,
  parish?: string | null,
  requestId?: string,
): Promise<RpcResult<ZoningResult>> {
  return callRpc<ZoningResult>(
    "rpc_zoning_lookup_by_point",
    { lat, lng, parish: parish ?? null },
    requestId,
  );
}

// 5. Amenities cache read
export interface AmenitiesCacheResult {
  hit: boolean;
  payload: Record<string, unknown> | null;
  expires_at?: string;
  created_at?: string;
}

export async function getAmenitiesCache(
  cacheKey: string,
  requestId?: string,
): Promise<RpcResult<AmenitiesCacheResult>> {
  return callRpc<AmenitiesCacheResult>(
    "rpc_get_amenities_cache",
    { cache_key: cacheKey },
    requestId,
  );
}

// 6. Amenities cache write
export interface AmenitiesCacheUpsertResult {
  ok: boolean;
  expires_at: string;
}

export async function upsertAmenitiesCache(
  cacheKey: string,
  payload: Record<string, unknown>,
  ttlSeconds: number = 604800,
  requestId?: string,
): Promise<RpcResult<AmenitiesCacheUpsertResult>> {
  return callRpc<AmenitiesCacheUpsertResult>(
    "rpc_upsert_amenities_cache",
    { cache_key: cacheKey, payload, ttl_seconds: ttlSeconds },
    requestId,
  );
}
