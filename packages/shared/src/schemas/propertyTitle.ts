import { z } from "zod";

const PropertyTitleFieldsSchema = z.object({
  titleInsuranceReceived: z.boolean().nullable().optional(),
  exceptions: z.array(z.string()).optional(),
  liens: z.array(z.string()).optional(),
  easements: z.array(z.string()).optional(),
});

type PropertyTitleFields = z.infer<typeof PropertyTitleFieldsSchema>;

const hasAtLeastOneValue = (data: PropertyTitleFields): boolean =>
  Object.values(data).some((value) => value !== undefined);

export const PropertyTitlePatchInputSchema = PropertyTitleFieldsSchema.refine(
  (data) => hasAtLeastOneValue(data),
  { message: "At least one property title field is required" },
);

export type PropertyTitlePatchInput = z.infer<typeof PropertyTitlePatchInputSchema>;
