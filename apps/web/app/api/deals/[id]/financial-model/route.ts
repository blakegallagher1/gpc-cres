import { NextRequest, NextResponse } from "next/server";
import {
  CapitalSourceCreateInputSchema,
  CapitalSourceIdSchema,
  CapitalSourcePatchWithIdInputSchema,
  DevelopmentBudgetCreateInputSchema,
  EquityWaterfallTierCreateInputSchema,
  EquityWaterfallTierIdSchema,
  EquityWaterfallTierPatchWithIdInputSchema,
  TenantCreateInputSchema,
  TenantIdSchema,
  TenantLeaseCreateInputSchema,
  TenantLeaseIdSchema,
  TenantLeasePatchWithIdInputSchema,
  TenantPatchWithIdInputSchema,
} from "@entitlement-os/shared";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  DealFinancialModelRouteError,
  createDealFinancialModelEntity,
  deleteDealFinancialModelEntity,
  getDealFinancialModel,
  saveDealFinancialModel,
  updateDealFinancialModelEntity,
} from "@gpc/server";
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
  z.object({
    entity: z.literal("capitalSource"),
    payload: CapitalSourceCreateInputSchema,
  }),
  z.object({
    entity: z.literal("equityWaterfall"),
    payload: EquityWaterfallTierCreateInputSchema,
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
  z.object({
    entity: z.literal("capitalSource"),
    payload: CapitalSourcePatchWithIdInputSchema,
  }),
  z.object({
    entity: z.literal("equityWaterfall"),
    payload: EquityWaterfallTierPatchWithIdInputSchema,
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
  z.object({
    entity: z.literal("capitalSource"),
    payload: CapitalSourceIdSchema,
  }),
  z.object({
    entity: z.literal("equityWaterfall"),
    payload: EquityWaterfallTierIdSchema,
  }),
]);

const updateFinancialModelSchema = z
  .object({
    assumptions: z.record(z.string(), z.unknown()).optional(),
    developmentBudget: DevelopmentBudgetCreateInputSchema.nullable().optional(),
    capitalSources: z.array(CapitalSourceCreateInputSchema).nullable().optional(),
    equityWaterfalls: z.array(EquityWaterfallTierCreateInputSchema).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.assumptions === undefined &&
      data.developmentBudget === undefined &&
      data.capitalSources === undefined &&
      data.equityWaterfalls === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "At least one financial model field is required",
      });
    }
    if (data.equityWaterfalls) {
      for (const [index, tier] of data.equityWaterfalls.entries()) {
        const total = tier.lpDistributionPct + tier.gpDistributionPct;
        if (Math.abs(total - 100) > 0.0001) {
          ctx.addIssue({
            code: "custom",
            message: "LP and GP distribution must total 100%",
            path: ["equityWaterfalls", index],
          });
        }
      }
    }
  });

function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof DealFinancialModelRouteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: fallbackMessage,
        issues: error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function resolveAuthorizedDealId(
  request: NextRequest,
  params: Promise<{ id: string }>,
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return {
      auth: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      dealId: null,
    };
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return {
      auth,
      response: NextResponse.json({ error: "Invalid deal id" }, { status: 400 }),
      dealId: null,
    };
  }

  return { auth, response: null, dealId: parseResult.data.id };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveAuthorizedDealId(request, params);
  if (resolved.response || !resolved.auth || !resolved.dealId) {
    return resolved.response!;
  }

  try {
    const data = await getDealFinancialModel(resolved.dealId, resolved.auth.orgId);
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.financial-model", method: "GET" },
    });
    return toErrorResponse(error, "Failed to load financial model");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveAuthorizedDealId(request, params);
  if (resolved.response || !resolved.auth || !resolved.dealId) {
    return resolved.response!;
  }

  try {
    const body = await request.json();
    const parsed = updateFinancialModelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid financial model payload",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const data = await saveDealFinancialModel(
      resolved.dealId,
      resolved.auth.orgId,
      parsed.data,
    );
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.financial-model", method: "PUT" },
    });
    return toErrorResponse(error, "Failed to save financial model");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveAuthorizedDealId(request, params);
  if (resolved.response || !resolved.auth || !resolved.dealId) {
    return resolved.response!;
  }

  try {
    const body = await request.json();
    const parsed = createEntitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid financial model create payload",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const data = await createDealFinancialModelEntity(
      resolved.dealId,
      resolved.auth.orgId,
      parsed.data,
    );
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.financial-model", method: "POST" },
    });
    return toErrorResponse(error, "Failed to create financial model record");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveAuthorizedDealId(request, params);
  if (resolved.response || !resolved.auth || !resolved.dealId) {
    return resolved.response!;
  }

  try {
    const body = await request.json();
    const parsed = patchEntitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid financial model update payload",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const data = await updateDealFinancialModelEntity(
      resolved.dealId,
      resolved.auth.orgId,
      parsed.data,
    );
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.financial-model", method: "PATCH" },
    });
    return toErrorResponse(error, "Failed to update financial model record");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveAuthorizedDealId(request, params);
  if (resolved.response || !resolved.auth || !resolved.dealId) {
    return resolved.response!;
  }

  try {
    const body = await request.json();
    const parsed = deleteEntitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid financial model delete payload",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const data = await deleteDealFinancialModelEntity(
      resolved.dealId,
      resolved.auth.orgId,
      parsed.data,
    );
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.financial-model", method: "DELETE" },
    });
    return toErrorResponse(error, "Failed to delete financial model record");
  }
}
