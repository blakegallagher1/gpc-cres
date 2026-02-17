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

const DealTermsFieldsSchema = z.object({
  offerPrice: z.number().nullable().optional(),
  earnestMoney: z.number().nullable().optional(),
  closingDate: nullableIsoDate,
  titleCompany: z.string().nullable().optional(),
  dueDiligenceDays: z.number().int().nullable().optional(),
  financingContingencyDays: z.number().int().nullable().optional(),
  loiSignedAt: nullableIsoDate,
  psaSignedAt: nullableIsoDate,
  titleReviewDue: nullableIsoDate,
  surveyDue: nullableIsoDate,
  environmentalDue: nullableIsoDate,
  sellerContact: z.string().nullable().optional(),
  brokerContact: z.string().nullable().optional(),
});

const hasAtLeastOneValue = (data: z.infer<typeof DealTermsFieldsSchema>): boolean =>
  Object.values(data).some((value) => value !== undefined);

export const DealTermsPatchInputSchema = DealTermsFieldsSchema.refine(
  (data) => hasAtLeastOneValue(data),
  { message: "At least one term field is required" },
);

export type DealTermsPatchInput = z.infer<typeof DealTermsPatchInputSchema>;
