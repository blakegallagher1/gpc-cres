import { z } from "zod";

export const MAX_NAME_LENGTH = 200;
export const MAX_SUMMARY_LENGTH = 4_000;
export const MAX_NOTES_LENGTH = 20_000;
export const MAX_ITEMS = 500;
export const MAX_AI_OUTPUTS = 100;
export const MAX_OVERLAYS = 64;
export const FEET_PER_MILE = 5_280;
export const EARTH_RADIUS_MILES = 3_958.8;
export const ADJACENT_DISTANCE_FEET = 150;
export const NEARBY_DISTANCE_FEET = 600;
export const DAY_MS = 86_400_000;

export const ContractAvailabilitySchema = z.enum(["available", "fallback", "unavailable"]);
export const WorkspaceStatusSchema = z.enum(["active", "archived"]);
export const ParcelTrackedStatusSchema = z.enum([
  "to_analyze",
  "active",
  "blocked",
  "complete",
]);
export const OutreachChannelSchema = z.enum(["call", "email", "text", "meeting", "broker"]);
export const OutreachStatusSchema = z.enum([
  "planned",
  "attempted",
  "completed",
  "no_response",
  "blocked",
]);
export const MarketOverlayKeySchema = z.enum([
  "permits",
  "deliveries",
  "absorption",
  "rent_comps",
  "sale_comps",
  "household_growth",
  "income_growth",
  "traffic_counts",
  "utilities",
  "flood_history",
  "topography",
  "road_frontage",
]);

export const JsonRecordSchema = z.record(z.string(), z.unknown()).default({});
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const CoordinateSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
export const PolygonCoordinatesSchema = z.array(z.array(CoordinateSchema).min(4)).min(1);

export const ParcelSnapshotInputSchema = z.object({
  parcelId: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(1_000),
  ownerName: z.string().trim().min(1).max(1_000).nullable().optional(),
  mailingAddress: z.string().trim().min(1).max(1_000).nullable().optional(),
  acreage: z.number().finite().nullable().optional(),
  zoningCode: z.string().trim().min(1).max(200).nullable().optional(),
  floodZone: z.string().trim().min(1).max(200).nullable().optional(),
  lat: z.number().finite().min(-90).max(90).nullable().optional(),
  lng: z.number().finite().min(-180).max(180).nullable().optional(),
  metadata: JsonRecordSchema.optional(),
});

export const TrackedParcelInputSchema = z.object({
  parcelId: z.string().trim().min(1).max(200),
  status: ParcelTrackedStatusSchema.default("to_analyze"),
  task: z.string().trim().min(1).max(2_000).nullable().optional(),
  note: z.string().trim().min(1).max(8_000).nullable().optional(),
  updatedAt: IsoDateTimeSchema.optional(),
});

export const CompSnapshotInputSchema = z.object({
  id: z.string().uuid().optional(),
  address: z.string().trim().min(1).max(1_000),
  landUse: z.string().trim().min(1).max(200).nullable().optional(),
  saleDate: z.string().date().nullable().optional(),
  salePrice: z.number().finite().nullable().optional(),
  acreage: z.number().finite().nullable().optional(),
  pricePerAcre: z.number().finite().nullable().optional(),
  distanceMiles: z.number().finite().nullable().optional(),
  adjustmentNotes: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  adjustedPricePerAcre: z.number().finite().nullable().optional(),
  weightedScore: z.number().finite().nullable().optional(),
});

export const AiOutputInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  createdAt: IsoDateTimeSchema.optional(),
  summary: z.string().trim().min(1).max(6_000),
  payload: JsonRecordSchema,
});

export const OverlaySelectionInputSchema = z.object({
  key: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  status: ContractAvailabilitySchema.default("fallback"),
});

export const MarketOverlayStateInputSchema = z.object({
  key: MarketOverlayKeySchema,
  status: ContractAvailabilitySchema,
  source: z.string().trim().min(1).max(200).nullable().optional(),
  summary: z.string().trim().min(1).max(2_000),
  details: JsonRecordSchema.optional(),
});

export const WorkspaceWriteSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
  dealId: z.string().uuid().nullable().optional(),
  summary: z.string().trim().min(1).max(MAX_SUMMARY_LENGTH).nullable().optional(),
  notes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).nullable().optional(),
  status: WorkspaceStatusSchema.optional(),
  selectedParcelIds: z
    .array(z.string().trim().min(1).max(200))
    .max(MAX_ITEMS)
    .transform((ids) => Array.from(new Set(ids)))
    .optional(),
  polygonCoordinates: PolygonCoordinatesSchema.nullable().optional(),
  parcels: z.array(ParcelSnapshotInputSchema).max(MAX_ITEMS).optional(),
  trackedParcels: z.array(TrackedParcelInputSchema).max(MAX_ITEMS).optional(),
  compSnapshots: z.array(CompSnapshotInputSchema).max(MAX_ITEMS).optional(),
  aiOutputs: z.array(AiOutputInputSchema).max(MAX_AI_OUTPUTS).optional(),
  overlays: z.array(OverlaySelectionInputSchema).max(MAX_OVERLAYS).optional(),
  parcelSetDefinition: JsonRecordSchema.optional(),
  parcelSetMaterialization: JsonRecordSchema.optional(),
  marketState: z.array(MarketOverlayStateInputSchema).max(MAX_OVERLAYS).optional(),
});

