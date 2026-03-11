import { NextRequest, NextResponse } from "next/server";
import {
  DealScreenRequestSchema,
  DealScreenResponseSchema,
} from "@entitlement-os/shared";

import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { GET as getLegacyTriage, POST as postLegacyTriage } from "../triage/route";

const SUPPORTED_TEMPLATE_KEY = "ENTITLEMENT_LAND";

function normalizeScreenRequestBody(body: Record<string, unknown>) {
  return {
    workflowTemplateKey:
      typeof body.workflowTemplateKey === "string"
        ? body.workflowTemplateKey
        : null,
  };
}

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
  const deal = await prisma.deal.findFirst({
    where: { id, orgId: auth.orgId },
    select: {
      id: true,
      workflowTemplateKey: true,
      sku: true,
    },
  });

  if (!deal) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Deal not found" }, { status: 404 }),
    };
  }

  if (
    deal.workflowTemplateKey &&
    deal.workflowTemplateKey !== SUPPORTED_TEMPLATE_KEY
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "Only ENTITLEMENT_LAND workflow screening is available in Phase 3",
        },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true as const,
    auth,
    deal,
  };
}

function buildScreenResponse(
  payload: Record<string, unknown>,
  statusCode: number,
) {
  const runCandidate =
    payload.run && typeof payload.run === "object"
      ? (payload.run as Record<string, unknown>)
      : null;
  const run =
    runCandidate && typeof runCandidate.id === "string"
      ? {
          id: runCandidate.id,
          status:
            typeof runCandidate.status === "string"
              ? runCandidate.status
              : statusCode === 202
                ? "queued"
                : "succeeded",
          startedAt:
            typeof runCandidate.startedAt === "string"
              ? runCandidate.startedAt
              : runCandidate.startedAt instanceof Date
                ? runCandidate.startedAt.toISOString()
                : null,
          finishedAt:
            typeof runCandidate.finishedAt === "string"
              ? runCandidate.finishedAt
              : runCandidate.finishedAt instanceof Date
                ? runCandidate.finishedAt.toISOString()
                : null,
        }
      : null;

  const triage =
    payload.triage && typeof payload.triage === "object" ? payload.triage : null;
  const triageScore =
    typeof payload.triageScore === "number" ? payload.triageScore : null;
  const summary =
    typeof payload.summary === "string"
      ? payload.summary
      : typeof payload.message === "string"
        ? payload.message
        : null;
  const scorecard =
    payload.scorecard && typeof payload.scorecard === "object"
      ? payload.scorecard
      : null;
  const routing =
    payload.routing && typeof payload.routing === "object"
      ? (payload.routing as Record<string, unknown>)
      : null;
  const rerun =
    payload.rerun && typeof payload.rerun === "object"
      ? {
          reusedPreviousRun:
            Boolean((payload.rerun as Record<string, unknown>).reusedPreviousRun),
          reason: String((payload.rerun as Record<string, unknown>).reason ?? ""),
          sourceRunId:
            typeof (payload.rerun as Record<string, unknown>).sourceRunId ===
            "string"
              ? String((payload.rerun as Record<string, unknown>).sourceRunId)
              : null,
        }
      : null;
  const sources = Array.isArray(payload.sources)
    ? payload.sources
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object",
        )
        .map((item) => ({
          url: String(item.url ?? ""),
          title: typeof item.title === "string" ? item.title : null,
        }))
        .filter((item) => item.url.length > 0)
    : [];

  const response = DealScreenResponseSchema.parse({
    run,
    screen: {
      templateKey: SUPPORTED_TEMPLATE_KEY,
      triage,
      triageScore,
      summary,
      scorecard,
      routing,
      rerun,
      sources,
      screenStatus:
        typeof payload.triageStatus === "string"
          ? payload.triageStatus
          : run?.status ?? null,
    },
    triage,
    triageScore,
    summary,
    scorecard,
    routing,
    rerun,
    sources,
  });

  return response;
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
    return NextResponse.json(
      buildScreenResponse(payload, triageResponse.status),
      { status: triageResponse.status },
    );
  } catch (error) {
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
      normalizeScreenRequestBody(body),
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
      parsed.data.workflowTemplateKey !== SUPPORTED_TEMPLATE_KEY
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
      buildScreenResponse(payload, triageResponse.status),
      { status: triageResponse.status },
    );
  } catch (error) {
    console.error("Error running screen:", error);
    return NextResponse.json(
      { error: "Failed to run screen" },
      { status: 500 },
    );
  }
}
