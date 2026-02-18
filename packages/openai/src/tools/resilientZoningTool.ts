import { prisma, type Prisma } from "@entitlement-os/db";
import {
  resilientExecutor,
  type ResilientToolResult,
} from "./resilientToolWrapper.js";

type ZoningResult = {
  zoning: string;
  source: "primary" | "cached" | "inferred";
  confidence: number;
  warnings?: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function primaryFetchZoning(parcelId: string): Promise<ZoningResult> {
  const endpoint = process.env.GIS_ZONING_API_URL;
  if (!endpoint) {
    throw new Error("GIS_ZONING_API_URL is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/${parcelId}`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GIS API error ${response.status}`);
    }

    const payload = asRecord(await response.json());
    const zoning = payload.zoning;
    if (typeof zoning !== "string" || zoning.trim().length === 0) {
      throw new Error("GIS API returned no zoning label");
    }

    return {
      zoning,
      source: "primary",
      confidence: 0.95,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fallbackFromParcelCache(parcelId: string): Promise<ZoningResult> {
  const parcel = await prisma.parcel.findUnique({
    where: { id: parcelId },
    select: { currentZoning: true },
  });

  if (!parcel || !parcel.currentZoning) {
    throw new Error("No cached zoning on parcel");
  }

  return {
    zoning: parcel.currentZoning,
    source: "cached",
    confidence: 0.82,
  };
}

async function inferFromNearbyParcelContext(parcelId: string): Promise<ZoningResult> {
  const parcel = await prisma.parcel.findUnique({
    where: { id: parcelId },
    select: { dealId: true },
  });

  if (!parcel) {
    throw new Error("Parcel not found");
  }

  const nearby = await prisma.parcel.findMany({
    where: {
      dealId: parcel.dealId,
      id: { not: parcelId },
      currentZoning: { not: null },
    },
    select: { currentZoning: true },
    take: 20,
  });

  if (nearby.length === 0) {
    throw new Error("No nearby zoning data for inference");
  }

  const counts = new Map<string, number>();
  for (const item of nearby) {
    if (!item.currentZoning) continue;
    counts.set(item.currentZoning, (counts.get(item.currentZoning) ?? 0) + 1);
  }
  if (counts.size === 0) {
    throw new Error("No inferable zoning candidates");
  }

  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const [zoning, support] = ranked[0];
  const confidence = Math.min(0.79, (support / nearby.length) * 0.8);

  return {
    zoning,
    source: "inferred",
    confidence,
  };
}

async function recordToolMetric(params: {
  orgId?: string | null;
  userId?: string | null;
  latencyMs: number;
  result: ResilientToolResult<ZoningResult>;
}): Promise<void> {
  const data = params.result.data;
  const status:
    | "SUCCESS"
    | "FALLBACK"
    | "INFERRED"
    | "FAILED" =
    !params.result.success
      ? "FAILED"
      : data?.source === "inferred"
        ? "INFERRED"
        : params.result.fallbackUsed
          ? "FALLBACK"
          : "SUCCESS";

  await prisma.toolExecutionMetric.create({
    data: {
      orgId: params.orgId ?? null,
      userId: params.userId ?? null,
      toolName: "get_zoning",
      status,
      latencyMs: params.latencyMs,
      fallbackUsed: params.result.fallbackUsed,
      warningCount: params.result.warnings.length,
      confidence: typeof data?.confidence === "number" ? data.confidence : null,
      source: data?.source ?? null,
      error: params.result.error?.message ?? null,
      metadata: toJson({
        warnings: params.result.warnings,
      }),
    },
  });
}

export async function resilientGetZoning(params: {
  parcelId: string;
  orgId?: string | null;
  userId?: string | null;
}): Promise<ResilientToolResult<ZoningResult>> {
  const start = Date.now();

  const result = await resilientExecutor.execute(
    {
      name: "get_zoning",
      execute: async (parcelId: string) => primaryFetchZoning(parcelId),
      retry: {
        maxRetries: 3,
        backoffMs: 750,
        maxBackoffMs: 6000,
        retryablePatterns: ["timeout", "timed out", "ETIMEDOUT", "ECONNRESET", "5"],
      },
      fallback: {
        fallbackExecute: async (parcelId: string) => fallbackFromParcelCache(parcelId),
        inferFromContext: async (parcelId: string) => inferFromNearbyParcelContext(parcelId),
      },
      onFailure: "RETURN_PARTIAL",
    },
    params.parcelId,
  );

  const latencyMs = Date.now() - start;
  try {
    await recordToolMetric({
      orgId: params.orgId ?? null,
      userId: params.userId ?? null,
      latencyMs,
      result,
    });
  } catch {
    // Best effort telemetry only.
  }

  return result;
}
