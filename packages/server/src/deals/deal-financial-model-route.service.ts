import { prisma, type Prisma } from "@entitlement-os/db";
import {
  DevelopmentBudgetCreateInputSchema,
  type CapitalSourceCreateInput,
  type CapitalSourcePatchWithIdInput,
  type DevelopmentBudgetInput,
  type EquityWaterfallTierCreateInput,
  type EquityWaterfallTierPatchWithIdInput,
  type TenantCreateInput,
  type TenantLeaseCreateInput,
  type TenantLeasePatchWithIdInput,
  type TenantPatchWithIdInput,
} from "@entitlement-os/shared";

export class DealFinancialModelRouteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type DecimalLike = { toString(): string };

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

type CapitalSourceResponseItem = {
  id: string;
  dealId: string;
  orgId: string;
  name: string;
  sourceKind: string;
  amount: number;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type EquityWaterfallResponseItem = {
  id: string;
  dealId: string;
  orgId: string;
  tierName: string;
  hurdleIrrPct: number;
  lpDistributionPct: number;
  gpDistributionPct: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type CreateEntityPayload =
  | { entity: "tenant"; payload: TenantCreateInput }
  | { entity: "lease"; payload: TenantLeaseCreateInput }
  | { entity: "capitalSource"; payload: CapitalSourceCreateInput }
  | { entity: "equityWaterfall"; payload: EquityWaterfallTierCreateInput };

type PatchEntityPayload =
  | { entity: "tenant"; payload: TenantPatchWithIdInput }
  | { entity: "lease"; payload: TenantLeasePatchWithIdInput }
  | { entity: "capitalSource"; payload: CapitalSourcePatchWithIdInput }
  | { entity: "equityWaterfall"; payload: EquityWaterfallTierPatchWithIdInput };

type DeleteEntityPayload =
  | { entity: "tenant"; payload: { id: string } }
  | { entity: "lease"; payload: { id: string } }
  | { entity: "capitalSource"; payload: { id: string } }
  | { entity: "equityWaterfall"; payload: { id: string } };

type SaveFinancialModelPayload = {
  assumptions?: Record<string, unknown>;
  developmentBudget?: {
    lineItems: DevelopmentBudgetInput["lineItems"];
    contingencies: DevelopmentBudgetInput["contingencies"];
  } | null;
  capitalSources?: CapitalSourceCreateInput[] | null;
  equityWaterfalls?: EquityWaterfallTierCreateInput[] | null;
};

function toNumber(value: DecimalLike | number): number {
  return typeof value === "number" ? value : Number.parseFloat(value.toString());
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
  return {
    id: budget.id,
    dealId: budget.dealId,
    orgId: budget.orgId,
    lineItems: DevelopmentBudgetCreateInputSchema.shape.lineItems.parse(budget.lineItems),
    contingencies: DevelopmentBudgetCreateInputSchema.shape.contingencies.parse(
      budget.contingencies,
    ),
    createdAt: budget.createdAt.toISOString(),
    updatedAt: budget.updatedAt.toISOString(),
  };
}

function serializeCapitalSource(source: {
  id: string;
  dealId: string;
  orgId: string;
  name: string;
  sourceKind: string;
  amount: DecimalLike | number;
  notes: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): CapitalSourceResponseItem {
  return {
    id: source.id,
    dealId: source.dealId,
    orgId: source.orgId,
    name: source.name,
    sourceKind: source.sourceKind,
    amount: toNumber(source.amount),
    notes: source.notes,
    sortOrder: source.sortOrder,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function serializeEquityWaterfallTier(tier: {
  id: string;
  dealId: string;
  orgId: string;
  tierName: string;
  hurdleIrrPct: DecimalLike | number;
  lpDistributionPct: DecimalLike | number;
  gpDistributionPct: DecimalLike | number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): EquityWaterfallResponseItem {
  return {
    id: tier.id,
    dealId: tier.dealId,
    orgId: tier.orgId,
    tierName: tier.tierName,
    hurdleIrrPct: toNumber(tier.hurdleIrrPct),
    lpDistributionPct: toNumber(tier.lpDistributionPct),
    gpDistributionPct: toNumber(tier.gpDistributionPct),
    sortOrder: tier.sortOrder,
    createdAt: tier.createdAt.toISOString(),
    updatedAt: tier.updatedAt.toISOString(),
  };
}

async function assertDealAccess(
  dealId: string,
  orgId: string,
): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, orgId: true },
  });

  if (!deal) {
    throw new DealFinancialModelRouteError(404, "Deal not found");
  }
  if (deal.orgId !== orgId) {
    throw new DealFinancialModelRouteError(
      403,
      "Forbidden: deal does not belong to your org",
    );
  }
}

export async function getDealFinancialModel(
  dealId: string,
  orgId: string,
): Promise<Record<string, unknown>> {
  await assertDealAccess(dealId, orgId);

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: {
      id: true,
      name: true,
      sku: true,
      status: true,
      financialModelAssumptions: true,
      terms: { select: { closingDate: true } },
      parcels: {
        select: { acreage: true },
        orderBy: { createdAt: "asc" },
      },
      tenants: { orderBy: { createdAt: "asc" } },
      tenantLeases: {
        include: { tenant: { select: { name: true } } },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      },
      developmentBudget: true,
      capitalSources: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      equityWaterfalls: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!deal) {
    throw new DealFinancialModelRouteError(404, "Deal not found");
  }

  return {
    assumptions: deal.financialModelAssumptions ?? null,
    deal: {
      id: deal.id,
      name: deal.name,
      sku: deal.sku,
      status: deal.status,
      closingDate: deal.terms?.closingDate
        ? deal.terms.closingDate.toISOString()
        : null,
      totalAcreage: deal.parcels.reduce(
        (sum, parcel) =>
          sum + (parcel.acreage ? Number.parseFloat(parcel.acreage.toString()) : 0),
        0,
      ),
    },
    tenants: deal.tenants.map((tenant) => serializeTenant(tenant)),
    tenantLeases: deal.tenantLeases.map((lease) => serializeLease(lease)),
    developmentBudget: deal.developmentBudget
      ? serializeDevelopmentBudget(deal.developmentBudget)
      : null,
    capitalSources: deal.capitalSources.map((source) => serializeCapitalSource(source)),
    equityWaterfalls: deal.equityWaterfalls.map((tier) =>
      serializeEquityWaterfallTier(tier),
    ),
  };
}

export async function saveDealFinancialModel(
  dealId: string,
  orgId: string,
  payload: SaveFinancialModelPayload,
): Promise<{ success: true }> {
  await assertDealAccess(dealId, orgId);

  const { assumptions, developmentBudget, capitalSources, equityWaterfalls } = payload;
  if (assumptions !== undefined && Array.isArray(assumptions)) {
    throw new DealFinancialModelRouteError(400, "Invalid assumptions payload");
  }

  await prisma.$transaction(async (tx) => {
    if (assumptions !== undefined) {
      await tx.deal.update({
        where: { id: dealId },
        data: { financialModelAssumptions: assumptions as Prisma.InputJsonValue },
      });
    }

    if (developmentBudget !== undefined) {
      if (developmentBudget === null) {
        await tx.developmentBudget.deleteMany({
          where: { dealId, orgId },
        });
      } else {
        await tx.developmentBudget.upsert({
          where: { dealId },
          update: {
            lineItems: developmentBudget.lineItems,
            contingencies: developmentBudget.contingencies,
          },
          create: {
            dealId,
            orgId,
            lineItems: developmentBudget.lineItems,
            contingencies: developmentBudget.contingencies,
          },
        });
      }
    }

    if (capitalSources !== undefined) {
      await tx.capitalSource.deleteMany({ where: { dealId, orgId } });
      if (capitalSources !== null && capitalSources.length > 0) {
        await tx.capitalSource.createMany({
          data: capitalSources.map((source, index) => ({
            dealId,
            orgId,
            name: source.name,
            sourceKind: source.sourceKind,
            amount: source.amount,
            notes: source.notes ?? null,
            sortOrder: source.sortOrder ?? index,
          })),
        });
      }
    }

    if (equityWaterfalls !== undefined) {
      await tx.equityWaterfall.deleteMany({ where: { dealId, orgId } });
      if (equityWaterfalls !== null && equityWaterfalls.length > 0) {
        await tx.equityWaterfall.createMany({
          data: equityWaterfalls.map((tier, index) => ({
            dealId,
            orgId,
            tierName: tier.tierName,
            hurdleIrrPct: tier.hurdleIrrPct,
            lpDistributionPct: tier.lpDistributionPct,
            gpDistributionPct: tier.gpDistributionPct,
            sortOrder: tier.sortOrder ?? index,
          })),
        });
      }
    }
  });

  return { success: true };
}

export async function createDealFinancialModelEntity(
  dealId: string,
  orgId: string,
  payload: CreateEntityPayload,
): Promise<Record<string, unknown>> {
  await assertDealAccess(dealId, orgId);

  if (payload.entity === "tenant") {
    const tenant = await prisma.tenant.create({
      data: {
        dealId,
        orgId,
        name: payload.payload.name,
        contactName: payload.payload.contactName ?? null,
        email: payload.payload.email ?? null,
        phone: payload.payload.phone ?? null,
        notes: payload.payload.notes ?? null,
      },
    });
    return { tenant: serializeTenant(tenant) };
  }

  if (payload.entity === "capitalSource") {
    const source = await prisma.capitalSource.create({
      data: {
        dealId,
        orgId,
        name: payload.payload.name,
        sourceKind: payload.payload.sourceKind,
        amount: payload.payload.amount,
        notes: payload.payload.notes ?? null,
        sortOrder: payload.payload.sortOrder ?? 0,
      },
    });
    return { capitalSource: serializeCapitalSource(source) };
  }

  if (payload.entity === "equityWaterfall") {
    const total =
      payload.payload.lpDistributionPct + payload.payload.gpDistributionPct;
    if (Math.abs(total - 100) > 0.0001) {
      throw new DealFinancialModelRouteError(
        400,
        "LP and GP distribution must total 100%",
      );
    }

    const tier = await prisma.equityWaterfall.create({
      data: {
        dealId,
        orgId,
        tierName: payload.payload.tierName,
        hurdleIrrPct: payload.payload.hurdleIrrPct,
        lpDistributionPct: payload.payload.lpDistributionPct,
        gpDistributionPct: payload.payload.gpDistributionPct,
        sortOrder: payload.payload.sortOrder ?? 0,
      },
    });
    return { equityWaterfall: serializeEquityWaterfallTier(tier) };
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: payload.payload.tenantId, dealId, orgId },
    select: { id: true },
  });
  if (!tenant) {
    throw new DealFinancialModelRouteError(404, "Tenant not found for this deal");
  }

  const lease = await prisma.tenantLease.create({
    data: {
      dealId,
      orgId,
      tenantId: payload.payload.tenantId,
      leaseName: payload.payload.leaseName ?? null,
      startDate: payload.payload.startDate,
      endDate: payload.payload.endDate,
      rentedAreaSf: payload.payload.rentedAreaSf,
      rentPerSf: payload.payload.rentPerSf,
      annualEscalationPct: payload.payload.annualEscalationPct,
    },
    include: { tenant: { select: { name: true } } },
  });
  return { tenantLease: serializeLease(lease) };
}

