import { tool } from "@openai/agents";
import { z } from "zod";

type MemoryToolContext = {
  orgId?: unknown;
  userId?: unknown;
};

type MemoryToolHeaders = Record<string, string>;

function getInternalMemoryToolToken(): string {
  return (
    process.env.MEMORY_TOOL_SERVICE_TOKEN?.trim() ??
    process.env.LOCAL_API_KEY?.trim() ??
    process.env.COORDINATOR_TOOL_SERVICE_TOKEN?.trim() ??
    ""
  );
}

function sanitizeMemoryToolContext(context: unknown): {
  orgId?: string;
  userId?: string;
} {
  const typedContext = context as MemoryToolContext | undefined;
  return {
    orgId: typeof typedContext?.orgId === "string" && typedContext.orgId.length > 0
      ? typedContext.orgId
      : undefined,
    userId: typeof typedContext?.userId === "string" && typedContext.userId.length > 0
      ? typedContext.userId
      : undefined,
  };
}

function buildMemoryToolHeaders(context?: unknown): MemoryToolHeaders {
  const headers: MemoryToolHeaders = { "Content-Type": "application/json" };
  const token = getInternalMemoryToolToken();
  const { orgId, userId } = sanitizeMemoryToolContext(context);
  if (!token || !orgId || !userId) {
    return headers;
  }

  headers.Authorization = `Bearer ${token}`;
  headers["x-agent-tool-auth"] = "coordinator-memory";
  headers["x-agent-org-id"] = orgId;
  headers["x-agent-user-id"] = userId;

  return headers;
}

const factTypeValues = [
  "zoning",
  "flood_zone",
  "environmental",
  "traffic",
  "ownership",
  "valuation",
  "lease_terms",
  "entitlement",
  "market_comp",
  "contact",
  "general",
] as const;

const sourceTypeValues = [
  "agent",
  "user",
  "system",
  "external_api",
  "document",
  "cron",
] as const;

/**
 * Records a memory event for a property/entity into the append-only event log.
 * Agents call this when they discover, validate, or reject facts about properties.
 */
