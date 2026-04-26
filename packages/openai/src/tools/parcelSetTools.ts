import { tool } from "@openai/agents";
import { z } from "zod";
import { ParcelQueryExecutor, type GatewayAdapter } from "../planning/executor.js";
import { ParcelSetRegistry } from "../planning/registry.js";
import { wrapResultWithMapFeatures } from "./propertyDbTools.js";
import type {
  ParcelFacts,
  ParcelFilter,
  ParcelScreeningResult,
  ScreeningDimension,
} from "@entitlement-os/shared";
import { ToolOrgIdSchema } from "./orgIdSchema.js";

/**
 * Parcel Set Tools — Materialization and description of parcel sets.
 *
 * Tools for interacting with the ParcelSetRegistry and ParcelQueryExecutor
 * to materialize and describe parcel sets based on user selection or viewport context.
 */

/**
 * Gateway adapter implementation that calls the FastAPI gateway
 */
class GatewayAdapterImpl implements GatewayAdapter {
  private gatewayUrl: string;
  private gatewayKey: string;

  constructor() {
    const url = process.env.LOCAL_API_URL?.trim();
    if (!url) {
      throw new Error("[parcelSetTools] Missing required LOCAL_API_URL.");
    }
    const key = process.env.LOCAL_API_KEY?.trim();
    if (!key) {
      throw new Error("[parcelSetTools] Missing required LOCAL_API_KEY.");
    }
    this.gatewayUrl = url;
    this.gatewayKey = key;
  }

  async searchParcelsByBbox(query: {
    bounds: [number, number, number, number];
    limit?: number;
  }): Promise<ParcelFacts[]> {
    const [west, south, east, north] = query.bounds;
    const res = await fetch(`${this.gatewayUrl}/tools/parcel.bbox`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.gatewayKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        west,
        south,
        east,
        north,
        ...(query.limit ? { limit: query.limit } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`Gateway bbox search failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    // Cast gateway response to ParcelFacts for structural compatibility
    const result = Array.isArray(data) ? data : data.parcels ?? data.data ?? [];
    return (result as unknown as ParcelFacts[]) || [];
  }

  async getParcelDetails(parcelIds: string[]): Promise<ParcelFacts[]> {
    const promises = parcelIds.map((id) =>
      fetch(`${this.gatewayUrl}/tools/parcel.lookup`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.gatewayKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ parcel_id: id }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
    );

    const results = await Promise.all(promises);
    // Cast gateway response to ParcelFacts for structural compatibility
    return (results.filter((r) => r !== null) as unknown as ParcelFacts[]) || [];
  }

  async screenParcels(
    parcelIds: string[],
    dimensions: string[]
  ): Promise<ParcelScreeningResult[]> {
    const results: Array<ParcelScreeningResult> = [];

    for (const dimension of dimensions) {
      const endpoint = `/api/screening/${dimension}`;
      for (const parcelId of parcelIds) {
        try {
          const res = await fetch(`${this.gatewayUrl}${endpoint}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.gatewayKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ parcelId }),
          });

          if (res.ok) {
            const data = await res.json();
            results.push({
              parcelId,
              dimensions: [dimension as ScreeningDimension],
              envelope: typeof data === "object" && data !== null ? data : { result: data },
              screenedAt: new Date().toISOString(),
            } as unknown as ParcelScreeningResult);
          }
        } catch {
          // Screening failure is non-fatal
        }
      }
    }

    return results;
  }
}

// Singleton registry and executor for the session
let globalRegistry: ParcelSetRegistry | null = null;
let globalExecutor: ParcelQueryExecutor | null = null;

function getRegistry(): ParcelSetRegistry {
  if (!globalRegistry) {
    globalRegistry = new ParcelSetRegistry();
  }
  return globalRegistry;
}

function getExecutor(): ParcelQueryExecutor {
  if (!globalExecutor) {
    globalExecutor = new ParcelQueryExecutor(new GatewayAdapterImpl());
  }
  return globalExecutor;
}

