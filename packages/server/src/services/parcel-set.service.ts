import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  ParcelFacts,
  ParcelScreeningResult,
  ParcelSetDefinition,
  ParcelSetLifecycle,
  ParcelSetMaterialization,
  ParcelSetOrigin,
  ParcelSetProvenance,
  ParcelSetStatus,
  SetOperation,
} from "@entitlement-os/shared";

const MAX_ID_LENGTH = 128;
const MAX_LABEL_LENGTH = 160;
const MAX_METADATA_KEYS = 64;
const MAX_PARCEL_IDS = 500;
const MAX_FILTERS = 50;
const MAX_SQL_LENGTH = 10_000;
const MAX_FACTS = 500;
const MAX_SCREENING_RESULTS = 2_000;
const MAX_RADIUS_METERS = 160_934;
const IN_MEMORY_STORE_KEY = "__gpcParcelSetStore";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type StoredParcelSetRecord = {
  id: string;
  orgId: string;
  definitionJson: string;
  materializationJson: string | null;
};

/**
 * Persisted representation of a parcel set returned by the service.
 */
export interface ParcelSetRecord {
  definition: ParcelSetDefinition;
  materialization: ParcelSetMaterialization | null;
}

/**
 * Lifecycle input accepted by the service before it is normalized into the
 * shared `ParcelSetLifecycle` contract.
 */
export type ParcelSetLifecycleInput =
  | { kind: "ephemeral"; scope: "request" | "conversation" }
  | { kind: "persistent"; persistedId?: string | null };

/**
 * Materialization payload accepted by the service before defaults are applied.
 */
export interface CreateParcelSetMaterializationInput {
  memberIds: string[];
  facts?: ParcelFacts[];
  screening?: ParcelScreeningResult[];
  provenance?: Partial<ParcelSetProvenance>;
  materializedAt?: string;
}

/**
 * Create payload accepted by the service and the `/api/parcel-sets` route.
 */
export interface CreateParcelSetInput {
  orgId: string;
  id?: string;
  label?: string | null;
  origin: ParcelSetOrigin;
  lifecycle?: ParcelSetLifecycleInput;
  status?: ParcelSetStatus;
  createdAt?: string;
  metadata?: Record<string, JsonValue>;
  materialization?: CreateParcelSetMaterializationInput | null;
}

/**
 * Storage adapter abstraction so the current in-memory implementation can be
 * replaced with a persistent backend later without changing the service API.
 */
export interface ParcelSetStore {
  put(record: StoredParcelSetRecord): Promise<void>;
  get(id: string): Promise<StoredParcelSetRecord | null>;
  clear(): void;
}

const IsoTimestampSchema = z.string().datetime({ offset: true });
const ParcelSetIdSchema = z.string().trim().min(1).max(MAX_ID_LENGTH);
const NullableLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_LABEL_LENGTH)
  .nullable()
  .optional();
const ParcelIdSchema = z.string().trim().min(1).max(MAX_ID_LENGTH);
const ParcelIdListSchema = z
  .array(ParcelIdSchema)
  .min(1)
  .max(MAX_PARCEL_IDS)
  .transform((ids) => Array.from(new Set(ids)));
const LongitudeSchema = z.number().finite().min(-180).max(180);
const LatitudeSchema = z.number().finite().min(-90).max(90);
const CoordinateSchema = z.tuple([LongitudeSchema, LatitudeSchema]);
const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const MetadataSchema = z
  .record(z.string(), JsonValueSchema)
  .refine((value) => Object.keys(value).length <= MAX_METADATA_KEYS, {
    message: `metadata cannot contain more than ${MAX_METADATA_KEYS} keys`,
  });

const BboxSchema = z
  .tuple([LongitudeSchema, LatitudeSchema, LongitudeSchema, LatitudeSchema])
  .superRefine(([west, south, east, north], ctx) => {
    if (west >= east) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bbox west must be less than east",
      });
    }
    if (south >= north) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bbox south must be less than north",
      });
    }
  });

const PolygonRingSchema = z
  .array(CoordinateSchema)
  .min(4)
  .superRefine((ring, ctx) => {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "polygon rings must be closed",
      });
    }
  });

const PolygonCoordinatesSchema = z.array(PolygonRingSchema).min(1);

const ParcelFilterSchema = z.object({
  field: z.string().trim().min(1).max(64),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "within"]),
  value: JsonValueSchema,
});

