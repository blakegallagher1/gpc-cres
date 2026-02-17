import { z } from "zod";

const DealRiskFieldsSchema = z.object({
  category: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "monitoring", "mitigating", "accepted", "closed"]).optional(),
  owner: z.string().trim().optional(),
  source: z.string().trim().optional(),
  score: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().min(1).optional(),
});

type DealRiskFields = z.infer<typeof DealRiskFieldsSchema>;

const hasAtLeastOneValue = (data: DealRiskFields): boolean =>
  Object.values(data).some((value) => value !== undefined);

export const DealRiskPatchInputSchema = DealRiskFieldsSchema.refine(
  (data) => hasAtLeastOneValue(data),
  { message: "At least one risk field is required" },
);

export const DealRiskPatchWithIdInputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .merge(DealRiskFieldsSchema)
  .refine((data) => hasAtLeastOneValue(data), {
    message: "At least one risk field is required",
  });

export const DealRiskIdSchema = z.object({
  id: z.string().uuid(),
});

export type DealRiskPatchInput = z.infer<typeof DealRiskPatchInputSchema>;
export type DealRiskPatchWithIdInput = z.infer<typeof DealRiskPatchWithIdInputSchema>;