export const record_memory_event = tool({
  name: "record_memory_event",
  description:
    "Record a memory event (fact discovery, validation, or rejection) for a property or entity. " +
    "Every screening result, user confirmation, or data conflict should be logged as a memory event. " +
    "Provide either an address or parcel_id to identify the entity.",
  parameters: z.object({
    address: z
      .string()
      .nullable()
      .describe("Street address of the property (used for entity resolution if no entity_id)"),
    parcel_id: z
      .string()
      .nullable()
      .describe("Parcel ID from property database"),
    entity_type: z
      .string()
      .nullable()
      .describe("Entity type: property, market, lender, contact. Defaults to property"),
    fact_type: z
      .enum(factTypeValues)
      .describe("Category of fact being recorded"),
    source_type: z
      .enum(sourceTypeValues)
      .describe("Where this fact originated"),
    payload: z
      .string()
      .describe("JSON-encoded object of fact data as key-value pairs, e.g. '{\"zone\":\"A4\",\"max_density\":12}'"),
    deal_id: z
      .string()
      .nullable()
      .describe("Associated deal ID if applicable"),
    status: z
      .enum(["attempted", "accepted", "rejected", "conflicted"])
      .nullable()
      .describe("Event status. Defaults to attempted"),
  }),
  execute: async (params, context) => {
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.VERCEL_URL ??
        "http://localhost:3000";
      const url = baseUrl.startsWith("http")
        ? baseUrl
        : `https://${baseUrl}`;

      const resp = await fetch(`${url}/api/memory/events`, {
        method: "POST",
        headers: buildMemoryToolHeaders(context),
        body: JSON.stringify({
          address: params.address,
          parcelId: params.parcel_id,
          entityType: params.entity_type ?? "property",
          factType: params.fact_type,
          sourceType: params.source_type,
          payloadJson: typeof params.payload === "string" ? JSON.parse(params.payload) : params.payload,
          status: params.status ?? "attempted",
          dealId: params.deal_id,
          toolName: "record_memory_event",
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        return { recorded: false, error: `API error ${resp.status}: ${errBody}` };
      }

      const event = await resp.json();
      return { recorded: true, eventId: event.id, entityId: event.entityId };
    } catch (err) {
      return {
        recorded: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/**
 * Retrieves memory event history for an entity.
 * Use this to check what the system already knows about a property before re-screening.
 */
export const get_entity_memory = tool({
  name: "get_entity_memory",
  description:
    "Retrieve the memory event history for an entity (property, market, lender, etc). " +
    "Returns chronological events showing what the system has discovered, validated, or rejected. " +
    "Use this before screening a property to avoid redundant work.",
  parameters: z.object({
    entity_id: z
      .string()
      .describe("The internal entity ID to look up memory for"),
    fact_type: z
      .string()
      .nullable()
      .describe("Filter by fact type (zoning, flood_zone, environmental, etc)"),
    status: z
      .string()
      .nullable()
      .describe("Filter by status (attempted, accepted, rejected, conflicted)"),
    limit: z
      .number()
      .nullable()
      .describe("Max number of events to return. Default 50, max 100"),
  }),
  execute: async (params, context) => {
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.VERCEL_URL ??
        "http://localhost:3000";
      const url = baseUrl.startsWith("http")
        ? baseUrl
        : `https://${baseUrl}`;

      const searchParams = new URLSearchParams();
      if (params.fact_type) searchParams.set("factType", params.fact_type);
      if (params.status) searchParams.set("status", params.status);
      if (params.limit) searchParams.set("limit", String(params.limit));

      const resp = await fetch(
        `${url}/api/entities/${params.entity_id}/memory?${searchParams}`,
        { headers: buildMemoryToolHeaders(context) },
      );

      if (!resp.ok) {
        const errBody = await resp.text();
        return { events: [], error: `API error ${resp.status}: ${errBody}` };
      }

      const data = await resp.json();
      return {
        events: data.events,
        truthSummary: data.truthSummary,
        pagination: data.pagination,
        count: data.events.length,
      };
    } catch (err) {
      return {
        events: [],
        error: err instanceof Error ? err.message : String(err),
        count: 0,
      };
    }
  },
});

/**
 * Store a memory about a property/entity through the write gate.
 * Free-text input is parsed into a structured schema via OpenAI Structured Outputs,
 * validated, checked for conflicts, and routed to draft/verified/rejected stores.
 */
export const store_memory = tool({
  name: "store_memory",
  description:
    "Store a structured memory about a property or entity. Accepts free-text input " +
    "which is parsed into a typed schema (comp, lender_term, tour_observation, projection, correction). " +
    "The write gate validates the input, detects conflicts with existing verified data, and routes " +
    "to draft (conflicting), verified (clean), or rejected (invalid) stores. " +
    "Provide at least one of address, parcel_id, or entity_id to identify the entity.",
  parameters: z.object({
    input_text: z
      .string()
      .describe("Free-text description of the fact to store (e.g., '123 Main sold for $2.5M, 6.5% cap, NOI $162,500')"),
    address: z
      .string()
      .nullable()
      .describe("Street address of the property"),
    parcel_id: z
      .string()
      .nullable()
      .describe("Parcel ID from property database"),
    entity_id: z
      .string()
      .nullable()
      .describe("Internal entity ID if already known"),
    entity_type: z
      .string()
      .nullable()
      .describe("Entity type: property, market, lender, contact. Defaults to property"),
  }),
  execute: async (params, context) => {
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.VERCEL_URL ??
        "http://localhost:3000";
      const url = baseUrl.startsWith("http")
        ? baseUrl
        : `https://${baseUrl}`;

      const resp = await fetch(`${url}/api/memory/write`, {
        method: "POST",
        headers: buildMemoryToolHeaders(context),
        body: JSON.stringify({
          input_text: params.input_text,
          address: params.address,
          parcel_id: params.parcel_id,
          entity_id: params.entity_id,
          entity_type: params.entity_type ?? "property",
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        return { stored: false, error: `API error ${resp.status}: ${errBody}` };
      }

      const result = await resp.json();
      return {
        stored: true,
        decision: result.decision,
        reasons: result.reasons,
        eventLogId: result.eventLogId,
        recordId: result.recordId,
        structuredMemoryWrite: result.structuredMemoryWrite,
      };
    } catch (err) {
      return {
        stored: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/**
 * Get the current truth view for an entity — the resolved state of all verified
 * memories, corrections, and open conflicts.
 */
export const get_entity_truth = tool({
  name: "get_entity_truth",
  description:
    "Get the current truth view for an entity. Returns the resolved state of all verified " +
    "memories with corrections applied, plus any open conflicts from draft records. " +
    "Use this to understand the current known state of a property before making decisions.",
  parameters: z.object({
    entity_id: z
      .string()
      .describe("The internal entity ID to get the truth view for"),
  }),
  execute: async (params, context) => {
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.VERCEL_URL ??
        "http://localhost:3000";
      const url = baseUrl.startsWith("http")
        ? baseUrl
        : `https://${baseUrl}`;

      const resp = await fetch(
        `${url}/api/entities/${params.entity_id}/truth`,
        { headers: buildMemoryToolHeaders(context) },
      );

      if (!resp.ok) {
        const errBody = await resp.text();
        return { error: `API error ${resp.status}: ${errBody}` };
      }

      return await resp.json();
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
