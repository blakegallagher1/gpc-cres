/**
 * ParcelQueryPlanner — Core intelligence that decomposes user messages + map context
 * into typed execution plans for parcel intelligence queries.
 *
 * Implements heuristic intent classification, input set creation, resolution strategy
 * selection, and execution directive assembly without LLM calls.
 */

import { randomUUID } from "crypto";
import {
  ParcelQueryPlan,
  ParcelQueryIntent,
  ParcelSetDefinition,
  ParcelSetOrigin,
  ParcelSetStatus,
  ParcelSetLifecycle,
  ParcelFilter,
  ResolutionStrategy,
  ScreeningStrategy,
  ScreeningDimension,
  ExecutionDirectives,
  MemoryPolicy,
  MapContextInput,
  OutputMode,
} from "@entitlement-os/shared";
import { resolveField } from "./fields";
import { ParcelSetRegistry } from "./registry";

/**
 * Input to the ParcelQueryPlanner.plan() method
 */
export interface PlannerInput {
  message: string;
  orgId: string;
  mapContext: MapContextInput | null;
  registry: ParcelSetRegistry;
  conversationId: string;
  conversationHistory?: string[];
}

/**
 * ParcelQueryPlanner decomposes user messages into executable query plans
 */
export class ParcelQueryPlanner {
  /**
   * Main planning entry point: decomposes user message + context into a ParcelQueryPlan
   */
  plan(input: PlannerInput): ParcelQueryPlan {
    const {
      message,
      orgId,
      mapContext,
      registry,
      conversationId,
      conversationHistory,
    } = input;

    // Detect follow-up queries based on conversation history
    const isFollowUp = this.detectFollowUp(message, conversationHistory);

    // Classify intent from message heuristics
    const hasSelectedParcels = !!(
      mapContext?.selectedParcelIds && mapContext.selectedParcelIds.length > 0
    );
    const hasMapContext = !!(
      mapContext?.center || mapContext?.zoom || hasSelectedParcels
    );

    const intent = this.classifyIntent(message, hasMapContext, hasSelectedParcels);

    // Create input sets from map context
    const inputSets = this.createInputSets(
      orgId,
      mapContext,
      registry,
      conversationId
    );

    // Extract filters from message
    const filters = this.extractFilters(message);

    // Plan screening if relevant
    const screening = this.planScreening(intent, message);

    // Select resolution strategy
    const resolution = this.selectResolutionStrategy(intent, inputSets);

    // Assemble execution directives
    const directives = this.assembleDirectives(intent, screening);

    // Build memory policy (always conservative in Phase 1)
    const memoryPolicy = this.buildMemoryPolicy();

    return {
      id: randomUUID(),
      intent,
      inputSets,
      resolution,
      filters,
      screening,
      scoring: null, // Phase 2
      outputMode: this.selectOutputMode(intent),
      directives,
      memoryPolicy,
      provenanceRequirements: {
        requireAuthoritative: true,
        maxStalenessSeconds: 300, // 5 minutes
        verifyMemoryResults: true,
      },
      isFollowUp,
    };
  }

  /**
   * Classify the intent of a parcel query using heuristic keyword matching
   */
  private classifyIntent(
    message: string,
    hasMapContext: boolean,
    hasSelectedParcels: boolean
  ): ParcelQueryIntent {
    const lowerMsg = message.toLowerCase();

    // Identify intent
    if (
      /\b(what is|identify|what parcel|what are these)\b/i.test(lowerMsg) &&
      hasSelectedParcels
    ) {
      return "identify";
    }

    // Screen intent
    if (
      /\b(flood|soils?|wetlands?|epa|environmental|risk|screen|screening)\b/i.test(
        lowerMsg
      )
    ) {
      return "screen";
    }

    // Compare intent
    if (/\b(compare|versus|vs|difference|differ)\b/i.test(lowerMsg)) {
      return "compare";
    }

    // Rank intent
    if (/\b(rank|best|worst|top|bottom|highest|lowest)\b/i.test(lowerMsg)) {
      return "rank";
    }

    // Discover intent
    if (/\b(discover|search|locate|find)\b/i.test(lowerMsg)) {
      // Only discover if it's a general search without specific filter criteria
      if (
        !/\b(acres|zoning|zone|M1|M2|C1|C2|A1|I1)\b/i.test(lowerMsg) &&
        !/\b(over|under|more than|less than)\b/i.test(lowerMsg)
      ) {
        return "discover";
      }
    }

    // Filter intent
    if (
      /\b(show|filter|find)\b/i.test(lowerMsg) &&
      /(acres|zoning|zone|M1|M2|C1|C2|A1|I1|over|under|more than|less than)\b/i.test(
        lowerMsg
      )
    ) {
      return "filter";
    }

    // Refine intent
    if (
      /\b(narrow|refine|exclude|remove|only|just the|filter out)\b/i.test(
        lowerMsg
      )
    ) {
      return "refine";
    }

    // Summarize intent
    if (
      /\b(summarize|overview|summary|tell me about|what do we have)\b/i.test(
        lowerMsg
      )
    ) {
      return "summarize";
    }

    // No parcel context at all
    if (!hasMapContext && !hasSelectedParcels) {
      return "general";
    }

    // Default with map context
    if (hasMapContext) {
      return "summarize";
    }

    return "general";
  }

