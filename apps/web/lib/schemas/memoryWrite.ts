import "server-only";
import { z } from "zod";
import { zodToOpenAiJsonSchema } from "@entitlement-os/shared";

const CompPayloadSchema = z.object({
  sale_price: z.number().nullable(),
  price_per_unit: z.number().nullable(),
  cap_rate: z.number().nullable(),
  noi: z.number().nullable(),
  pad_count: z.number().nullable(),
  property_type: z.string(),
  market: z.string(),
  sale_date: z.string().nullable(),
  source_url: z.string().nullable(),
});

const LenderTermPayloadSchema = z.object({
  lender_name: z.string(),
  min_dscr: z.number().nullable(),
  max_ltv: z.number().nullable(),
  rate_type: z.string(),
  rate_bps: z.number().nullable(),
  term_months: z.number().nullable(),
  amortization_months: z.number().nullable(),
  prepayment_penalty: z.string().nullable(),
  recourse: z.string().nullable(),
});

const TourObservationPayloadSchema = z.object({
  observation_date: z.string(),
  condition_rating: z.number().nullable(),
  notes: z.string(),
  infrastructure_issues: z.array(z.string()),
  occupancy_estimate: z.number().nullable(),
  photo_urls: z.array(z.string()).nullable(),
});

const ProjectionPayloadSchema = z.object({
  metric_key: z.string(),
  projected_value: z.number(),
  projection_date: z.string(),
  assumptions_json: z.string(),
  model_version: z.string().nullable(),
});

const CorrectionPayloadSchema = z.object({
  corrected_attribute_key: z.string(),
  corrected_value: z.union([z.number(), z.string()]),

  correction_reason: z.string(),
  corrected_event_id: z.string().nullable(),
});

export const MemoryWriteSchema = z.object({
  fact_type: z.enum(["comp", "lender_term", "tour_observation", "projection", "correction"]),
  entity_id: z.string(),
  source_type: z.enum(["user", "agent", "external", "correction"]),
  timestamp: z.string(),
  economic_weight: z.number().min(0).max(1),
  volatility_class: z.enum(["stable", "cyclical", "high_volatility"]),
  payload: z.union([
    CompPayloadSchema,
    LenderTermPayloadSchema,
    TourObservationPayloadSchema,
    ProjectionPayloadSchema,
    CorrectionPayloadSchema,
  ]),
});

export type MemoryWrite = z.infer<typeof MemoryWriteSchema>;
export type CompPayload = z.infer<typeof CompPayloadSchema>;
export type LenderTermPayload = z.infer<typeof LenderTermPayloadSchema>;
export type TourObservationPayload = z.infer<typeof TourObservationPayloadSchema>;
export type ProjectionPayload = z.infer<typeof ProjectionPayloadSchema>;
export type CorrectionPayload = z.infer<typeof CorrectionPayloadSchema>;

export const memoryWriteJsonSchema = zodToOpenAiJsonSchema("MemoryWrite", MemoryWriteSchema);
