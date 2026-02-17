import { z } from "zod";

const DealStakeholderRole = z.enum([
  "SPONSOR",
  "EQUITY_PARTNER",
  "LENDER",
  "BROKER",
  "LAWYER",
  "TITLE_COMPANY",
  "CONTRACTOR",
  "OTHER",
]);

const DealStakeholderCreateSchema = z.object({
  name: z.string().trim().min(1),
  role: DealStakeholderRole,
  company: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  equityOwnership: z.number().min(0).max(100).optional(),
  decisionRights: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().min(1).optional(),
});

const DealStakeholderPatchFieldsSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: DealStakeholderRole.optional(),
  company: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  equityOwnership: z.number().min(0).max(100).optional(),
  decisionRights: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().min(1).optional(),
});

type DealStakeholderPatch = z.infer<typeof DealStakeholderPatchFieldsSchema>;

const hasAtLeastOneValue = (data: DealStakeholderPatch): boolean =>
  Object.values(data).some((value) => value !== undefined);

export const DealStakeholderCreateInputSchema = DealStakeholderCreateSchema;

export const DealStakeholderPatchInputSchema = DealStakeholderPatchFieldsSchema.refine(
  (data) => hasAtLeastOneValue(data),
  { message: "At least one stakeholder field is required" },
);

export const DealStakeholderPatchWithIdInputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .merge(DealStakeholderPatchFieldsSchema)
  .refine((data) => hasAtLeastOneValue(data), {
    message: "At least one stakeholder field is required",
  });

export const DealStakeholderIdSchema = z.object({
  id: z.string().uuid(),
});

export const DealStakeholderRoleSchema = DealStakeholderRole;

export type DealStakeholderCreateInput = z.infer<typeof DealStakeholderCreateInputSchema>;
export type DealStakeholderPatchInput = z.infer<typeof DealStakeholderPatchInputSchema>;
export type DealStakeholderPatchWithIdInput = z.infer<typeof DealStakeholderPatchWithIdInputSchema>;
