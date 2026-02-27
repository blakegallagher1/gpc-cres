import { z } from "zod";

const sourceTypeEnum = z.enum([
  "agent",
  "user",
  "system",
  "external_api",
  "document",
  "cron",
]);

const factTypeEnum = z.enum([
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
]);

const statusEnum = z.enum([
  "attempted",
  "accepted",
  "rejected",
  "conflicted",
]);

export const memoryEventSchema = z
  .object({
    entityId: z.string().uuid().nullable().default(null),
    address: z.string().nullable().default(null),
    parcelId: z.string().nullable().default(null),
    entityType: z.string().nullable().default("property"),
    sourceType: sourceTypeEnum,
    factType: factTypeEnum,
    payloadJson: z.record(z.string(), z.unknown()),
    status: statusEnum,
    dealId: z.string().uuid().nullable().default(null),
    threadId: z.string().nullable().default(null),
    userId: z.string().uuid().nullable().default(null),
    modelTraceId: z.string().nullable().default(null),
    toolName: z.string().nullable().default(null),
    latencyMs: z.number().int().nullable().default(null),
    tokenUsage: z.number().int().nullable().default(null),
    costUsd: z.number().nullable().default(null),
  })
  .refine((data) => data.entityId != null || data.address != null, {
    message: "Either entityId or address must be provided",
    path: ["entityId"],
  });

export type MemoryEventInput = z.infer<typeof memoryEventSchema>;

export { sourceTypeEnum, factTypeEnum, statusEnum };
