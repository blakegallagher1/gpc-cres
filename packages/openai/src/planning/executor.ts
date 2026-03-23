/**
 * ParcelQueryExecutor — Materializes parcel sets by executing resolution strategies
 * and coordinating with the gateway adapter for parcel data and screening.
 */

import {
  ParcelQueryPlan,
  ParcelSetDefinition,
  ParcelSetMaterialization,
  ParcelFacts,
  ParcelScreeningResult,
  ParcelFilter,
  ResolutionStrategy,
  SetAnalytics,
} from "@entitlement-os/shared";
import { ParcelSetRegistry } from "./registry";
import { computeAnalytics } from "./analytics";

/**
 * GatewayAdapter — Abstraction for parcel data operations.
 * The executor's dependency boundary for accessing parcel data and screening.
 */
export interface GatewayAdapter {
  /**
   * Search for parcels within a bounding box.
   * Returns an array of parcel facts.
   */
  searchParcelsByBbox(query: {
    bounds: [number, number, number, number];
    limit?: number;
  }): Promise<ParcelFacts[]>;

  /**
   * Get detailed facts for a specific set of parcel IDs.
   * Returns an array of parcel facts keyed by parcel ID.
   */
  getParcelDetails(parcelIds: string[]): Promise<ParcelFacts[]>;

  /**
   * Screen parcels for environmental/regulatory dimensions.
   * Returns screening results for requested dimensions.
   */
  screenParcels(parcelIds: string[], dimensions: string[]): Promise<ParcelScreeningResult[]>;
}

/**
 * Result of executing a query plan — materialized sets with analytics
 */
export interface ExecutionResult {
  sets: MaterializedSet[];
  analytics: SetAnalytics | null;
}

/**
 * A parcel set definition with its materialization
 */
export interface MaterializedSet {
  definition: ParcelSetDefinition;
  materialization: ParcelSetMaterialization | null;
}

/**
 * ParcelQueryExecutor materializes parcel sets by executing resolution strategies
 * against the gateway adapter.
 */
export class ParcelQueryExecutor {
  constructor(private adapter: GatewayAdapter) {}

  /**
   * Execute a parcel query plan and materialize all sets
   */
  async execute(
    plan: ParcelQueryPlan,
    registry: ParcelSetRegistry,
    conversationId: string
  ): Promise<ExecutionResult> {
    const materializedSets: MaterializedSet[] = [];

    // Resolve each input set
    for (const inputSet of plan.inputSets) {
      const facts = await this.resolveSet(inputSet, plan.resolution);

      // Apply filters to the facts
      const filteredFacts = this.applyFilters(facts, plan.filters);

      // Execute screening if needed
      const screening = await this.executeScreening(
        filteredFacts,
        plan.screening,
        plan.directives.screeningTiming
      );

      // Build materialization
      const mat: ParcelSetMaterialization = {
        parcelSetId: inputSet.id,
        memberIds: filteredFacts.map((f) => f.parcelId),
        count: filteredFacts.length,
        facts: filteredFacts,
        screening,
        provenance: {
          sourceKind: "database",
          sourceRoute: null,
          authoritative: plan.provenanceRequirements.requireAuthoritative,
          confidence: null,
          resolvedAt: new Date().toISOString(),
          freshness: "fresh",
        },
        materializedAt: new Date().toISOString(),
      };

      // Register and update status in the registry
      registry.updateMaterialization(conversationId, mat);
      inputSet.status = "materialized";
      registry.updateStatus(conversationId, inputSet.id, "materialized");

      materializedSets.push({
        definition: inputSet,
        materialization: mat,
      });
    }

    // Compute analytics on the first materialized set (Phase 1)
    let analytics: SetAnalytics | null = null;
    if (materializedSets.length > 0 && materializedSets[0].materialization) {
      analytics = computeAnalytics(materializedSets[0].materialization);
    }

    return {
      sets: materializedSets,
      analytics,
    };
  }

  /**
   * Resolve a parcel set by executing the appropriate resolution strategy
   */
  private async resolveSet(
    def: ParcelSetDefinition,
    strategy: ResolutionStrategy
  ): Promise<ParcelFacts[]> {
    if (strategy.kind === "selection-passthrough") {
      // Resolve selection: fetch details for the selected parcel IDs
      if (def.origin.kind !== "selection") {
        return [];
      }
      return await this.adapter.getParcelDetails(def.origin.parcelIds);
    }

    if (strategy.kind === "bbox") {
      // Resolve viewport: search parcels within bounding box
      return await this.adapter.searchParcelsByBbox({
        bounds: (strategy.spatial as { kind: "bbox"; bounds: [number, number, number, number] }).bounds,
        limit: strategy.limit,
      });
    }

    if (strategy.kind === "memory-discovery") {
      throw new Error("memory-discovery strategy not implemented in Phase 1");
    }

    if (strategy.kind === "spatial-sql") {
      throw new Error("spatial-sql strategy not implemented in Phase 1");
    }

    return [];
  }

  /**
   * Apply filters to a set of facts (in-memory filtering)
   */
  private applyFilters(facts: ParcelFacts[], filters: ParcelFilter[]): ParcelFacts[] {
    if (filters.length === 0) {
      return facts;
    }

    return facts.filter((fact) => {
      return filters.every((filter) => {
        const value = (fact as unknown as Record<string, unknown>)[filter.field];

        if (filter.operator === "eq") {
          return value === filter.value;
        }

        if (filter.operator === "in") {
          return Array.isArray(filter.value) && filter.value.includes(value);
        }

        if (filter.operator === "gte") {
          return typeof value === "number" && value >= (filter.value as number);
        }

        if (filter.operator === "lte") {
          return typeof value === "number" && value <= (filter.value as number);
        }

        return true;
      });
    });
  }

  /**
   * Execute screening if the timing calls for pre-agent screening
   */
  private async executeScreening(
    facts: ParcelFacts[],
    screening: { dimensions: string[]; mode: string; batchSize: number; priority: string } | null,
    screeningTiming: string
  ): Promise<ParcelScreeningResult[]> {
    if (!screening || screeningTiming !== "pre-agent") {
      return [];
    }

    const parcelIds = facts.map((f) => f.parcelId);
    return await this.adapter.screenParcels(parcelIds, screening.dimensions);
  }
}
