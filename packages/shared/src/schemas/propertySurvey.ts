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

const PropertySurveyFieldsSchema = z.object({
  surveyCompletedDate: nullableIsoDate,
  acreageConfirmed: z.number().nullable().optional(),
  encroachments: z.array(z.string()).optional(),
  setbacks: z.record(z.string(), z.unknown()).optional(),
});

type PropertySurveyFields = z.infer<typeof PropertySurveyFieldsSchema>;

const hasAtLeastOneValue = (data: PropertySurveyFields): boolean =>
  Object.values(data).some((value) => value !== undefined);

export const PropertySurveyPatchInputSchema = PropertySurveyFieldsSchema.refine(
  (data) => hasAtLeastOneValue(data),
  { message: "At least one property survey field is required" },
);

export type PropertySurveyPatchInput = z.infer<typeof PropertySurveyPatchInputSchema>;
