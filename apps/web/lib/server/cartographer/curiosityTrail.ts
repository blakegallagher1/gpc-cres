import "server-only";

import type {
  CartographerContext,
  CuriosityTrailItem,
  CartographerAction,
  BBox,
} from "./types.js";

// ---------------------------------------------------------------------------
// curiosityTrail — proactive spatial recommendations
//
// Generates contextual suggestions based on:
// - Current viewport (what's visible on the map)
// - Recent query results (what the user just searched for)
// - Selection state (what parcel/feature the user clicked)
//
// These are surfaced as "curiosity trail" items the user can accept or dismiss.
// ---------------------------------------------------------------------------

export interface CuriosityTrailInput {
  /** Current viewport bounding box. */
  viewport?: BBox;
  /** Recently queried layer IDs. */
  recentLayerIds?: string[];
  /** Currently selected feature IDs. */
  selectedFeatureIds?: string[];
  /** The user's last natural-language query (for topical relevance). */
  lastUserQuery?: string;
}

export interface CuriosityTrailOutput {
  trails: CuriosityTrailItem[];
  citationRefs: string[];
}

/**
 * Generate curiosity trail recommendations based on current map context.
 *
 * This is a rules-based engine that proposes useful next steps. It does NOT
 * call the gateway or run SQL — it generates suggestions that the agent can
 * then execute via other Cartographer tools.
 */
export async function generateCuriosityTrail(
  ctx: CartographerContext,
  input: CuriosityTrailInput,
): Promise<CuriosityTrailOutput> {
  const trails: CuriosityTrailItem[] = [];

  // ---- Viewport-based suggestions ----
  if (input.viewport) {
    const [west, south, east, north] = input.viewport;
    const widthDeg = east - west;
    const heightDeg = north - south;

    // If zoomed into a small area, suggest nearby parcels
    if (widthDeg < 0.02 && heightDeg < 0.02) {
      trails.push({
        id: `curiosity-nearby-parcels-${Date.now()}`,
        label: "Explore nearby parcels",
        description:
          "You're zoomed into a small area. Want to see all parcels within this viewport?",
        trigger: "viewport_change",
        relevanceScore: 0.8,
        suggestedActions: [
          {
            action: "message",
            text: "Querying parcels in the current viewport…",
            severity: "info",
          },
        ],
      });
    }

    // If zoomed out far, suggest narrowing focus
    if (widthDeg > 0.5) {
      trails.push({
        id: `curiosity-zoom-in-${Date.now()}`,
        label: "Zoom into a focus area",
        description:
          "Your current view covers a wide area. Zoom into a neighborhood or corridor for more precise analysis.",
        trigger: "viewport_change",
        relevanceScore: 0.5,
        suggestedActions: [
          {
            action: "message",
            text: "Consider zooming into a specific corridor or parish for focused results.",
            severity: "info",
          },
        ],
      });
    }
  }

  // ---- Selection-based suggestions ----
  if (input.selectedFeatureIds && input.selectedFeatureIds.length > 0) {
    const count = input.selectedFeatureIds.length;

    if (count === 1) {
      trails.push({
        id: `curiosity-parcel-deep-dive-${Date.now()}`,
        label: "Deep-dive this parcel",
        description:
          "Run a full screening (flood, soils, wetlands, EPA, zoning) on the selected parcel.",
        trigger: "selection",
        relevanceScore: 0.9,
        suggestedActions: [
          {
            action: "message",
            text: `Running full screening on parcel ${input.selectedFeatureIds[0]}…`,
            severity: "info",
          },
        ],
      });

      trails.push({
        id: `curiosity-adjacent-parcels-${Date.now()}`,
        label: "Show adjacent parcels",
        description:
          "Find parcels that touch or are within 50m of the selected parcel — useful for assemblage opportunities.",
        trigger: "selection",
        relevanceScore: 0.75,
        suggestedActions: [
          {
            action: "message",
            text: "Searching for adjacent parcels for potential assemblage…",
            severity: "info",
          },
        ],
      });
    }

    if (count >= 2) {
      trails.push({
        id: `curiosity-assemblage-${Date.now()}`,
        label: "Evaluate as assemblage",
        description:
          `You have ${count} parcels selected. Want to evaluate them as a combined assemblage?`,
        trigger: "selection",
        relevanceScore: 0.85,
        suggestedActions: [
          {
            action: "message",
            text: `Evaluating ${count} parcels as assemblage candidate…`,
            severity: "info",
          },
        ],
      });
    }
  }

  // ---- Query-context suggestions ----
  if (input.lastUserQuery) {
    const q = input.lastUserQuery.toLowerCase();

    if (/\b(flood|fema|floodplain)\b/.test(q) && !q.includes("zone x")) {
      trails.push({
        id: `curiosity-flood-overlay-${Date.now()}`,
        label: "Add FEMA flood zone overlay",
        description:
          "Your query mentions flooding. Want to overlay the FEMA flood zone boundaries on the map?",
        trigger: "query_result",
        relevanceScore: 0.85,
        suggestedActions: [
          {
            action: "message",
            text: "Adding FEMA flood zone overlay to the map…",
            severity: "info",
          },
        ],
      });
    }

    if (/\b(zoning|rezone|land use)\b/.test(q)) {
      trails.push({
        id: `curiosity-zoning-overlay-${Date.now()}`,
        label: "Add zoning district overlay",
        description:
          "Your query involves zoning. Want to see zoning district boundaries on the map?",
        trigger: "query_result",
        relevanceScore: 0.8,
        suggestedActions: [
          {
            action: "message",
            text: "Adding zoning district overlay to the map…",
            severity: "info",
          },
        ],
      });
    }

    if (/\b(comp|comparable|sale|sold)\b/.test(q)) {
      trails.push({
        id: `curiosity-sales-heatmap-${Date.now()}`,
        label: "Show recent sales heatmap",
        description:
          "Your query relates to comparable sales. Want to see a price-per-acre heatmap of recent transactions?",
        trigger: "query_result",
        relevanceScore: 0.8,
        suggestedActions: [
          {
            action: "message",
            text: "Generating recent sales heatmap…",
            severity: "info",
          },
        ],
      });
    }
  }

  // ---- Idle suggestion (always available) ----
  if (trails.length === 0) {
    trails.push({
      id: `curiosity-idle-${Date.now()}`,
      label: "Explore the area",
      description:
        "Try asking about parcels, zoning, flood risk, or comparable sales in the area you're viewing.",
      trigger: "idle",
      relevanceScore: 0.3,
      suggestedActions: [
        {
          action: "message",
          text: "Try: \"Show me parcels over 5 acres zoned industrial within the viewport\"",
          severity: "info",
        },
      ],
    });
  }

  // Sort by relevance desc
  trails.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return {
    trails: trails.slice(0, 5),
    citationRefs: input.selectedFeatureIds?.slice(0, 10) ?? [],
  };
}
