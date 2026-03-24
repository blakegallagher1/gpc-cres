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
