import { prisma } from "@entitlement-os/db";
import { DealScreenResponseSchema } from "@entitlement-os/shared";

import { DealAccessError } from "./deal-workspace.service";

export const SUPPORTED_DEAL_SCREEN_TEMPLATE_KEY = "ENTITLEMENT_LAND";

export class UnsupportedDealScreenTemplateError extends Error {
  constructor() {
    super("Only ENTITLEMENT_LAND workflow screening is available in Phase 3");
    this.name = "UnsupportedDealScreenTemplateError";
  }
}

export async function ensureDealScreenAccess(input: {
  dealId: string;
  orgId: string;
}) {
  const deal = await prisma.deal.findFirst({
    where: { id: input.dealId, orgId: input.orgId },
    select: {
      id: true,
      workflowTemplateKey: true,
      sku: true,
    },
  });

  if (!deal) {
    throw new DealAccessError(404);
  }

  if (
    deal.workflowTemplateKey &&
    deal.workflowTemplateKey !== SUPPORTED_DEAL_SCREEN_TEMPLATE_KEY
  ) {
    throw new UnsupportedDealScreenTemplateError();
  }

  return deal;
}

export function normalizeDealScreenRequestBody(body: Record<string, unknown>) {
  return {
    workflowTemplateKey:
      typeof body.workflowTemplateKey === "string"
        ? body.workflowTemplateKey
        : null,
  };
}

export function buildDealScreenResponse(
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

  return DealScreenResponseSchema.parse({
    run,
    screen: {
      templateKey: SUPPORTED_DEAL_SCREEN_TEMPLATE_KEY,
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
}
