import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@entitlement-os/db";
import {
  DevelopmentBudgetCreateInputSchema,
  TenantCreateInputSchema,
  TenantIdSchema,
  TenantLeaseCreateInputSchema,
  TenantLeaseIdSchema,
  TenantLeasePatchWithIdInputSchema,
  TenantPatchWithIdInputSchema,
  type DevelopmentBudgetInput,
  type TenantCreateInput,
  type TenantLeaseCreateInput,
  type TenantLeasePatchWithIdInput,
  type TenantPatchWithIdInput,
} from "@entitlement-os/shared";
import { ZodError, z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const createEntitySchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("tenant"),
    payload: TenantCreateInputSchema,
  }),
  z.object({
    entity: z.literal("lease"),
    payload: TenantLeaseCreateInputSchema,
  }),
]);

const patchEntitySchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("tenant"),
    payload: TenantPatchWithIdInputSchema,
  }),
  z.object({
    entity: z.literal("lease"),
    payload: TenantLeasePatchWithIdInputSchema,
  }),
]);

const deleteEntitySchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("tenant"),
    payload: TenantIdSchema,
  }),
  z.object({
    entity: z.literal("lease"),
    payload: TenantLeaseIdSchema,
  }),
]);

const updateFinancialModelSchema = z
  .object({
    assumptions: z.record(z.string(), z.unknown()).optional(),
    developmentBudget: DevelopmentBudgetCreateInputSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.assumptions === undefined && data.developmentBudget === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "At least one financial model field is required",
      });
    }
  });

type DecimalLike = { toString: () => string };

