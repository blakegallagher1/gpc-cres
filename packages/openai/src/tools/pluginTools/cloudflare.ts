import { tool } from "@openai/agents";
import { z } from "zod";
import {
  buildErrorResponse,
  buildMissingEnvResponse,
  buildSuccessResponse,
  cloudflareRequest,
  getRequiredEnv,
  toRecord,
  toRecordArray,
  toStringValue,
  type JsonRecord,
} from "./shared.js";

type CloudflareWorkerSummary = {
  id: string | null;
  name: string | null;
  modifiedOn: string | null;
};

function sanitizeCloudflareWorker(worker: JsonRecord): CloudflareWorkerSummary {
  return {
    id: toStringValue(worker.id) ?? toStringValue(worker.script),
    name: toStringValue(worker.id) ?? toStringValue(worker.script),
    modifiedOn: toStringValue(worker.modified_on),
  };
}

export const check_tunnel_health = tool({
  name: "check_tunnel_health",
  description:
    "Fetch Cloudflare Tunnel details and summarize whether the tunnel appears healthy based on returned status and connections.",
  parameters: z.object({
    account_id: z.string().describe("Cloudflare account ID."),
    tunnel_id: z.string().describe("Cloudflare tunnel ID."),
  }),
  execute: async ({ account_id, tunnel_id }) => {
    const token = getRequiredEnv("CLOUDFLARE_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("cloudflare", "CLOUDFLARE_PLUGIN_TOKEN");
    }

    const result = await cloudflareRequest(
      token,
      `/accounts/${account_id}/cfd_tunnel/${tunnel_id}`,
    );
    if (!result.ok) {
      return buildErrorResponse("cloudflare", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    const tunnel = toRecord(result.body) ?? {};
    const connections = Array.isArray(tunnel.connections) ? tunnel.connections.length : null;
    const health = toStringValue(tunnel.status);
    const isHealthy =
      health !== null ? health.toLowerCase() === "healthy" : connections !== null ? connections > 0 : null;

    return buildSuccessResponse("cloudflare", {
      tunnel: {
        id: toStringValue(tunnel.id),
        name: toStringValue(tunnel.name),
        status: health,
        createdAt: toStringValue(tunnel.created_at),
        deletedAt: toStringValue(tunnel.deleted_at),
        connections,
        isHealthy,
      },
      raw: tunnel,
    });
  },
});

export const purge_cache = tool({
  name: "purge_cache",
  description:
    "Purge Cloudflare cache by zone. Supports purge everything, explicit files, tags, hosts, or prefixes.",
  parameters: z.object({
    zone_id: z.string().describe("Cloudflare zone ID."),
    purge_everything: z.boolean().nullable().describe("Set true to purge all cached assets for the zone."),
    files: z.array(z.string()).nullable().describe("Specific file URLs to purge. Pass null to omit."),
    tags: z.array(z.string()).nullable().describe("Cache tags to purge. Pass null to omit."),
    hosts: z.array(z.string()).nullable().describe("Hosts to purge. Pass null to omit."),
    prefixes: z.array(z.string()).nullable().describe("Path prefixes to purge. Pass null to omit."),
  }),
  execute: async ({ zone_id, purge_everything, files, tags, hosts, prefixes }) => {
    const token = getRequiredEnv("CLOUDFLARE_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("cloudflare", "CLOUDFLARE_PLUGIN_TOKEN");
    }

    const body: JsonRecord = {};
    if (purge_everything) {
      body.purge_everything = true;
    }
    if (files && files.length > 0) {
      body.files = files;
    }
    if (tags && tags.length > 0) {
      body.tags = tags;
    }
    if (hosts && hosts.length > 0) {
      body.hosts = hosts;
    }
    if (prefixes && prefixes.length > 0) {
      body.prefixes = prefixes;
    }

    if (Object.keys(body).length === 0) {
      return buildErrorResponse("cloudflare", "At least one cache purge target must be provided");
    }

    const result = await cloudflareRequest(token, `/zones/${zone_id}/purge_cache`, {
      method: "POST",
      body,
    });
    if (!result.ok) {
      return buildErrorResponse("cloudflare", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    return buildSuccessResponse("cloudflare", {
      zoneId: zone_id,
      result: toRecord(result.body) ?? {},
    });
  },
});

export const get_hyperdrive_status = tool({
  name: "get_hyperdrive_status",
  description:
    "Fetch Cloudflare Hyperdrive configuration details or list Hyperdrive configs for an account.",
  parameters: z.object({
    account_id: z.string().describe("Cloudflare account ID."),
    hyperdrive_id: z.string().nullable().describe("Specific Hyperdrive config ID. Pass null to list configs."),
  }),
  execute: async ({ account_id, hyperdrive_id }) => {
    const token = getRequiredEnv("CLOUDFLARE_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("cloudflare", "CLOUDFLARE_PLUGIN_TOKEN");
    }

    const path = hyperdrive_id
      ? `/accounts/${account_id}/hyperdrive/configs/${hyperdrive_id}`
      : `/accounts/${account_id}/hyperdrive/configs`;

    const result = await cloudflareRequest(token, path);
    if (!result.ok) {
      return buildErrorResponse("cloudflare", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    if (hyperdrive_id) {
      return buildSuccessResponse("cloudflare", {
        hyperdrive: toRecord(result.body) ?? {},
      });
    }

    return buildSuccessResponse("cloudflare", {
      count: toRecordArray(result.body).length,
      hyperdrives: toRecordArray(result.body),
    });
  },
});

export const list_workers = tool({
  name: "list_workers",
  description: "List Cloudflare Workers scripts for an account.",
  parameters: z.object({
    account_id: z.string().describe("Cloudflare account ID."),
    name_contains: z.string().nullable().describe("Optional case-insensitive substring filter for script names."),
  }),
  execute: async ({ account_id, name_contains }) => {
    const token = getRequiredEnv("CLOUDFLARE_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("cloudflare", "CLOUDFLARE_PLUGIN_TOKEN");
    }

    const result = await cloudflareRequest(token, `/accounts/${account_id}/workers/scripts`);
    if (!result.ok) {
      return buildErrorResponse("cloudflare", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    const workers = toRecordArray(result.body)
      .map(sanitizeCloudflareWorker)
      .filter((worker) => {
        if (!name_contains) {
          return true;
        }
        return (worker.name ?? "").toLowerCase().includes(name_contains.toLowerCase());
      });

    return buildSuccessResponse("cloudflare", {
      count: workers.length,
      workers,
    });
  },
});

export const cloudflarePluginTools = [
  check_tunnel_health,
  purge_cache,
  get_hyperdrive_status,
  list_workers,
] as const;