/**
 * Describe Parcel Set — Materialize and summarize a parcel set
 *
 * Takes a parcel set definition (by IDs, bbox, or registered set ID)
 * and materializes it using the query executor, returning a summary
 * with member count, facts, and screening results.
 */
export const describeParcelSet = tool({
  name: "describe_parcel_set",
  description:
    "Describe and materialize a parcel set. Accepts parcel IDs, a bounding box, or a registered set ID. " +
    "Returns parcel count, facts (address, zoning, acres), screening results if available, and provenance information. " +
    "Use this to understand the composition and characteristics of a parcel selection.",
  parameters: z.object({
    orgId: ToolOrgIdSchema.describe("Organization ID for parcel set scoping"),
    conversation_id: z
      .string()
      .describe("Conversation ID for registry scoping"),
    parcel_ids: z
      .array(z.string())
      .optional()
      .nullable()
      .describe("List of parcel IDs to describe (e.g. ['p1', 'p2'])"),
    bbox: z
      .object({
        minLng: z.number(),
        minLat: z.number(),
        maxLng: z.number(),
        maxLat: z.number(),
      })
      .optional()
      .nullable()
      .describe("Bounding box to search (minLng, minLat, maxLng, maxLat)"),
    set_id: z
      .string()
      .optional()
      .nullable()
      .describe("Registered parcel set ID to materialize"),
    screening_dimensions: z
      .array(z.string())
      .optional()
      .nullable()
      .describe("Environmental dimensions to screen (e.g. ['flood', 'zoning', 'soils'])"),
  }),
  execute: async ({
    orgId,
    conversation_id,
    parcel_ids,
    bbox,
    set_id,
    screening_dimensions,
  }) => {
    const registry = getRegistry();

    try {
      // Determine which set to materialize
      let setDef;

      if (set_id) {
        // Use existing registered set
        setDef = registry.getDefinition(conversation_id, set_id);
        if (!setDef) {
          return {
            error: `Parcel set ${set_id} not found in registry`,
            suggestion: "Provide parcel_ids or bbox instead",
          };
        }
        if (setDef.orgId !== orgId) {
          return {
            error: `Parcel set ${set_id} is not available for this organization`,
            suggestion: "Select a parcel set created in the current org",
          };
        }
      } else if (parcel_ids && parcel_ids.length > 0) {
        // Create ephemeral selection set from IDs
        const tempSetId = `set-${Math.random().toString(36).slice(2, 8)}`;
        setDef = {
          id: tempSetId,
          orgId,
          label: null,
          origin: { kind: "selection" as const, parcelIds: parcel_ids, source: "agent" as const },
          lifecycle: { kind: "ephemeral" as const, scope: "conversation" as const },
          status: "unresolved" as const,
          createdAt: new Date().toISOString(),
          metadata: {},
        };
        registry.register(conversation_id, setDef);
      } else if (bbox) {
        // Create ephemeral viewport set from bbox
        const tempSetId = `set-${Math.random().toString(36).slice(2, 8)}`;
        const bounds: [number, number, number, number] = [
          bbox.minLng,
          bbox.minLat,
          bbox.maxLng,
          bbox.maxLat,
        ];
        setDef = {
          id: tempSetId,
          orgId,
          label: null,
          origin: {
            kind: "viewport" as const,
            spatial: { kind: "bbox" as const, bounds },
          },
          lifecycle: { kind: "ephemeral" as const, scope: "conversation" as const },
          status: "unresolved" as const,
          createdAt: new Date().toISOString(),
          metadata: {},
        };
        registry.register(conversation_id, setDef);
      } else {
        return {
          error: "No parcel selection provided",
          suggestion: "Provide parcel_ids, bbox, or set_id",
        };
      }

      // Validate and cast screening dimensions to proper type
      const validDimensions: ScreeningDimension[] = screening_dimensions
        ?.filter((d): d is ScreeningDimension =>
          ["flood", "soils", "wetlands", "epa", "traffic", "ldeq", "zoning"].includes(d)
        ) ?? [];

      // Build execution plan
      const plan = {
        id: `plan-${Math.random().toString(36).slice(2, 8)}`,
        intent: "identify" as const,
        inputSets: [setDef],
        resolution: { kind: "selection-passthrough" as const },
        filters: [] as ParcelFilter[],
        screening: validDimensions.length > 0
          ? {
              dimensions: validDimensions,
              mode: "selective" as const,
              batchSize: 8,
              priority: "speed" as const,
            }
          : null,
        scoring: null,
        outputMode: "list" as const,
        directives: {
          materializationMode: "immediate" as const,
          screeningTiming: "pre-agent" as const,
          authoritativeVerification: "required" as const,
          freshnessMaxSeconds: null,
          estimatedCost: "light" as const,
        },
        memoryPolicy: {
          allowSemanticDiscovery: false,
          requireDbVerification: true,
          maxCandidatesFromMemory: 0,
          confidenceFloor: 0.7,
        },
        provenanceRequirements: {
          requireAuthoritative: true,
          maxStalenessSeconds: null,
          verifyMemoryResults: true,
        },
        isFollowUp: false,
      };

      // Execute the plan
      const executor = getExecutor();
      const executionResult = await executor.execute(plan, registry, conversation_id);

      // Format response
      if (executionResult.sets.length === 0) {
        return {
          error: "No parcels materialized",
          reason: "Query execution returned empty set",
        };
      }

      const firstSet = executionResult.sets[0];
      const materialization = firstSet.materialization;

      if (!materialization) {
        return {
          error: "Materialization failed",
          reason: "Set definition exists but has no materialization",
        };
      }

      const response = {
        setId: firstSet.definition.id,
        status: "materialized",
        count: materialization.count,
        members: materialization.memberIds.slice(0, 20), // first 20 for display
        facts: materialization.facts.slice(0, 20).map((fact: ParcelFacts) => ({
          parcelId: fact.parcelId,
          address: fact.address,
          zoningType: fact.zoningType,
          acres: fact.acres,
        })),
        screening: materialization.screening?.slice(0, 10) ?? [],
        provenance: {
          sourceKind: materialization.provenance.sourceKind,
          authoritative: materialization.provenance.authoritative,
          confidence: materialization.provenance.confidence,
          freshness: materialization.provenance.freshness,
          resolvedAt: materialization.provenance.resolvedAt,
        },
        analytics: executionResult.analytics,
        message: `Materialized parcel set with ${materialization.count} member${materialization.count !== 1 ? "s" : ""}`,
      };

      return wrapResultWithMapFeatures(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        error: "Execution failed",
        details: message,
      };
    }
  },
});

/**
 * List Parcel Sets — Show all parcel sets registered in this conversation
 */
export const listParcelSets = tool({
  name: "list_parcel_sets",
  description:
    "List all parcel sets registered in the current conversation. Shows set IDs, origins, statuses, and member counts.",
  parameters: z.object({
    orgId: ToolOrgIdSchema.describe("Organization ID for parcel set scoping"),
    conversation_id: z
      .string()
      .describe("Conversation ID for registry scoping"),
  }),
  execute: async ({ orgId, conversation_id }) => {
    const registry = getRegistry();
    const setIds = registry.listSetIds(conversation_id);

    const sets = setIds.map((id) => {
      const def = registry.getDefinition(conversation_id, id);
      if (!def) return null;
      if (def.orgId !== orgId) return null;

      const mat = registry.getMaterialization(conversation_id, id);
      return {
        id: def.id,
        origin: def.origin,
        status: def.status,
        memberCount: mat?.count ?? null,
        createdAt: def.createdAt,
        label: def.label,
      };
    });

    return {
      conversationId: conversation_id,
      totalSets: sets.length,
      sets: sets.filter((s) => s !== null),
    };
  },
});
