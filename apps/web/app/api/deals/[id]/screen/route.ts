import { NextRequest, NextResponse } from "next/server";
import {
  DealAccessError,
  UnsupportedDealScreenTemplateError,
  SUPPORTED_DEAL_SCREEN_TEMPLATE_KEY,
  buildDealScreenResponse,
  ensureDealScreenAccess,
  normalizeDealScreenRequestBody,
} from "@gpc/server";
import {
  DealScreenRequestSchema,
} from "@entitlement-os/shared";

import { resolveAuth } from "@/lib/auth/resolveAuth";
import { GET as getLegacyTriage, POST as postLegacyTriage } from "../triage/route";
import * as Sentry from "@sentry/nextjs";

async function validateDealScreenAccess(
  request: NextRequest,
  params: Promise<{ id: string }>,
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { id } = await params;
  try {
    const deal = await ensureDealScreenAccess({ dealId: id, orgId: auth.orgId });
    return { ok: true as const, auth, deal };
  } catch (error) {
    if (error instanceof DealAccessError) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: error.status === 404 ? "Deal not found" : "Forbidden" },
          { status: error.status },
        ),
      };
    }
    if (error instanceof UnsupportedDealScreenTemplateError) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: error.message }, { status: 400 }),
      };
    }
    throw error;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await validateDealScreenAccess(request, params);
    if (!access.ok) {
      return access.response;
    }

    const triageResponse = await getLegacyTriage(request, { params });
    if (!triageResponse.ok) {
      return triageResponse;
    }

    const payload = (await triageResponse.json()) as Record<string, unknown>;
    return NextResponse.json(buildDealScreenResponse(payload, triageResponse.status), {
      status: triageResponse.status,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.screen", method: "GET" },
    });
    console.error("Error fetching screen:", error);
    return NextResponse.json(
      { error: "Failed to fetch screen" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await validateDealScreenAccess(request, params);
    if (!access.ok) {
      return access.response;
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.clone().json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const parsed = DealScreenRequestSchema.safeParse(
      normalizeDealScreenRequestBody(body),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    }

    if (
      parsed.data.workflowTemplateKey &&
      parsed.data.workflowTemplateKey !== SUPPORTED_DEAL_SCREEN_TEMPLATE_KEY
    ) {
      return NextResponse.json(
        {
          error:
            "Only ENTITLEMENT_LAND workflow screening is available in Phase 3",
        },
        { status: 400 },
      );
    }

    const triageResponse = await postLegacyTriage(request, { params });
    if (!triageResponse.ok) {
      return triageResponse;
    }

    const payload = (await triageResponse.json()) as Record<string, unknown>;
    return NextResponse.json(
      buildDealScreenResponse(payload, triageResponse.status),
      { status: triageResponse.status },
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.screen", method: "POST" },
    });
    console.error("Error running screen:", error);
    return NextResponse.json(
      { error: "Failed to run screen" },
      { status: 500 },
    );
  }
}