type TenantResponseItem = {
  id: string;
  dealId: string;
  orgId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type LeaseResponseItem = {
  id: string;
  dealId: string;
  orgId: string;
  tenantId: string;
  tenantName: string;
  leaseName: string | null;
  startDate: string;
  endDate: string;
  rentedAreaSf: number;
  rentPerSf: number;
  annualEscalationPct: number;
  createdAt: string;
  updatedAt: string;
};

type DevelopmentBudgetResponse = {
  id: string;
  dealId: string;
  orgId: string;
  lineItems: DevelopmentBudgetInput["lineItems"];
  contingencies: DevelopmentBudgetInput["contingencies"];
  createdAt: string;
  updatedAt: string;
};

function toNumber(value: DecimalLike | number): number {
  if (typeof value === "number") {
    return value;
  }
  return Number.parseFloat(value.toString());
}

function serializeTenant(tenant: {
  id: string;
  dealId: string;
  orgId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TenantResponseItem {
  return {
    id: tenant.id,
    dealId: tenant.dealId,
    orgId: tenant.orgId,
    name: tenant.name,
    contactName: tenant.contactName,
    email: tenant.email,
    phone: tenant.phone,
    notes: tenant.notes,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

function serializeLease(lease: {
  id: string;
  dealId: string;
  orgId: string;
  tenantId: string;
  leaseName: string | null;
  startDate: Date;
  endDate: Date;
  rentedAreaSf: DecimalLike | number;
  rentPerSf: DecimalLike | number;
  annualEscalationPct: DecimalLike | number;
  createdAt: Date;
  updatedAt: Date;
  tenant: { name: string };
}): LeaseResponseItem {
  return {
    id: lease.id,
    dealId: lease.dealId,
    orgId: lease.orgId,
    tenantId: lease.tenantId,
    tenantName: lease.tenant.name,
    leaseName: lease.leaseName,
    startDate: lease.startDate.toISOString(),
    endDate: lease.endDate.toISOString(),
    rentedAreaSf: toNumber(lease.rentedAreaSf),
    rentPerSf: toNumber(lease.rentPerSf),
    annualEscalationPct: toNumber(lease.annualEscalationPct),
    createdAt: lease.createdAt.toISOString(),
    updatedAt: lease.updatedAt.toISOString(),
  };
}

function serializeDevelopmentBudget(budget: {
  id: string;
  dealId: string;
  orgId: string;
  lineItems: unknown;
  contingencies: unknown;
  createdAt: Date;
  updatedAt: Date;
}): DevelopmentBudgetResponse {
  const lineItems = DevelopmentBudgetCreateInputSchema.shape.lineItems.parse(budget.lineItems);
  const contingencies = DevelopmentBudgetCreateInputSchema.shape.contingencies.parse(
    budget.contingencies,
  );
  return {
    id: budget.id,
    dealId: budget.dealId,
    orgId: budget.orgId,
    lineItems,
    contingencies,
    createdAt: budget.createdAt.toISOString(),
    updatedAt: budget.updatedAt.toISOString(),
  };
}

async function authorizeDeal(
  dealId: string,
  orgId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, orgId: true },
  });

  if (!deal) {
    return { ok: false, status: 404 };
  }
  if (deal.orgId !== orgId) {
    return { ok: false, status: 403 };
  }
  return { ok: true };
}

// GET /api/deals/[id]/financial-model — load saved assumptions + rent roll + budget
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const authorized = await authorizeDeal(id, auth.orgId);
    if (!authorized.ok) {
      const status = authorized.status;
      return NextResponse.json(
        { error: status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status },
      );
    }

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: {
        id: true,
        name: true,
        sku: true,
        status: true,
        financialModelAssumptions: true,
        parcels: {
          select: { acreage: true },
          orderBy: { createdAt: "asc" },
        },
        tenants: {
          orderBy: { createdAt: "asc" },
        },
        tenantLeases: {
          include: {
            tenant: {
              select: { name: true },
            },
          },
          orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
        },
        developmentBudget: true,
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    return NextResponse.json({
      assumptions: deal.financialModelAssumptions ?? null,
      deal: {
        id: deal.id,
        name: deal.name,
        sku: deal.sku,
        status: deal.status,
        totalAcreage: deal.parcels.reduce(
          (sum, p) => sum + (p.acreage ? parseFloat(p.acreage.toString()) : 0),
          0
        ),
      },
      tenants: deal.tenants.map((tenant) => serializeTenant(tenant)),
      tenantLeases: deal.tenantLeases.map((lease) => serializeLease(lease)),
      developmentBudget: deal.developmentBudget
        ? serializeDevelopmentBudget(deal.developmentBudget)
        : null,
    });
  } catch (error) {
    console.error("[financial-model.GET]", error);
    return NextResponse.json(
      { error: "Failed to load financial model" },
      { status: 500 }
    );
  }
}

// PUT /api/deals/[id]/financial-model — save assumptions
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const authorized = await authorizeDeal(id, auth.orgId);
    if (!authorized.ok) {
      const status = authorized.status;
      return NextResponse.json(
        { error: status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status },
      );
    }

    const body = await request.json();
    const parsed = updateFinancialModelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid financial model payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { assumptions, developmentBudget } = parsed.data;
    if (assumptions !== undefined && Array.isArray(assumptions)) {
      return NextResponse.json(
        { error: "Invalid assumptions payload" },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      if (assumptions !== undefined) {
        await tx.deal.update({
          where: { id },
          data: { financialModelAssumptions: assumptions as Prisma.InputJsonValue },
        });
      }

      if (developmentBudget !== undefined) {
        if (developmentBudget === null) {
          await tx.developmentBudget.deleteMany({
            where: { dealId: id, orgId: auth.orgId },
          });
        } else {
          await tx.developmentBudget.upsert({
            where: { dealId: id },
            update: {
              lineItems: developmentBudget.lineItems,
              contingencies: developmentBudget.contingencies,
            },
            create: {
              dealId: id,
              orgId: auth.orgId,
              lineItems: developmentBudget.lineItems,
              contingencies: developmentBudget.contingencies,
            },
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid financial model payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("[financial-model.PUT]", error);
    return NextResponse.json(
      { error: "Failed to save financial model" },
      { status: 500 }
    );
  }
}

// POST /api/deals/[id]/financial-model — create tenant or lease
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const authorized = await authorizeDeal(id, auth.orgId);
    if (!authorized.ok) {
      const status = authorized.status;
      return NextResponse.json(
        { error: status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status },
      );
    }

    const body = await request.json();
    const parsed = createEntitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid financial model create payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    if (parsed.data.entity === "tenant") {
      const tenantPayload = parsed.data.payload as TenantCreateInput;
      const tenant = await prisma.tenant.create({
        data: {
          dealId: id,
          orgId: auth.orgId,
          name: tenantPayload.name,
          contactName: tenantPayload.contactName ?? null,
          email: tenantPayload.email ?? null,
          phone: tenantPayload.phone ?? null,
          notes: tenantPayload.notes ?? null,
        },
      });

      return NextResponse.json({ tenant: serializeTenant(tenant) });
    }

    const leasePayload = parsed.data.payload as TenantLeaseCreateInput;
    const tenant = await prisma.tenant.findFirst({
      where: {
        id: leasePayload.tenantId,
        dealId: id,
        orgId: auth.orgId,
      },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant not found for this deal" },
        { status: 404 },
      );
    }

    const lease = await prisma.tenantLease.create({
      data: {
        dealId: id,
        orgId: auth.orgId,
        tenantId: leasePayload.tenantId,
        leaseName: leasePayload.leaseName ?? null,
        startDate: leasePayload.startDate,
        endDate: leasePayload.endDate,
        rentedAreaSf: leasePayload.rentedAreaSf,
        rentPerSf: leasePayload.rentPerSf,
        annualEscalationPct: leasePayload.annualEscalationPct,
      },
      include: {
        tenant: { select: { name: true } },
      },
    });

    return NextResponse.json({ tenantLease: serializeLease(lease) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid financial model create payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("[financial-model.POST]", error);
    return NextResponse.json(
      { error: "Failed to create financial model record" },
      { status: 500 },
    );
  }
}

// PATCH /api/deals/[id]/financial-model — update tenant or lease
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const authorized = await authorizeDeal(id, auth.orgId);
    if (!authorized.ok) {
      const status = authorized.status;
      return NextResponse.json(
        { error: status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status },
      );
    }

    const body = await request.json();
    const parsed = patchEntitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid financial model update payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    if (parsed.data.entity === "tenant") {
      const { id: tenantId, ...tenantPatch } = parsed.data.payload as TenantPatchWithIdInput;
      const existing = await prisma.tenant.findFirst({
        where: { id: tenantId, orgId: auth.orgId, dealId: id },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
      }

      const tenant = await prisma.tenant.update({
        where: { id: tenantId },
        data: tenantPatch,
      });

      return NextResponse.json({ tenant: serializeTenant(tenant) });
    }

    const { id: leaseId, ...leasePatch } = parsed.data.payload as TenantLeasePatchWithIdInput;
    const existing = await prisma.tenantLease.findFirst({
      where: { id: leaseId, orgId: auth.orgId, dealId: id },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Lease not found" }, { status: 404 });
    }

    if (leasePatch.tenantId) {
      const tenant = await prisma.tenant.findFirst({
        where: {
          id: leasePatch.tenantId,
          orgId: auth.orgId,
          dealId: id,
        },
        select: { id: true },
      });
      if (!tenant) {
        return NextResponse.json(
          { error: "Tenant not found for this deal" },
          { status: 404 },
        );
      }
    }

    const nextStartDate = leasePatch.startDate ?? existing.startDate;
    const nextEndDate = leasePatch.endDate ?? existing.endDate;
    if (nextEndDate < nextStartDate) {
      return NextResponse.json(
        { error: "Lease end date must be on or after the start date" },
        { status: 400 },
      );
    }

    const lease = await prisma.tenantLease.update({
      where: { id: leaseId },
      data: leasePatch,
      include: {
        tenant: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({ tenantLease: serializeLease(lease) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid financial model update payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("[financial-model.PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update financial model record" },
      { status: 500 },
    );
  }
}

// DELETE /api/deals/[id]/financial-model — delete tenant or lease
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const authorized = await authorizeDeal(id, auth.orgId);
    if (!authorized.ok) {
      const status = authorized.status;
      return NextResponse.json(
        { error: status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status },
      );
    }

    const body = await request.json();
    const parsed = deleteEntitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid financial model delete payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    if (parsed.data.entity === "tenant") {
      const tenantId = parsed.data.payload.id;
      const existing = await prisma.tenant.findFirst({
        where: { id: tenantId, dealId: id, orgId: auth.orgId },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
      }

      const tenant = await prisma.tenant.delete({
        where: { id: tenantId },
      });
      return NextResponse.json({ tenant: serializeTenant(tenant) });
    }

    const leaseId = parsed.data.payload.id;
    const existing = await prisma.tenantLease.findFirst({
      where: { id: leaseId, dealId: id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Lease not found" }, { status: 404 });
    }

    const lease = await prisma.tenantLease.delete({
      where: { id: leaseId },
      include: {
        tenant: {
          select: { name: true },
        },
      },
    });
    return NextResponse.json({ tenantLease: serializeLease(lease) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid financial model delete payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("[financial-model.DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete financial model record" },
      { status: 500 },
    );
  }
}
