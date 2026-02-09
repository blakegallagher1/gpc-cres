import { z } from "zod";

// NOTE: Do NOT use .url(), .email(), .uuid(), .datetime() — OpenAI structured
// outputs rejects the `format` constraint they add to JSON schema.

export const ParcelTriageSchemaVersion = z.literal("1.0");

export const ParcelTriageSchema = z.object({
  schema_version: ParcelTriageSchemaVersion,
  generated_at: z.string(),
  deal_id: z.string(),
  decision: z.enum(["KILL", "HOLD", "ADVANCE"]),
  recommended_path: z.enum(["CUP", "REZONING", "VARIANCE", "UNKNOWN"]),
  rationale: z.string().min(1),
  risk_scores: z.object({
    access: z.number().min(0).max(10),
    drainage: z.number().min(0).max(10),
    adjacency: z.number().min(0).max(10),
    env: z.number().min(0).max(10),
    utilities: z.number().min(0).max(10),
    politics: z.number().min(0).max(10),
  }),
  disqualifiers: z.array(
    z.object({
      label: z.string().min(1),
      detail: z.string().min(1),
      severity: z.enum(["hard", "soft"]),
      sources: z.array(z.string()).nullable(),
    }),
  ),
  next_actions: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      pipeline_step: z.number().int().min(1).max(8),
      due_in_days: z.number().int().min(0).max(365),
    }),
  ),
  assumptions: z.array(
    z.object({
      assumption: z.string().min(1),
      impact: z.string().min(1),
      sources: z.array(z.string()).nullable(),
    }),
  ),
  sources_summary: z.array(z.string()),
});

export type ParcelTriage = z.infer<typeof ParcelTriageSchema>;

