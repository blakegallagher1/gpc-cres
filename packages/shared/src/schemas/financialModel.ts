import { z } from "zod";

const requiredIsoDate = z.preprocess((value) => {
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
}, z.date());

const TenantFieldsSchema = z.object({
  name: z.string().trim().min(1),
  contactName: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

const TenantPatchFieldsSchema = z.object({
  name: z.string().trim().min(1).optional(),
  contactName: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

type TenantPatchValues = z.infer<typeof TenantPatchFieldsSchema>;

const hasAtLeastOneTenantPatchValue = (data: TenantPatchValues): boolean =>
  Object.values(data).some((value) => value !== undefined);

export const TenantCreateInputSchema = TenantFieldsSchema;
export const TenantPatchInputSchema = TenantPatchFieldsSchema.refine(
  (data) => hasAtLeastOneTenantPatchValue(data),
  { message: "At least one tenant field is required" },
);

export const TenantPatchWithIdInputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .merge(TenantPatchFieldsSchema)
  .refine((data) => hasAtLeastOneTenantPatchValue(data), {
    message: "At least one tenant field is required",
  });

export const TenantIdSchema = z.object({
  id: z.string().uuid(),
});

const TenantLeaseFieldsSchema = z.object({
  tenantId: z.string().uuid(),
  leaseName: z.string().trim().min(1).optional(),
  startDate: requiredIsoDate,
  endDate: requiredIsoDate,
  rentedAreaSf: z.number().positive(),
  rentPerSf: z.number().nonnegative(),
  annualEscalationPct: z.number().min(0).max(100).default(0),
});

const TenantLeasePatchFieldsSchema = TenantLeaseFieldsSchema.partial();

const TenantLeasePatchWithId = TenantLeasePatchFieldsSchema.extend({
  tenantId: z.string().uuid().optional(),
  id: z.string().uuid(),
});

type TenantLeasePatchValues = z.infer<typeof TenantLeasePatchFieldsSchema>;

const hasAtLeastOneLeasePatchValue = (data: TenantLeasePatchValues): boolean =>
  Object.values(data).some((value) => value !== undefined);

export const TenantLeaseCreateInputSchema = TenantLeaseFieldsSchema.refine(
  (data) => data.endDate >= data.startDate,
  {
    message: "Lease end date must be on or after the start date",
    path: ["endDate"],
  },
);

export const TenantLeasePatchInputSchema = TenantLeasePatchFieldsSchema.refine(
  (data) => hasAtLeastOneLeasePatchValue(data),
  { message: "At least one lease field is required" },
);

export const TenantLeasePatchWithIdInputSchema = TenantLeasePatchWithId.refine(
  (data) => {
    const { id: leaseId, ...patch } = data;
    void leaseId;
    return hasAtLeastOneLeasePatchValue(patch);
  },
  { message: "At least one lease field is required" },
).superRefine((data, ctx) => {
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "Lease end date must be on or after the start date",
    });
  }
});

export const TenantLeaseIdSchema = z.object({
  id: z.string().uuid(),
});

const DevelopmentBudgetLineItemCategory = z.enum(["hard", "soft", "other"]);

export const DevelopmentBudgetLineItemSchema = z.object({
  name: z.string().trim().min(1),
  category: DevelopmentBudgetLineItemCategory,
  amount: z.number().nonnegative(),
});

export const DevelopmentBudgetContingencySchema = z.object({
  hardCostContingencyPct: z.number().min(0).max(100).default(0),
  softCostContingencyPct: z.number().min(0).max(100).default(0),
  otherCostContingencyPct: z.number().min(0).max(100).default(0),
});

export const DevelopmentBudgetSchema = z.object({
  lineItems: z.array(DevelopmentBudgetLineItemSchema).default([]),
  contingencies: DevelopmentBudgetContingencySchema.partial().default({}),
});

export const DevelopmentBudgetPatchWithIdInputSchema = DevelopmentBudgetSchema.partial().superRefine(
  (data, ctx) => {
    const hasLineItems = data.lineItems !== undefined;
    const hasContingencies = data.contingencies !== undefined;
    if (!hasLineItems && !hasContingencies) {
      ctx.addIssue({
        code: "custom",
        message: "At least one development budget field is required",
      });
    }
  },
);

export const DevelopmentBudgetCreateInputSchema = DevelopmentBudgetSchema;

export type TenantCreateInput = z.infer<typeof TenantCreateInputSchema>;
export type TenantPatchInput = z.infer<typeof TenantPatchInputSchema>;
export type TenantPatchWithIdInput = z.infer<typeof TenantPatchWithIdInputSchema>;
export type TenantLeaseCreateInput = z.infer<typeof TenantLeaseCreateInputSchema>;
export type TenantLeasePatchInput = z.infer<typeof TenantLeasePatchInputSchema>;
export type TenantLeasePatchWithIdInput = z.infer<
  typeof TenantLeasePatchWithIdInputSchema
>;
export type DevelopmentBudgetLineItem = z.infer<typeof DevelopmentBudgetLineItemSchema>;
export type DevelopmentBudgetInput = z.infer<typeof DevelopmentBudgetSchema>;
export type DevelopmentBudgetPatchInput = z.infer<typeof DevelopmentBudgetPatchWithIdInputSchema>;
