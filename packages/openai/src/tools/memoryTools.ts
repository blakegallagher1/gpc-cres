import { tool } from "@openai/agents";
import { z } from "zod";

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
  // The OpenAI Agents SDK wraps user context in RunContext<T>.
  // Tool execute functions receive RunContext where the actual user-provided
  // context object lives at RunContext.context (the .context property).
  // Unwrap if needed so we can access orgId/userId.
  let raw = context as Record<string, unknown> | undefined;
  if (raw && typeof raw === "object" && "context" in raw && typeof raw.context === "object" && raw.context !== null) {
    raw = raw.context as Record<string, unknown>;
  }
  return {
    orgId: typeof raw?.orgId === "string" && raw.orgId.length > 0
      ? raw.orgId
      : undefined,
    userId: typeof raw?.userId === "string" && raw.userId.length > 0
      ? raw.userId
      : undefined,
  };
}

export function buildMemoryToolHeaders(context?: unknown): MemoryToolHeaders {
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
 * Read-only entity lookup by address or parcel_id.
 * Returns the entity_id and truth view WITHOUT writing anything to the database.
 * Use this when the user asks about a property. Use store_memory ONLY when the
 * user provides actual fact data (comps, lender terms, tour notes, etc.).
 */
export const lookup_entity_by_address = tool({
  name: "lookup_entity_by_address",
  description:
    "Look up what the system knows about a property by address or parcel_id. " +
    "Returns entity_id and current truth view (verified facts, open conflicts, corrections). " +
    "READ-ONLY — does not write anything to the database. " +
    "Use this instead of store_memory when the user asks about a property without providing new data.",
  parameters: z.object({
    address: z
      .string()
      .nullable()
      .describe("Street address of the property (e.g. '2550 Cedarcrest Ave, Baton Rouge, LA 70816')"),
    parcel_id: z
      .string()
      .nullable()
      .describe("Parcel ID from property database"),
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
      if (params.address) searchParams.set("address", params.address);
      if (params.parcel_id) searchParams.set("parcel_id", params.parcel_id);

      const resp = await fetch(
        `${url}/api/entities/lookup?${searchParams}`,
        { headers: buildMemoryToolHeaders(context) },
      );

      if (!resp.ok) {
        const errBody = await resp.text();
        return { found: false, error: `API error ${resp.status}: ${errBody}` };
      }

      return await resp.json();
    } catch (err) {
      return {
        found: false,
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

/**
 * ingest_comps — batch-ingest structured comp records directly into the memory
 * system, bypassing free-text parsing. Use when the user provides a table of
 * comps with structured data (address, sale price, buyer, seller, cap rate, etc.).
 */
export const ingest_comps = tool({
  name: "ingest_comps",
  description:
    "Batch-ingest structured comp records into the memory system. Use when the user provides " +
    "a table or list of comps with known fields (address, sale price, buyer, seller, cap rate, etc.). " +
    "Each comp is entity-resolved, duplicate-checked, and stored in draft or verified memory. " +
    "Returns a summary of how many comps were stored, skipped as duplicates, or flagged as collisions.",
  parameters: z.object({
    comps: z
      .array(
        z.object({
          address: z.string().describe("Street address of the property"),
          city: z.string().describe("City"),
          state: z.string().describe("State abbreviation, e.g. LA"),
          zip: z.string().nullable().describe("ZIP code"),
          property_type: z
            .enum([
              "industrial_flex",
              "cold_storage",
              "outdoor_storage",
              "truck_terminal",
              "distribution_center",
              "warehouse",
              "manufacturing",
              "mixed_use",
            ])
            .describe("Property type"),
          transaction_type: z
            .enum(["sale", "lease", "listing"])
            .describe("Type of transaction"),
          sale_price: z.number().nullable().describe("Sale price in dollars"),
          price_per_sf: z.number().nullable().describe("Price per square foot"),
          cap_rate: z
            .number()
            .nullable()
            .describe("Cap rate as decimal, e.g. 0.065 for 6.5%"),
          building_size_sf: z
            .number()
            .nullable()
            .describe("Building size in square feet"),
          land_size_acres: z.number().nullable().describe("Land size in acres"),
          year_built: z.number().nullable().describe("Year built"),
          transaction_date: z
            .string()
            .nullable()
            .describe("Transaction date as ISO 8601 string or YYYY-MM-DD"),
          lease_rate: z
            .number()
            .nullable()
            .describe("Lease rate per SF per year"),
          lease_term: z.number().nullable().describe("Lease term in months"),
          buyer: z.string().nullable().describe("Buyer name"),
          seller: z.string().nullable().describe("Seller name"),
          broker_notes: z.string().nullable().describe("Broker notes or comments"),
          source: z
            .enum([
              "loopnet",
              "costar",
              "crexi",
              "rca",
              "broker_package",
              "tax_assessor",
              "manual_entry",
              "api_integration",
            ])
            .describe("Data source"),
        }),
      )
      .describe("Array of comp records to ingest"),
    auto_verify: z
      .boolean()
      .nullable()
      .describe(
        "If true, store comps as verified immediately. Default false (stored as draft pending review).",
      ),
  }),
  execute: async (params, context) => {
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.VERCEL_URL ??
        "http://localhost:3000";
      const url = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;

      // Map tool params to MemoryIngestionRequest shape
      const comps = params.comps.map((c) => ({
        address: c.address,
        city: c.city,
        state: c.state,
        zip: c.zip ?? undefined,
        propertyType: c.property_type,
        transactionType: c.transaction_type,
        salePrice: c.sale_price ?? undefined,
        pricePerSf: c.price_per_sf ?? undefined,
        capRate: c.cap_rate ?? undefined,
        buildingSizeSf: c.building_size_sf ?? undefined,
        landSizeAcres: c.land_size_acres ?? undefined,
        yearBuilt: c.year_built ?? undefined,
        transactionDate: c.transaction_date ?? undefined,
        leaseRate: c.lease_rate ?? undefined,
        leaseTerm: c.lease_term ?? undefined,
        buyer: c.buyer ?? undefined,
        seller: c.seller ?? undefined,
        brokerNotes: c.broker_notes ?? undefined,
        source: c.source,
      }));

      const resp = await fetch(`${url}/api/memory/ingest`, {
        method: "POST",
        headers: buildMemoryToolHeaders(context),
        body: JSON.stringify({
          comps,
          autoVerify: params.auto_verify ?? false,
          sourceType: "manual_entry",
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        return `Comp ingest failed: ${resp.status} ${errBody}`;
      }

      const result = await resp.json() as {
        totalComps: number;
        newEntities: number;
        duplicatesSkipped: number;
        draftsCreated: number;
        verifiedCreated: number;
        collisionsDetected: number;
        errors: Array<{ compIndex: number; message: string }>;
      };

      const parts: string[] = [
        `Ingested ${result.totalComps} comp(s):`,
        `  • ${result.verifiedCreated} verified, ${result.draftsCreated} draft`,
        `  • ${result.newEntities} new entities, ${result.duplicatesSkipped} duplicates skipped`,
      ];
      if (result.collisionsDetected > 0) {
        parts.push(`  • ⚠️ ${result.collisionsDetected} collision(s) detected — review flagged facts`);
      }
      if (result.errors.length > 0) {
        parts.push(`  • ❌ ${result.errors.length} error(s): ${result.errors.map((e) => e.message).join("; ")}`);
      }
      return parts.join("\n");
    } catch (err) {
      return `Comp ingest error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