const SetOperationSchema: z.ZodType<SetOperation> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("filter"),
    filters: z.array(ParcelFilterSchema).min(1).max(MAX_FILTERS),
  }),
  z.object({
    kind: z.literal("union"),
    otherSetId: ParcelSetIdSchema,
  }),
  z.object({
    kind: z.literal("intersect"),
    otherSetId: ParcelSetIdSchema,
  }),
  z.object({
    kind: z.literal("subtract"),
    otherSetId: ParcelSetIdSchema,
  }),
  z.object({
    kind: z.literal("sort"),
    field: z.string().trim().min(1).max(64),
    direction: z.enum(["asc", "desc"]),
  }),
  z.object({
    kind: z.literal("limit"),
    count: z.number().int().positive().max(MAX_PARCEL_IDS),
  }),
]);

const SpatialScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bbox"),
    bounds: BboxSchema,
  }),
  z.object({
    kind: z.literal("polygon"),
    coordinates: PolygonCoordinatesSchema,
  }),
  z.object({
    kind: z.literal("radius"),
    center: CoordinateSchema,
    radiusMeters: z.number().finite().positive().max(MAX_RADIUS_METERS),
  }),
]);

const ParcelSetOriginSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("viewport"),
    spatial: z.object({
      kind: z.literal("bbox"),
      bounds: BboxSchema,
    }),
  }),
  z.object({
    kind: z.literal("selection"),
    parcelIds: ParcelIdListSchema,
    source: z.enum(["map", "deal", "agent"]),
  }),
  z.object({
    kind: z.literal("query"),
    filters: z.array(ParcelFilterSchema).max(MAX_FILTERS),
    sql: z.string().trim().min(1).max(MAX_SQL_LENGTH).optional(),
  }),
  z.object({
    kind: z.literal("spatial"),
    spatial: SpatialScopeSchema,
    filters: z.array(ParcelFilterSchema).max(MAX_FILTERS).optional(),
  }),
  z.object({
    kind: z.literal("refinement"),
    parentSetId: ParcelSetIdSchema,
    operation: SetOperationSchema,
  }),
  z.object({
    kind: z.literal("saved"),
    persistedId: ParcelSetIdSchema,
  }),
]);

const ParcelSetLifecycleInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ephemeral"),
    scope: z.enum(["request", "conversation"]),
  }),
  z.object({
    kind: z.literal("persistent"),
    persistedId: ParcelSetIdSchema.nullish(),
  }),
]);

const ParcelSetLifecycleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ephemeral"),
    scope: z.enum(["request", "conversation"]),
  }),
  z.object({
    kind: z.literal("persistent"),
    persistedId: ParcelSetIdSchema,
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  }),
]);

const ParcelFactsSchema = z.object({
  parcelId: ParcelIdSchema,
  address: z.string().trim().min(1).max(512).nullable(),
  owner: z.string().trim().min(1).max(512).nullable(),
  acres: z.number().finite().nonnegative().nullable(),
  zoningType: z.string().trim().min(1).max(128).nullable(),
  center: CoordinateSchema.nullable(),
  parish: z.string().trim().min(1).max(128).nullable(),
  assessedValue: z.number().finite().nonnegative().nullable(),
});

const ParcelScreeningResultSchema = z.object({
  parcelId: ParcelIdSchema,
  dimensions: z
    .array(z.enum(["flood", "soils", "wetlands", "epa", "traffic", "ldeq", "zoning"]))
    .max(16),
  envelope: z.record(z.string(), JsonValueSchema),
  screenedAt: IsoTimestampSchema,
});

const ParcelSetProvenanceSchema = z.object({
  sourceKind: z.enum(["database", "memory", "mixed"]),
  sourceRoute: z.string().trim().min(1).max(512).nullable(),
  authoritative: z.boolean(),
  confidence: z.number().finite().min(0).max(1).nullable(),
  resolvedAt: IsoTimestampSchema.nullable(),
  freshness: z.enum(["fresh", "cached", "stale"]),
});

const CreateMaterializationSchema = z
  .object({
    memberIds: ParcelIdListSchema,
    facts: z.array(ParcelFactsSchema).max(MAX_FACTS).optional(),
    screening: z.array(ParcelScreeningResultSchema).max(MAX_SCREENING_RESULTS).optional(),
    provenance: ParcelSetProvenanceSchema.partial().optional(),
    materializedAt: IsoTimestampSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const memberIds = new Set(value.memberIds);
    for (const fact of value.facts ?? []) {
      if (!memberIds.has(fact.parcelId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `fact parcelId ${fact.parcelId} must also appear in memberIds`,
        });
      }
    }
    for (const screening of value.screening ?? []) {
      if (!memberIds.has(screening.parcelId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `screening parcelId ${screening.parcelId} must also appear in memberIds`,
        });
      }
    }
  });

const ParcelSetDefinitionSchema = z.object({
  id: ParcelSetIdSchema,
  orgId: ParcelSetIdSchema,
  label: z.string().trim().min(1).max(MAX_LABEL_LENGTH).nullable(),
  origin: ParcelSetOriginSchema,
  lifecycle: ParcelSetLifecycleSchema,
  status: z.enum(["unresolved", "resolving", "materialized", "stale", "failed"]),
  createdAt: IsoTimestampSchema,
  metadata: MetadataSchema,
});

