import { tool } from "@openai/agents";
import { z } from "zod";
import type { PrismaClient } from "@entitlement-os/db";
import { PropertyIntelligenceStore } from "../agentos/memory/property.js";
import { isAgentOsFeatureEnabled } from "../agentos/config.js";

/**
 * Property Memory Tools — semantic search and storage for property intelligence.
 *
 * These tools allow agents to:
 * - recall_property_intelligence: Find parcels with environmental red flags, zoning issues, etc.
 * - store_property_finding: Embed and persist screening results or deal insights
 *
 * Powered by Qdrant hybrid (dense + sparse) search.
 */

function getStore(): PropertyIntelligenceStore {
  const qdrantUrl = process.env.QDRANT_URL ?? "http://localhost:6333";
  // PropertyIntelligenceStore requires PrismaClient in constructor signature
  // but none of its methods (createIfNotExists, upsert, search) actually use it.
  return new PropertyIntelligenceStore(
    null as unknown as PrismaClient,
    qdrantUrl,
  );
}

/**
 * Recall property intelligence via natural language semantic search.
 * Useful for: "Find all environmental issues we've seen in West BR"
 *            "What parcels have flood zones?"
 *            "Show me industrial-zoned parcels near EPA sites"
 */
export const recall_property_intelligence = tool({
  name: "recall_property_intelligence",
  description:
    "Search for previously encountered property screening data and deal insights using natural language. " +
    "Returns parcels with similar environmental conditions, zoning, or deal notes. " +
    "Useful for pattern discovery across past projects.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    query: z
      .string()
      .describe(
        "Natural language search query, e.g. 'flood zone parcels', 'EPA facilities nearby', 'industrial zoning near truck routes'"
      ),
    parish: z
      .string()
      .optional().nullable()
      .describe("Optional: filter results to specific parish (e.g. 'East Baton Rouge', 'Ascension')"),
    minScore: z
      .number()
      .optional().nullable()
      .describe("Minimum similarity score. Default 0.0 (RRF scores are rank-based, typically 0.01–0.2). Higher = stricter matching."),
    topK: z
      .number()
      .optional().nullable()
      .describe("Number of results to return. Default 5, max 20."),
  }),
  execute: async (params) => {
    if (!isAgentOsFeatureEnabled("qdrantHybridRetrieval")) {
      return {
        results: [],
        query: params.query,
        count: 0,
        memory_disabled: true,
        note: "Property intelligence memory is not enabled. Set AGENTOS_ENABLED=true and AGENTOS_QDRANT_HYBRID_ENABLED=true to activate.",
      };
    }
    try {
      const store = getStore();
      await store.createIfNotExists();
      const hits = await store.search(
        params.query,
        params.orgId,
        params.parish ?? undefined,
        params.minScore ?? 0.0,
        Math.min(params.topK ?? 5, 20),
      );
      return { results: hits, query: params.query, count: hits.length };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        results: [],
        query: params.query,
        count: 0,
      };
    }
  },
});

/**
 * Store property finding — embed and persist screening results or deal notes.
 * Useful for: agents to save learned insights for future semantic search
 */
export const store_property_finding = tool({
  name: "store_property_finding",
  description:
    "Store a property screening result or deal insight to the semantic memory. " +
    "Once stored, similar properties can be found via recall_property_intelligence. " +
    "Include environmental flags, zoning, or deal notes that might help future deal evaluation.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    parcelId: z.string().describe("Unique parcel ID from property DB"),
    address: z.string().describe("Street address of the parcel"),
    parish: z.string().describe("Parish name (e.g., 'East Baton Rouge')"),
    zoning: z
      .string()
      .optional().nullable()
      .describe("Zoning designation (e.g., 'C2', 'Industrial', 'M1')"),
    acreage: z
      .number()
      .optional().nullable()
      .describe("Total acreage of the parcel"),
    dealNotes: z
      .string()
      .optional().nullable()
      .describe(
        "Any deal-specific insights (e.g., 'Owner willing to lease', 'Environmental issues pending remediation')"
      ),
  }),
  execute: async (params) => {
    try {
      const store = getStore();
      await store.createIfNotExists();
      await store.upsert({
        parcelId: params.parcelId,
        address: params.address,
        parish: params.parish,
        zoning: params.zoning ?? undefined,
        acreage: params.acreage ?? undefined,
        dealNotes: params.dealNotes ?? undefined,
        orgId: params.orgId,
      });
      return { stored: true, parcelId: params.parcelId, address: params.address };
    } catch (err) {
      return {
        stored: false,
        error: err instanceof Error ? err.message : String(err),
        parcelId: params.parcelId,
      };
    }
  },
});