  /**
   * Detect if this is a follow-up query based on conversation history
   */
  private detectFollowUp(message: string, history?: string[]): boolean {
    if (!history || history.length === 0) {
      return false;
    }

    // Heuristic: if message is very short or uses pronouns/references, likely a follow-up
    if (message.length < 30) {
      return true;
    }

    const lowerMsg = message.toLowerCase();

    // Check for follow-up keywords
    if (/\b(these|those|the|that|another|also|next|more|other)\b/i.test(lowerMsg)) {
      return true;
    }

    return false;
  }

  /**
   * Create input sets from map context (selection and/or viewport)
   */
  private createInputSets(
    orgId: string,
    mapContext: MapContextInput | null,
    registry: ParcelSetRegistry,
    conversationId: string
  ): ParcelSetDefinition[] {
    const sets: ParcelSetDefinition[] = [];
    const now = new Date().toISOString();

    // Create selection set if selectedParcelIds are present
    if (mapContext?.selectedParcelIds && mapContext.selectedParcelIds.length > 0) {
      const selectionSetId = randomUUID();
      const selectionSet: ParcelSetDefinition = {
        id: selectionSetId,
        orgId,
        label: mapContext.viewportLabel || "Selected parcels",
        origin: {
          kind: "selection",
          parcelIds: mapContext.selectedParcelIds,
          source: "map",
        },
        lifecycle: {
          kind: "ephemeral",
          scope: "conversation",
        },
        status: "unresolved" as ParcelSetStatus,
        createdAt: now,
        metadata: {},
      };
      registry.register(conversationId, selectionSet);
      sets.push(selectionSet);
    }

    // Create viewport set if center and zoom are present
    if (mapContext?.center !== undefined && mapContext.center !== null && mapContext.zoom !== undefined) {
      const viewportSetId = randomUUID();
      const bbox = this.bboxFromCenterZoom(mapContext.center, mapContext.zoom);
      const viewportSet: ParcelSetDefinition = {
        id: viewportSetId,
        orgId,
        label: "Viewport parcels",
        origin: {
          kind: "viewport",
          spatial: {
            kind: "bbox",
            bounds: bbox,
          },
        },
        lifecycle: {
          kind: "ephemeral",
          scope: "conversation",
        },
        status: "unresolved" as ParcelSetStatus,
        createdAt: now,
        metadata: {
          center: mapContext.center,
          zoom: mapContext.zoom,
        },
      };
      registry.register(conversationId, viewportSet);
      sets.push(viewportSet);
    }

    return sets;
  }

  /**
   * Compute approximate bounding box from center + zoom level
   */
  private bboxFromCenterZoom(
    center: { lat: number; lng: number },
    zoom: number
  ): [number, number, number, number] {
    // Approximate degrees visible at zoom level
    // At zoom Z, the world is 256*2^Z pixels wide
    const degreesPerPixel = 360 / (256 * Math.pow(2, zoom));
    const halfWidth = degreesPerPixel * 600; // ~1200px viewport width
    const halfHeight = degreesPerPixel * 350; // ~700px viewport height

    return [
      center.lng - halfWidth, // west
      center.lat - halfHeight, // south
      center.lng + halfWidth, // east
      center.lat + halfHeight, // north
    ];
  }

  /**
   * Select the resolution strategy based on intent and available input sets
   */
  private selectResolutionStrategy(
    intent: ParcelQueryIntent,
    inputSets: ParcelSetDefinition[]
  ): ResolutionStrategy {
    // Check if we have a selection set
    const selectionSet = inputSets.find(
      (s) => s.origin.kind === "selection"
    );
    const viewportSet = inputSets.find(
      (s) => s.origin.kind === "viewport"
    );

    // If we have a selection and the intent supports passthrough, use it
    if (
      selectionSet &&
      ["identify", "screen", "compare", "summarize"].includes(intent)
    ) {
      return { kind: "selection-passthrough" };
    }

    // If we have a viewport, use bbox strategy
    if (viewportSet && viewportSet.origin.kind === "viewport") {
      return {
        kind: "bbox",
        spatial: viewportSet.origin.spatial,
        limit: 1000, // Default limit for viewport queries
      };
    }

    // If intent is discover, use memory discovery (stubbed in executor)
    if (intent === "discover") {
      return {
        kind: "memory-discovery",
        query: "", // Filled by executor
        topK: 20,
      };
    }

    // Default: passthrough selection if available, else bbox
    if (selectionSet) {
      return { kind: "selection-passthrough" };
    }

    if (viewportSet && viewportSet.origin.kind === "viewport") {
      return {
        kind: "bbox",
        spatial: viewportSet.origin.spatial,
        limit: 1000,
      };
    }

    return { kind: "selection-passthrough" };
  }