export async function updateDealFinancialModelEntity(
  dealId: string,
  orgId: string,
  payload: PatchEntityPayload,
): Promise<Record<string, unknown>> {
  await assertDealAccess(dealId, orgId);

  if (payload.entity === "tenant") {
    const { id, ...tenantPatch } = payload.payload;
    const existing = await prisma.tenant.findFirst({
      where: { id, orgId, dealId },
      select: { id: true },
    });
    if (!existing) {
      throw new DealFinancialModelRouteError(404, "Tenant not found");
    }
    const tenant = await prisma.tenant.update({
      where: { id },
      data: tenantPatch,
    });
    return { tenant: serializeTenant(tenant) };
  }

  if (payload.entity === "capitalSource") {
    const { id, ...sourcePatch } = payload.payload;
    const existing = await prisma.capitalSource.findFirst({
      where: { id, orgId, dealId },
      select: { id: true },
    });
    if (!existing) {
      throw new DealFinancialModelRouteError(404, "Capital source not found");
    }
    const source = await prisma.capitalSource.update({
      where: { id },
      data: sourcePatch,
    });
    return { capitalSource: serializeCapitalSource(source) };
  }

  if (payload.entity === "equityWaterfall") {
    const { id, ...tierPatch } = payload.payload;
    const existing = await prisma.equityWaterfall.findFirst({
      where: { id, orgId, dealId },
      select: {
        id: true,
        lpDistributionPct: true,
        gpDistributionPct: true,
      },
    });
    if (!existing) {
      throw new DealFinancialModelRouteError(404, "Equity waterfall tier not found");
    }

    const nextLp = tierPatch.lpDistributionPct ?? toNumber(existing.lpDistributionPct);
    const nextGp = tierPatch.gpDistributionPct ?? toNumber(existing.gpDistributionPct);
    if (Math.abs(nextLp + nextGp - 100) > 0.0001) {
      throw new DealFinancialModelRouteError(
        400,
        "LP and GP distribution must total 100%",
      );
    }

    const tier = await prisma.equityWaterfall.update({
      where: { id },
      data: tierPatch,
    });
    return { equityWaterfall: serializeEquityWaterfallTier(tier) };
  }

  const { id, ...leasePatch } = payload.payload;
  const existing = await prisma.tenantLease.findFirst({
    where: { id, orgId, dealId },
    select: { id: true, startDate: true, endDate: true },
  });
  if (!existing) {
    throw new DealFinancialModelRouteError(404, "Lease not found");
  }

  if (leasePatch.tenantId) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: leasePatch.tenantId, orgId, dealId },
      select: { id: true },
    });
    if (!tenant) {
      throw new DealFinancialModelRouteError(404, "Tenant not found for this deal");
    }
  }

  const nextStartDate = leasePatch.startDate ?? existing.startDate;
  const nextEndDate = leasePatch.endDate ?? existing.endDate;
  if (nextEndDate < nextStartDate) {
    throw new DealFinancialModelRouteError(
      400,
      "Lease end date must be on or after the start date",
    );
  }

  const lease = await prisma.tenantLease.update({
    where: { id },
    data: leasePatch,
    include: { tenant: { select: { name: true } } },
  });
  return { tenantLease: serializeLease(lease) };
}

