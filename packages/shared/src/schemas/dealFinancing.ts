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

const DealFinancingFieldsSchema = z.object({
  lenderName: z.string().nullable().optional(),
  facilityName: z.string().nullable().optional(),
  loanType: z.string().nullable().optional(),
  loanAmount: z.number().nullable().optional(),
  commitmentDate: nullableIsoDate,
  fundedDate: nullableIsoDate,
  interestRate: z.number().nullable().optional(),
  loanTermMonths: z.number().int().nullable().optional(),
  amortizationYears: z.number().int().nullable().optional(),
  ltvPercent: z.number().nullable().optional(),
  dscrRequirement: z.number().nullable().optional(),
  originationFeePercent: z.number().nullable().optional(),
  sourceUploadId: z.string().uuid().nullable().optional(),
  status: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type DealFinancingFields = z.infer<typeof DealFinancingFieldsSchema>;

const hasAtLeastOneValue = (data: DealFinancingFields): boolean =>
  Object.values(data).some((value) => value !== undefined);

export const DealFinancingPatchInputSchema = DealFinancingFieldsSchema.refine(
  (data) => hasAtLeastOneValue(data),
  { message: "At least one financing field is required" },
);

export const DealFinancingPatchWithIdInputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .merge(DealFinancingFieldsSchema)
  .refine(
    (data) => hasAtLeastOneValue(data),
    { message: "At least one financing field is required" },
  );

export const DealFinancingIdSchema = z.object({
  id: z.string().uuid(),
});

export type DealFinancingPatchInput = z.infer<typeof DealFinancingPatchInputSchema>;
export type DealFinancingPatchWithIdInput = z.infer<typeof DealFinancingPatchWithIdInputSchema>;