  /**
   * Extract filters from user message using regex patterns
   */
  private extractFilters(message: string): ParcelFilter[] {
    const filters: ParcelFilter[] = [];

    // Zoning code patterns: M1, M2, C1, C2, A1-A5, I1, B1, etc.
    const zoningPattern = /\b([ACMBI]\d)\b/gi;
    const zoningMatches = message.match(zoningPattern);
    if (zoningMatches && zoningMatches.length > 0) {
      const canonicalField = resolveField("zoningType");
      if (canonicalField) {
        const uniqueZoning = Array.from(new Set(zoningMatches.map((z) => z.toUpperCase())));
        filters.push({
          field: canonicalField,
          operator: "in",
          value: uniqueZoning,
        });
      }
    }

    // Acreage patterns: "over X acres", "more than X acres", "at least X acres"
    const overPattern = /(?:over|more than|at least|exceeds?)\s+(\d+(?:\.\d+)?)\s+acres?/gi;
    const overMatch = overPattern.exec(message);
    if (overMatch) {
      const canonicalField = resolveField("acres");
      if (canonicalField) {
        filters.push({
          field: canonicalField,
          operator: "gte",
          value: parseFloat(overMatch[1]),
        });
      }
    }

    // Acreage patterns: "under X acres", "less than X acres"
    const underPattern = /(?:under|less than|below)\s+(\d+(?:\.\d+)?)\s+acres?/gi;
    const underMatch = underPattern.exec(message);
    if (underMatch) {
      const canonicalField = resolveField("acres");
      if (canonicalField) {
        filters.push({
          field: canonicalField,
          operator: "lte",
          value: parseFloat(underMatch[1]),
        });
      }
    }

    return filters;
  }

  /**
   * Plan screening dimensions and strategy if intent is "screen"
   */
  private planScreening(
    intent: ParcelQueryIntent,
    message: string
  ): ScreeningStrategy | null {
    if (intent !== "screen") {
      return null;
    }

    const lowerMsg = message.toLowerCase();
    const dimensions: ScreeningDimension[] = [];

    // Map keywords to screening dimensions
    if (/\bflood\b/i.test(lowerMsg)) {
      dimensions.push("flood");
    }
    if (/\bsoils?\b/i.test(lowerMsg)) {
      dimensions.push("soils");
    }
    if (/\bwetlands?\b/i.test(lowerMsg)) {
      dimensions.push("wetlands");
    }
    if (/\bepa\b/i.test(lowerMsg)) {
      dimensions.push("epa");
    }
    if (/\btraffic\b/i.test(lowerMsg)) {
      dimensions.push("traffic");
    }
    if (/\bldeq|permit\b/i.test(lowerMsg)) {
      dimensions.push("ldeq");
    }
    if (/\bzoning\b/i.test(lowerMsg)) {
      dimensions.push("zoning");
    }

    // If "full" or "all" mentioned, screen all dimensions
    if (/\b(full|all|complete|comprehensive|environmental)\b/i.test(lowerMsg)) {
      return {
        dimensions: ["flood", "soils", "wetlands", "epa", "traffic", "ldeq", "zoning"],
        mode: "full",
        batchSize: 8,
        priority: "completeness",
      };
    }

    // If specific dimensions found, use selective screening
    if (dimensions.length > 0) {
      return {
        dimensions,
        mode: "selective",
        batchSize: 8,
        priority: "speed",
      };
    }

    // Default: screen all dimensions with speed priority
    return {
      dimensions: ["flood", "soils", "wetlands", "epa", "traffic", "ldeq", "zoning"],
      mode: "full",
      batchSize: 8,
      priority: "speed",
    };
  }

  /**
   * Assemble execution directives based on intent and screening strategy
   */
  private assembleDirectives(
    intent: ParcelQueryIntent,
    screening: ScreeningStrategy | null
  ): ExecutionDirectives {
    return {
      materializationMode: "immediate",
      screeningTiming: screening ? "pre-agent" : "none",
      authoritativeVerification: "required",
      freshnessMaxSeconds: 300, // 5 minutes
      estimatedCost:
        intent === "identify" || intent === "summarize"
          ? "light"
          : intent === "filter" || intent === "screen"
            ? "moderate"
            : "heavy", // discover, rank, compare
    };
  }

  /**
   * Select the output mode based on intent
   */
  private selectOutputMode(intent: ParcelQueryIntent): OutputMode {
    switch (intent) {
      case "identify":
        return "detail";
      case "compare":
        return "comparison";
      case "rank":
        return "comparison";
      case "summarize":
        return "summary";
      case "screen":
        return "detail";
      case "filter":
        return "list";
      case "discover":
        return "list";
      case "refine":
        return "list";
      case "general":
        return "summary";
      default:
        return "list";
    }
  }

  /**
   * Build memory policy (Phase 1: conservative, no semantic discovery)
   */
  private buildMemoryPolicy(): MemoryPolicy {
    return {
      allowSemanticDiscovery: false,
      requireDbVerification: true,
      maxCandidatesFromMemory: 0,
      confidenceFloor: 0.7,
    };
  }
}
