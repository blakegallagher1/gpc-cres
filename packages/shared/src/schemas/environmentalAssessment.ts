import { z } from "zod";

const nullableIsoDate = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}, z.date().nullable().optional());

const EnvironmentalAssessmentFieldsSchema = z.object({
  reportType: z.string().nullable().optional(),
  reportDate: nullableIsoDate,
  consultantName: z.string().nullable().optional(),
  reportTitle: z.string().nullable().optional(),
  recs: z.array(z.string()).optional(),
  deMinimisConditions: z.array(z.string()).optional(),
  phaseIiRecommended: z.boolean().nullable().optional(),
  phaseIiScope: z.string().nullable().optional(),
  estimatedRemediationCost: z.number().nullable().optional(),
  sourceUploadId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type EnvironmentalAssessmentFields = z.infer<typeof EnvironmentalAssessmentFieldsSchema>;

const hasAtLeastOneValue = (data: EnvironmentalAssessmentFields): boolean =>
  Object.values(data).some((value) => value !== undefined);

export const EnvironmentalAssessmentPatchInputSchema = EnvironmentalAssessmentFieldsSchema.refine(
  (data) => hasAtLeastOneValue(data),
  { message: "At least one environmental-assessment field is required" },
);

export const EnvironmentalAssessmentPatchWithIdInputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .merge(EnvironmentalAssessmentFieldsSchema)
  .refine(
    (data) => hasAtLeastOneValue(data),
    { message: "At least one environmental-assessment field is required" },
  );

export const EnvironmentalAssessmentIdSchema = z.object({
  id: z.string().uuid(),
});

export type EnvironmentalAssessmentPatchInput = z.infer<typeof EnvironmentalAssessmentPatchInputSchema>;
export type EnvironmentalAssessmentPatchWithIdInput = z.infer<typeof EnvironmentalAssessmentPatchWithIdInputSchema>;