export const WorkspaceContextSchema = z.object({
  parcelIds: z.array(z.string().trim().min(1).max(200)).max(MAX_ITEMS).default([]),
  polygon: PolygonCoordinatesSchema.nullable().default(null),
});

export const CreateMapWorkspaceRequestSchema = WorkspaceWriteSchema.extend({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
});

export const UpdateMapWorkspaceRequestSchema = WorkspaceWriteSchema.refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one field must be provided" },
);

export const UpsertMapWorkspaceContactsRequestSchema = z.object({
  contacts: z.array(
    z.object({
      id: z.string().uuid().optional(),
      parcelId: z.string().trim().min(1).max(200).nullable().optional(),
      ownerName: z.string().trim().min(1).max(1_000),
      entityName: z.string().trim().min(1).max(1_000).nullable().optional(),
      mailingAddress: z.string().trim().min(1).max(1_000).nullable().optional(),
      mailingCity: z.string().trim().min(1).max(200).nullable().optional(),
      mailingState: z.string().trim().min(1).max(100).nullable().optional(),
      mailingZip: z.string().trim().min(1).max(50).nullable().optional(),
      portfolioContext: JsonRecordSchema.optional(),
      skipTraceState: JsonRecordSchema.optional(),
      brokerNotes: z.string().trim().min(1).max(8_000).nullable().optional(),
    }),
  ),
});

export const CreateMapWorkspaceOutreachLogRequestSchema = z.object({
  contactId: z.string().uuid().nullable().optional(),
  channel: OutreachChannelSchema,
  direction: z.string().trim().min(1).max(100).nullable().optional(),
  status: OutreachStatusSchema,
  happenedAt: IsoDateTimeSchema.optional(),
  nextContactAt: IsoDateTimeSchema.nullable().optional(),
  brokerName: z.string().trim().min(1).max(200).nullable().optional(),
  brokerCompany: z.string().trim().min(1).max(200).nullable().optional(),
  summary: z.string().trim().min(1).max(2_000).nullable().optional(),
  notes: z.string().trim().min(1).max(8_000).nullable().optional(),
});

export const MapWorkspaceCompQuerySchema = z.object({
  landUse: z.string().trim().min(1).max(200).nullable().optional(),
  maxAgeMonths: z.coerce.number().int().positive().max(240).nullable().optional(),
});

export const MapWorkspaceContextSchema = WorkspaceContextSchema;

export const MapWorkspaceUpsertSchema = z.object({
  workspaceId: z.string().uuid().nullable().optional(),
  polygon: PolygonCoordinatesSchema.nullable().optional(),
  selectedParcelIds: z
    .array(z.string().trim().min(1).max(200))
    .max(MAX_ITEMS)
    .transform((ids) => Array.from(new Set(ids))),
  trackedParcels: z.array(
    z.object({
      parcelId: z.string().trim().min(1).max(200),
      address: z.string().trim().min(1).max(1_000),
      lat: z.number().finite(),
      lng: z.number().finite(),
      currentZoning: z.string().trim().min(1).max(200).nullable().optional(),
      acreage: z.number().finite().nullable().optional(),
      floodZone: z.string().trim().min(1).max(200).nullable().optional(),
      note: z.string(),
      task: z.string(),
      status: ParcelTrackedStatusSchema,
      createdAt: IsoDateTimeSchema,
      updatedAt: IsoDateTimeSchema,
    }),
  ),
  workspaceParcels: z.array(
    z.object({
      parcelId: z.string().trim().min(1).max(200),
      address: z.string().trim().min(1).max(1_000),
      owner: z.string().trim().min(1).max(1_000).nullable().optional(),
      acreage: z.number().finite().nullable().optional(),
      lat: z.number().finite(),
      lng: z.number().finite(),
      currentZoning: z.string().trim().min(1).max(200).nullable().optional(),
      floodZone: z.string().trim().min(1).max(200).nullable().optional(),
    }),
  ),
  aiOutputs: z.array(AiOutputInputSchema).max(MAX_AI_OUTPUTS).default([]),
  overlayState: z.record(z.string(), z.boolean()).default({}),
});

export type WorkspaceWriteInput = z.infer<typeof WorkspaceWriteSchema>;
export type CompQuery = z.infer<typeof MapWorkspaceCompQuerySchema>;
export type MapWorkspaceContext = z.infer<typeof MapWorkspaceContextSchema>;