const ParcelSetMaterializationSchema = z.object({
  parcelSetId: ParcelSetIdSchema,
  memberIds: ParcelIdListSchema,
  count: z.number().int().nonnegative(),
  facts: z.array(ParcelFactsSchema).max(MAX_FACTS),
  screening: z.array(ParcelScreeningResultSchema).max(MAX_SCREENING_RESULTS),
  provenance: ParcelSetProvenanceSchema,
  materializedAt: IsoTimestampSchema,
});

/**
 * Route-safe payload schema for parcel-set creation.
 */
export const CreateParcelSetRequestSchema = z.object({
  id: ParcelSetIdSchema.optional(),
  label: NullableLabelSchema,
  origin: ParcelSetOriginSchema,
  lifecycle: ParcelSetLifecycleInputSchema.optional(),
  status: z.enum(["unresolved", "resolving", "materialized", "stale", "failed"]).optional(),
  createdAt: IsoTimestampSchema.optional(),
  metadata: MetadataSchema.optional(),
  materialization: CreateMaterializationSchema.nullable().optional(),
});

/**
 * Shared parcel-set definition schema exported for route and test usage.
 */
export const SharedParcelSetDefinitionSchema = ParcelSetDefinitionSchema;

/**
 * Shared parcel-set materialization schema exported for route and test usage.
 */
export const SharedParcelSetMaterializationSchema = ParcelSetMaterializationSchema;

/**
 * In-memory parcel-set store used until a database-backed store is introduced.
 */
export class InMemoryParcelSetStore implements ParcelSetStore {
  private readonly store: Map<string, StoredParcelSetRecord>;

  constructor(store: Map<string, StoredParcelSetRecord> = getGlobalStore()) {
    this.store = store;
  }

  async put(record: StoredParcelSetRecord): Promise<void> {
    this.store.set(record.id, record);
  }

