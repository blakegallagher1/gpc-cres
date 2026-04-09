import { tool } from "@openai/agents";
import { z } from "zod";
import type {
  AssemblageCandidateResult,
  FitScoreResult,
  SitePlanZone,
} from "../cartographer/types.js";

/**
 * Cartographer tools — spatial-intelligence capabilities for the /map surface.
 *
 * These tools expose the server-side Cartographer modules to the agent.
 * Each tool validates input, delegates to the corresponding server module,
 * and returns JSON results including __mapAction payloads for the map surface.
 *
 * Server modules live at: packages/openai/src/cartographer/
 * All SQL is validated (SELECT-only, allowlisted tables, enforced LIMIT).
 * All stored rows are scoped with orgId from the agent context.
 */

// ---------------------------------------------------------------------------
// Helper: extract orgId from agent run context
// ---------------------------------------------------------------------------

function extractOrgId(context: unknown): string {
  if (!context || typeof context !== "object") return "";
  const outer = context as Record<string, unknown>;
  const candidate =
    outer.context && typeof outer.context === "object"
      ? (outer.context as Record<string, unknown>)
      : outer;
  return typeof candidate.orgId === "string" ? candidate.orgId.trim() : "";
}

function extractUserId(context: unknown): string | undefined {
  if (!context || typeof context !== "object") return undefined;
  const outer = context as Record<string, unknown>;
  const candidate =
    outer.context && typeof outer.context === "object"
      ? (outer.context as Record<string, unknown>)
      : outer;
  return typeof candidate.userId === "string" ? candidate.userId.trim() : undefined;
}

// ---------------------------------------------------------------------------
// Tool: spatial_query
// ---------------------------------------------------------------------------

