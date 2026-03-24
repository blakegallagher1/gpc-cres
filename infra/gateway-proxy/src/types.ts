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
  error?: string;
}

export interface UpstreamResult {
  ok: boolean;
  status: number;
  data: unknown;
  raw: string;
}