  async get(id: string): Promise<StoredParcelSetRecord | null> {
    return this.store.get(id) ?? null;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Service responsible for validation, normalization, serialization, and
 * org-scoped retrieval of parcel-set definitions and materializations.
 */
export class ParcelSetService {
  constructor(private readonly store: ParcelSetStore = new InMemoryParcelSetStore()) {}

  /**
   * Create and persist a parcel-set definition plus optional materialization.
   */
  async createParcelSet(input: CreateParcelSetInput): Promise<ParcelSetRecord> {
    const parsedInput = this.parseCreateInput(input);
    const definition = this.createDefinition(parsedInput);
    const materializationInput =
      parsedInput.materialization ?? this.deriveSelectionMaterialization(definition);
    const materialization = materializationInput
      ? this.createMaterialization(definition, materializationInput)
      : null;

    await this.store.put({
      id: definition.id,
      orgId: definition.orgId,
      definitionJson: serializeParcelSetDefinition(definition),
      materializationJson: materialization
        ? serializeParcelSetMaterialization(materialization)
        : null,
    });

    return {
      definition,
      materialization,
    };
  }

  /**
   * Retrieve a full parcel set by ID while enforcing org scoping.
   */
  async getParcelSetById(orgId: string, parcelSetId: string): Promise<ParcelSetRecord | null> {
    const record = await this.store.get(ParcelSetIdSchema.parse(parcelSetId));
    if (!record || record.orgId !== orgId) {
      return null;
    }

    const definition = deserializeParcelSetDefinition(record.definitionJson);
    if (definition.orgId !== orgId) {
      return null;
    }

    return {
      definition,
      materialization: record.materializationJson
        ? deserializeParcelSetMaterialization(record.materializationJson)
        : null,
    };
  }

  /**
   * Retrieve only a parcel-set definition by ID while enforcing org scoping.
   */
  async getDefinitionById(orgId: string, parcelSetId: string): Promise<ParcelSetDefinition | null> {
    const record = await this.getParcelSetById(orgId, parcelSetId);
    return record?.definition ?? null;
  }

  /**
   * Retrieve only a parcel-set materialization by ID while enforcing org scoping.
   */
  async getMaterializationById(
    orgId: string,
    parcelSetId: string,
  ): Promise<ParcelSetMaterialization | null> {
    const record = await this.getParcelSetById(orgId, parcelSetId);
    return record?.materialization ?? null;
  }

  /**
   * Create a validated parcel-set definition from service input.
   */
  createDefinition(input: z.infer<typeof CreateParcelSetRequestSchema> & { orgId: string }): ParcelSetDefinition {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const definition: ParcelSetDefinition = {
      id: input.id ?? randomUUID(),
      orgId: input.orgId,
      label: normalizeLabel(input.label),
      origin: ParcelSetOriginSchema.parse(input.origin),
      lifecycle: buildLifecycle(input.lifecycle, createdAt),
      status: input.status ?? "unresolved",
      createdAt,
      metadata: input.metadata ?? {},
    };

    return ParcelSetDefinitionSchema.parse(definition);
  }

  /**
   * Create a validated parcel-set materialization bound to an existing definition.
   */
  createMaterialization(
    definition: ParcelSetDefinition,
    input: CreateParcelSetMaterializationInput,
  ): ParcelSetMaterialization {
    const parsed = CreateMaterializationSchema.parse(input);
    const materialization: ParcelSetMaterialization = {
      parcelSetId: definition.id,
      memberIds: parsed.memberIds,
      count: parsed.memberIds.length,
      facts: parsed.facts ?? [],
      screening: parsed.screening ?? [],
      provenance: buildProvenance(parsed.provenance),
      materializedAt: parsed.materializedAt ?? new Date().toISOString(),
    };

    return ParcelSetMaterializationSchema.parse(materialization);
  }

  /**
   * Clear the default in-memory store. Intended for isolated tests.
   */
  clear(): void {
    this.store.clear();
  }

  private parseCreateInput(input: CreateParcelSetInput) {
    const { orgId, ...rest } = input;
    const parsed = CreateParcelSetRequestSchema.parse(rest);
    return {
      ...parsed,
      orgId: ParcelSetIdSchema.parse(orgId),
    };
  }

  private deriveSelectionMaterialization(
    definition: ParcelSetDefinition,
  ): CreateParcelSetMaterializationInput | null {
    if (definition.origin.kind !== "selection") {
      return null;
    }

    return {
      memberIds: definition.origin.parcelIds,
      provenance: {
        sourceKind: "mixed",
        sourceRoute: null,
        authoritative: false,
        confidence: null,
        resolvedAt: null,
        freshness: "fresh",
      },
    };
  }
}

/**
 * Serialize a parcel-set definition for storage or transport.
 */
export function serializeParcelSetDefinition(definition: ParcelSetDefinition): string {
  return JSON.stringify(ParcelSetDefinitionSchema.parse(definition));
}

/**
 * Deserialize a parcel-set definition from persisted JSON.
 */
export function deserializeParcelSetDefinition(serialized: string): ParcelSetDefinition {
  return ParcelSetDefinitionSchema.parse(JSON.parse(serialized));
}

/**
 * Serialize a parcel-set materialization for storage or transport.
 */
export function serializeParcelSetMaterialization(
  materialization: ParcelSetMaterialization,
): string {
  return JSON.stringify(ParcelSetMaterializationSchema.parse(materialization));
}

/**
 * Deserialize a parcel-set materialization from persisted JSON.
 */
export function deserializeParcelSetMaterialization(
  serialized: string,
): ParcelSetMaterialization {
  return ParcelSetMaterializationSchema.parse(JSON.parse(serialized));
}

/**
 * Reset the process-local in-memory store. Tests should call this between runs.
 */
export function resetParcelSetStore(): void {
  getGlobalStore().clear();
}

function buildLifecycle(
  lifecycle: ParcelSetLifecycleInput | undefined,
  createdAt: string,
): ParcelSetLifecycle {
  if (!lifecycle || lifecycle.kind === "ephemeral") {
    return ParcelSetLifecycleSchema.parse(lifecycle ?? { kind: "ephemeral", scope: "conversation" });
  }

  return ParcelSetLifecycleSchema.parse({
    kind: "persistent",
    persistedId: lifecycle.persistedId ?? randomUUID(),
    createdAt,
    updatedAt: createdAt,
  });
}

function buildProvenance(
  provenance: Partial<ParcelSetProvenance> | undefined,
): ParcelSetProvenance {
  return ParcelSetProvenanceSchema.parse({
    sourceKind: provenance?.sourceKind ?? "database",
    sourceRoute: provenance?.sourceRoute ?? null,
    authoritative: provenance?.authoritative ?? false,
    confidence: provenance?.confidence ?? null,
    resolvedAt: provenance?.resolvedAt ?? null,
    freshness: provenance?.freshness ?? "fresh",
  });
}

function normalizeLabel(label: string | null | undefined): string | null {
  if (label == null) {
    return null;
  }

  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getGlobalStore(): Map<string, StoredParcelSetRecord> {
  const globalScope = globalThis as typeof globalThis & {
    [IN_MEMORY_STORE_KEY]?: Map<string, StoredParcelSetRecord>;
  };
  if (!globalScope[IN_MEMORY_STORE_KEY]) {
    globalScope[IN_MEMORY_STORE_KEY] = new Map<string, StoredParcelSetRecord>();
  }
  return globalScope[IN_MEMORY_STORE_KEY];
}