export const spatial_query = tool({
  name: "spatial_query",
  description:
    "Execute a spatial query on the property database and render results as a map layer. " +
    "Use this when the user asks to find, filter, or visualize parcels/features on the map " +
    "based on spatial criteria (e.g. 'show me parcels over 5 acres zoned industrial near I-10'). " +
    "You must generate a valid SELECT SQL query against the allowlisted tables " +
    "(ebr_parcels, parcels, zoning_districts, flood_zones, etc.). " +
    "The query MUST include a geometry column (geom) to render on the map. " +
    "Results are automatically displayed as a new map layer.\n\n" +
    "IMPORTANT: Only SELECT queries are allowed. No INSERT/UPDATE/DELETE/DDL. " +
    "Max 500 rows per query. All queries are validated before execution.",
  parameters: z.object({
    sql: z
      .string()
      .min(10)
      .describe(
        "A SELECT SQL query against the property database. " +
        "Must include a geometry column (geom). Example: " +
        "SELECT parcel_id, acreage, zoning, geom FROM ebr_parcels WHERE acreage > 5 AND zoning LIKE 'M%'",
      ),
    layer_label: z
      .string()
      .optional()
      .nullable()
      .describe("Human-readable label for the map layer (e.g. 'Industrial parcels > 5 acres')."),
    fill_color: z
      .string()
      .optional()
      .nullable()
      .describe("Hex color for polygon fill (default '#3B82F6')."),
    fill_opacity: z
      .number()
      .optional()
      .nullable()
      .describe("Fill opacity 0–1 (default 0.25)."),
  }),
  execute: async (params, context) => {
    const orgId = extractOrgId(context);
    if (!orgId) {
      return JSON.stringify({ error: "orgId not available in agent context." });
    }

    try {
      // Dynamic import to keep server-only boundary clean
      const { executeSpatialQuery } = await import(
        "../cartographer/spatialQuery.js"
      );

      const result = await executeSpatialQuery(
        { orgId, userId: extractUserId(context) },
        {
          sql: params.sql,
          layerLabel: params.layer_label ?? undefined,
          style: {
            fillColor: params.fill_color ?? undefined,
            fillOpacity: params.fill_opacity ?? undefined,
          },
        },
      );

      return JSON.stringify({
        layerId: result.layerId,
        rowCount: result.rowCount,
        sqlExecuted: result.sqlExecuted,
        citationRefs: result.citationRefs,
        __mapActions: result.mapActions,
      });
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : "Spatial query failed.",
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: fit_score
// ---------------------------------------------------------------------------

export const fit_score = tool({
  name: "fit_score",
  description:
    "Score parcels against an investment thesis and render as a color-coded heatmap. " +
    "Use this when the user wants to evaluate parcels based on weighted criteria " +
    "(e.g. 'score all parcels near Airline Hwy for small bay flex development'). " +
    "You must provide: (1) a thesis with named factors and weights, and " +
    "(2) a SQL query that returns the relevant parcel data columns. " +
    "Results appear as a red → yellow → green heatmap on the map.",
  parameters: z.object({
    thesis_name: z.string().min(1).describe("Name for this thesis (e.g. 'Small Bay Flex Site')."),
    thesis_description: z.string().optional().nullable().describe("Optional description of the thesis."),
    weights: z
      .array(
        z.object({
          factor: z
            .string()
            .describe(
              "Column name or scoring factor. Built-in factors: " +
              "acreage_min, zoning_allows, flood_zone_safe, road_frontage, distance_km. " +
              "Any other column name is scored generically (higher = better).",
            ),
          weight: z.number().min(0).max(1).describe("Weight for this factor (0–1)."),
          threshold: z
            .union([z.number(), z.string()])
            .optional()
            .nullable()
            .describe("Threshold value. For acreage_min: minimum acres. For zoning_allows: comma-separated codes."),
        }),
      )
      .min(1)
      .describe("List of scoring factors with weights."),
    parcel_sql: z
      .string()
      .min(10)
      .describe(
        "SQL selecting candidate parcels. Must return parcel_id, geom, and columns matching factor names. " +
        "Example: SELECT parcel_id, acreage, zoning, flood_zone, geom FROM ebr_parcels WHERE acreage > 2",
      ),
  }),
  execute: async (params, context) => {
    const orgId = extractOrgId(context);
    if (!orgId) {
      return JSON.stringify({ error: "orgId not available in agent context." });
    }

    try {
      const { computeFitScores } = await import(
        "../cartographer/fitScore.js"
      );

      const result = await computeFitScores(
        { orgId, userId: extractUserId(context) },
        {
          thesis: {
            orgId,
            name: params.thesis_name,
            description: params.thesis_description ?? undefined,
            weights: params.weights.map((w) => ({
              factor: w.factor,
              weight: w.weight,
              threshold: w.threshold ?? undefined,
            })),
          },
          parcelSql: params.parcel_sql,
        },
      );

      return JSON.stringify({
        thesisName: result.thesisName,
        summary: result.summary,
        topScores: result.scores.slice(0, 20).map((s: FitScoreResult) => ({
          parcelId: s.parcelId,
          score: s.score,
          breakdown: s.breakdown,
        })),
        citationRefs: result.citationRefs,
        __mapActions: result.mapActions,
      });
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : "Fit score computation failed.",
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: find_assemblage
// ---------------------------------------------------------------------------

export const find_assemblage = tool({
  name: "find_assemblage",
  description:
    "Find groups of adjacent parcels that could be assembled into a larger site. " +
    "Use this when the user wants to identify assemblage opportunities " +
    "(e.g. 'find assemblage candidates near Airline Hwy with at least 10 acres total'). " +
    "Parcels are clustered by spatial adjacency. Results are color-coded by group on the map.",
  parameters: z.object({
    candidate_sql: z
      .string()
      .min(10)
      .describe(
        "SQL selecting candidate parcels. Must return parcel_id, acreage, geom. " +
        "Example: SELECT parcel_id, acreage, geom FROM ebr_parcels WHERE acreage BETWEEN 1 AND 8 AND zoning LIKE 'M%'",
      ),
    min_total_acreage: z
      .number()
      .optional()
      .nullable()
      .describe("Minimum total acreage for a valid assemblage (default 3)."),
    max_parcels: z
      .number()
      .optional()
      .nullable()
      .describe("Maximum parcels per assemblage group (default 10)."),
    adjacency_buffer_meters: z
      .number()
      .optional()
      .nullable()
      .describe("Buffer distance in meters for adjacency grouping (default 10)."),
  }),
  execute: async (params, context) => {
    const orgId = extractOrgId(context);
    if (!orgId) {
      return JSON.stringify({ error: "orgId not available in agent context." });
    }

    try {
      const { findAssemblage } = await import(
        "../cartographer/findAssemblage.js"
      );

      const result = await findAssemblage(
        { orgId, userId: extractUserId(context) },
        {
          candidateSql: params.candidate_sql,
          minTotalAcreage: params.min_total_acreage ?? undefined,
          maxParcels: params.max_parcels ?? undefined,
          adjacencyBufferMeters: params.adjacency_buffer_meters ?? undefined,
        },
      );

      return JSON.stringify({
        totalCandidateParcels: result.totalCandidateParcels,
        assemblageCount: result.candidates.length,
        candidates: result.candidates.slice(0, 10).map((c: AssemblageCandidateResult) => ({
          name: c.assemblageName,
          parcelIds: c.parcelIds,
          totalAcreage: c.totalAcreage,
          notes: c.notes,
        })),
        citationRefs: result.citationRefs,
        __mapActions: result.mapActions,
      });
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : "Assemblage search failed.",
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: draft_site_plan
// ---------------------------------------------------------------------------

export const draft_site_plan = tool({
  name: "draft_site_plan",
  description:
    "Generate a hypothetical site plan layout for one or more parcels. " +
    "Use this when the user wants to sketch out how a site could be developed " +
    "(e.g. 'draft a site plan for these 3 parcels with 60% warehouse, 25% parking, 15% office'). " +
    "The plan is a rough spatial sketch — zones are displayed as colored overlays on the map. " +
    "NOTE: This is for planning visualization only, not engineering design.",
  parameters: z.object({
    plan_name: z.string().min(1).describe("Name for this hypothetical plan."),
    parcel_ids: z.array(z.string()).min(1).describe("Parcel IDs included in this plan."),
    total_acreage: z.number().min(0.1).describe("Total site acreage."),
    site_bbox: z
      .array(z.number())
      .length(4)
      .describe("Bounding box [west, south, east, north] of the site."),
    program: z
      .array(
        z.object({
          label: z.string().describe("Zone label (e.g. 'Warehouse A')."),
          use: z.string().describe("Use type (e.g. 'warehouse', 'parking', 'office', 'retention')."),
          acreage_fraction: z
            .number()
            .min(0)
            .max(1)
            .describe("Fraction of total acreage (0–1). All fractions should sum to ~1."),
        }),
      )
      .min(1)
      .describe("Program zones to lay out on the site."),
  }),
  execute: async (params, context) => {
    const orgId = extractOrgId(context);
    if (!orgId) {
      return JSON.stringify({ error: "orgId not available in agent context." });
    }

    try {
      const { draftSitePlan } = await import(
        "../cartographer/draftSitePlan.js"
      );

      const result = await draftSitePlan(
        { orgId, userId: extractUserId(context) },
        {
          planName: params.plan_name,
          parcelIds: params.parcel_ids,
          totalAcreage: params.total_acreage,
          siteBbox: params.site_bbox as [number, number, number, number],
          program: params.program.map((p) => ({
            label: p.label,
            use: p.use,
            acreageFraction: p.acreage_fraction,
          })),
        },
      );

      return JSON.stringify({
        planName: result.plan.planName,
        zones: result.plan.zones.map((z: SitePlanZone) => ({
          label: z.label,
          use: z.use,
          acreage: z.acreage,
        })),
        totalAcreage: result.plan.totalAcreage,
        notes: result.plan.notes,
        citationRefs: result.citationRefs,
        __mapActions: result.mapActions,
      });
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : "Site plan drafting failed.",
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: temporal_query
// ---------------------------------------------------------------------------

export const temporal_query = tool({
  name: "temporal_query",
  description:
    "Detect changes in parcel data over time (ownership transfers, zoning amendments, " +
    "assessed value changes, new permits, etc.). Use this when the user asks about " +
    "what changed in an area (e.g. 'what parcels changed ownership in the last year near downtown'). " +
    "You must provide a SQL query that returns change records with parcel_id, field, " +
    "previous_value, current_value, changed_at columns. Changed parcels are highlighted on the map.",
  parameters: z.object({
    change_sql: z
      .string()
      .min(10)
      .describe(
        "SQL returning temporal change records. Must include: parcel_id, field, previous_value, current_value, changed_at, " +
        "and optionally geom for map rendering. " +
        "Example: SELECT parcel_id, 'owner' as field, old_owner as previous_value, new_owner as current_value, " +
        "transfer_date as changed_at, geom FROM assessor_sales WHERE transfer_date > '2024-01-01'",
      ),
    label: z
      .string()
      .optional()
      .nullable()
      .describe("Label for the change layer (e.g. 'Ownership Changes 2024')."),
  }),
  execute: async (params, context) => {
    const orgId = extractOrgId(context);
    if (!orgId) {
      return JSON.stringify({ error: "orgId not available in agent context." });
    }

    try {
      const { executeTemporalQuery } = await import(
        "../cartographer/temporalQuery.js"
      );

      const result = await executeTemporalQuery(
        { orgId, userId: extractUserId(context) },
        {
          changeSql: params.change_sql,
          label: params.label ?? undefined,
        },
      );

      return JSON.stringify({
        summary: result.summary,
        changes: result.changes.slice(0, 50),
        citationRefs: result.citationRefs,
        __mapActions: result.mapActions,
      });
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : "Temporal query failed.",
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Collected export for wiring into createConfiguredCoordinator
// ---------------------------------------------------------------------------

export const cartographerTools = [
  spatial_query,
  fit_score,
  find_assemblage,
  draft_site_plan,
  temporal_query,
];