export async function deleteDealFinancialModelEntity(
  dealId: string,
  orgId: string,
  payload: DeleteEntityPayload,
): Promise<Record<string, unknown>> {
  await assertDealAccess(dealId, orgId);

  if (payload.entity === "tenant") {
    const existing = await prisma.tenant.findFirst({
      where: { id: payload.payload.id, dealId, orgId },
      select: { id: true },
    });
    if (!existing) {
      throw new DealFinancialModelRouteError(404, "Tenant not found");
    }
    const tenant = await prisma.tenant.delete({ where: { id: payload.payload.id } });
    return { tenant: serializeTenant(tenant) };
  }

  if (payload.entity === "capitalSource") {
    const existing = await prisma.capitalSource.findFirst({
      where: { id: payload.payload.id, dealId, orgId },
      select: { id: true },
    });
    if (!existing) {
      throw new DealFinancialModelRouteError(404, "Capital source not found");
    }
    const source = await prisma.capitalSource.delete({
      where: { id: payload.payload.id },
    });
    return { capitalSource: serializeCapitalSource(source) };
  }

  if (payload.entity === "equityWaterfall") {
    const existing = await prisma.equityWaterfall.findFirst({
      where: { id: payload.payload.id, dealId, orgId },
      select: { id: true },
    });
    if (!existing) {
      throw new DealFinancialModelRouteError(404, "Equity waterfall tier not found");
    }
    const tier = await prisma.equityWaterfall.delete({
      where: { id: payload.payload.id },
    });
    return { equityWaterfall: serializeEquityWaterfallTier(tier) };
  }

  const existing = await prisma.tenantLease.findFirst({
    where: { id: payload.payload.id, dealId, orgId },
    select: { id: true },
  });
  if (!existing) {
    throw new DealFinancialModelRouteError(404, "Lease not found");
  }
  const lease = await prisma.tenantLease.delete({
    where: { id: payload.payload.id },
    include: { tenant: { select: { name: true } } },
  });
  return { tenantLease: serializeLease(lease) };
}
