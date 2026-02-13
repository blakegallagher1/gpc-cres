import { z } from "zod";

export const DealOutcomeFieldsSchema = z.object({
  actualPurchasePrice: z.number().nullable().optional(),
  actualNoiYear1: z.number().nullable().optional(),
  actualExitPrice: z.number().nullable().optional(),
  actualIrr: z.number().nullable().optional(),
  actualEquityMultiple: z.number().nullable().optional(),
  actualHoldPeriodMonths: z.number().int().nullable().optional(),
  exitDate: z.string().nullable().optional(),
  exitType: z.string().nullable().optional(),
  killReason: z.string().nullable().optional(),
  killWasCorrect: z.boolean().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const hasOutcomeUpdates = (data: z.infer<typeof DealOutcomeFieldsSchema>) =>
  Object.values(data).some((value) => value !== undefined);

export const DealOutcomeCreateInputSchema = DealOutcomeFieldsSchema.extend({
  dealId: z.string().uuid(),
}).refine(({ dealId: _dealId, ...rest }) => hasOutcomeUpdates(rest), {
  message: "At least one outcome field is required",
});

export const DealOutcomePatchInputSchema = DealOutcomeFieldsSchema.refine(
  (data) => hasOutcomeUpdates(data),
  { message: "At least one outcome field is required" },
);

export const DealOutcomeSchema = z.object({
  id: z.string().uuid(),
  dealId: z.string().uuid(),
  dealName: z.string().min(1),
  actualPurchasePrice: z.number().nullable(),
  actualNoiYear1: z.number().nullable(),
  actualExitPrice: z.number().nullable(),
  actualIrr: z.number().nullable(),
  actualEquityMultiple: z.number().nullable(),
  actualHoldPeriodMonths: z.number().int().nullable(),
  exitDate: z.string().nullable(),
  exitType: z.string().nullable(),
  killReason: z.string().nullable(),
  killWasCorrect: z.boolean().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const DealOutcomeResponseSchema = z.object({
  outcome: DealOutcomeSchema,
});

export type DealOutcomeFields = z.infer<typeof DealOutcomeFieldsSchema>;
export type DealOutcomeCreateInput = z.infer<typeof DealOutcomeCreateInputSchema>;
export type DealOutcomePatchInput = z.infer<typeof DealOutcomePatchInputSchema>;
export type DealOutcome = z.infer<typeof DealOutcomeSchema>;
