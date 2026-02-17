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

const EntitlementPathFieldsSchema = z.object({
  recommendedStrategy: z.string().nullable().optional(),
  preAppMeetingDate: nullableIsoDate,
  preAppMeetingNotes: z.string().nullable().optional(),
  applicationType: z.string().nullable().optional(),
  applicationSubmittedDate: nullableIsoDate,
  applicationNumber: z.string().nullable().optional(),
  publicNoticeDate: nullableIsoDate,
  publicNoticePeriodDays: z.number().int().nullable().optional(),
  hearingScheduledDate: nullableIsoDate,
  hearingBody: z.string().nullable().optional(),
  hearingNotes: z.string().nullable().optional(),
  decisionDate: nullableIsoDate,
  decisionType: z.string().nullable().optional(),
  conditions: z.array(z.string()).optional(),
  appealDeadline: nullableIsoDate,
  appealFiled: z.boolean().nullable().optional(),
  conditionComplianceStatus: z.string().nullable().optional(),
});

const hasAtLeastOneValue = (data: z.infer<typeof EntitlementPathFieldsSchema>): boolean =>
  Object.values(data).some((value) => value !== undefined);

export const EntitlementPathPatchInputSchema = EntitlementPathFieldsSchema.refine(
  (data) => hasAtLeastOneValue(data),
  { message: "At least one entitlement-path field is required" },
);

export type EntitlementPathPatchInput = z.infer<typeof EntitlementPathPatchInputSchema>;
