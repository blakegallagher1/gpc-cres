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
    if (params.address) qs.set("q", params.address);
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
