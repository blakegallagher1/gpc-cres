import { prisma } from "@entitlement-os/db";
import { renderArtifactFromSpec } from "@entitlement-os/artifacts";
import {
  ARTIFACT_TYPES,
  DEAL_STATUSES,
  type ArtifactSpec,
  type ArtifactType,
  type DealStatus,
} from "@entitlement-os/shared";

type DecimalLike = { toString(): string };

type UploadArtifactResult = {
  storageObjectKey: string;
};

type UploadArtifactInput = {
  dealId: string;
  artifactType: ArtifactType;
  version: number;
  filename: string;
  contentType: string;
  bytes: Buffer;
  generatedByRunId: string;
};

type ArtifactRouteAuth = {
  orgId: string;
  userId: string;
};

type DealWithRelations = {
  id: string;
  name: string;
  sku: string;
  status: string;
  notes: string | null;
  financialModelAssumptions?: unknown;
  jurisdictionId?: string;
  jurisdiction: { id: string; name: string; kind: string; state: string } | null;
  terms?: {
    offerPrice: DecimalLike | null;
    closingDate: Date | null;
  } | null;
  tenantLeases?: Array<{
    rentPerSf: DecimalLike;
    rentedAreaSf: DecimalLike;
    startDate: Date;
    endDate: Date;
  }>;
  outcome?: {
    actualNoiYear1: DecimalLike | null;
    actualExitPrice: DecimalLike | null;
    actualIrr: DecimalLike | null;
    actualEquityMultiple: DecimalLike | null;
  } | null;
  parcels: Array<{
    id: string;
    address: string;
    apn: string | null;
    acreage: DecimalLike | null;
    currentZoning: string | null;
    floodZone: string | null;
    soilsNotes: string | null;
    wetlandsNotes: string | null;
    envNotes: string | null;
    trafficNotes: string | null;
    utilitiesNotes: string | null;
  }>;
};

const STAGE_PREREQUISITES: Record<ArtifactType, DealStatus> = {
  TRIAGE_PDF: "TRIAGE_DONE",
  SUBMISSION_CHECKLIST_PDF: "PREAPP",
  HEARING_DECK_PPTX: "SUBMITTED",
  EXIT_PACKAGE_PDF: "APPROVED",
  BUYER_TEASER_PDF: "EXIT_MARKETED",
  INVESTMENT_MEMO_PDF: "TRIAGE_DONE",
  OFFERING_MEMO_PDF: "APPROVED",
  COMP_ANALYSIS_PDF: "TRIAGE_DONE",
  IC_DECK_PPTX: "TRIAGE_DONE",
};

export class DealArtifactRouteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function statusIndex(status: DealStatus): number {
  return DEAL_STATUSES.indexOf(status);
}

function isAtOrPast(current: string, required: DealStatus): boolean {
  const currentIndex = statusIndex(current as DealStatus);
  const requiredIndex = statusIndex(required);
  if (currentIndex < 0) {
    return false;
  }
  return currentIndex >= requiredIndex;
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (
    value &&
    typeof value === "object" &&
    "toString" in value &&
    typeof (value as { toString: () => string }).toString === "function"
  ) {
    const parsed = Number((value as { toString: () => string }).toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDecimal(value: DecimalLike | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeRate(value: number): number {
  return value > 1 ? value / 100 : value;
}

function absoluteArtifactDownloadUrl(dealId: string, artifactId: string): string {
  const baseUrl = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.gallagherpropco.com"
  ).replace(/\/$/, "");
  return `${baseUrl}/api/deals/${dealId}/artifacts/${artifactId}/download`;
}

function artifactTypeLabel(artifactType: ArtifactType): string {
  const labels: Record<ArtifactType, string> = {
    TRIAGE_PDF: "Triage Report",
    SUBMISSION_CHECKLIST_PDF: "Submission Checklist",
    HEARING_DECK_PPTX: "Hearing Deck",
    EXIT_PACKAGE_PDF: "Exit Package",
    BUYER_TEASER_PDF: "Buyer Teaser",
    INVESTMENT_MEMO_PDF: "Investment Memo",
    OFFERING_MEMO_PDF: "Offering Memorandum",
    COMP_ANALYSIS_PDF: "Comparative Analysis",
    IC_DECK_PPTX: "IC Deck",
  };
  return labels[artifactType];
}

function skuLabel(sku: string): string {
  const labels: Record<string, string> = {
    SMALL_BAY_FLEX: "Small Bay Flex",
    OUTDOOR_STORAGE: "Outdoor Storage",
    TRUCK_PARKING: "Truck Parking",
  };
  return labels[sku] ?? sku;
}

function buildParcelSummary(parcels: DealWithRelations["parcels"]): string {
  return parcels
    .map((parcel, index) => {
      const parts = [`**Parcel ${index + 1}:** ${parcel.address}`];
      if (parcel.apn) parts.push(`APN: ${parcel.apn}`);
      if (parcel.acreage) parts.push(`Acreage: ${parcel.acreage.toString()}`);
      if (parcel.currentZoning) parts.push(`Zoning: ${parcel.currentZoning}`);
      if (parcel.floodZone) parts.push(`Flood Zone: ${parcel.floodZone}`);
      return parts.join(" | ");
    })
    .join("\n");
}

function buildDetailedParcelSummary(parcels: DealWithRelations["parcels"]): string {
  return parcels
    .map((parcel, index) => {
      const lines = [`**Parcel ${index + 1}: ${parcel.address}**`];
      if (parcel.apn) lines.push(`- APN: ${parcel.apn}`);
      if (parcel.acreage) lines.push(`- Acreage: ${parcel.acreage.toString()}`);
      if (parcel.currentZoning) lines.push(`- Current Zoning: ${parcel.currentZoning}`);
      if (parcel.floodZone) lines.push(`- Flood Zone: ${parcel.floodZone}`);
      if (parcel.soilsNotes) lines.push(`- Soils: ${parcel.soilsNotes}`);
      if (parcel.wetlandsNotes) lines.push(`- Wetlands: ${parcel.wetlandsNotes}`);
      if (parcel.envNotes) lines.push(`- Environmental: ${parcel.envNotes}`);
      if (parcel.trafficNotes) lines.push(`- Traffic: ${parcel.trafficNotes}`);
      if (parcel.utilitiesNotes) lines.push(`- Utilities: ${parcel.utilitiesNotes}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function totalAcreage(parcels: DealWithRelations["parcels"]): string {
  const sum = parcels.reduce(
    (accumulator, parcel) =>
      accumulator + (parcel.acreage ? Number.parseFloat(parcel.acreage.toString()) : 0),
    0,
  );
  return sum > 0 ? sum.toFixed(2) : "N/A";
}

function buildSourcesSummary(triage: Record<string, unknown> | null): string[] {
  if (!triage || !Array.isArray(triage.sources)) {
    return ["https://gallagherpropco.com"];
  }
  const urls = triage.sources
    .map((item) => (typeof item === "string" ? item : null))
    .filter((item): item is string => Boolean(item && /^https?:\/\//.test(item)));
  return urls.length > 0 ? Array.from(new Set(urls)) : ["https://gallagherpropco.com"];
}

function inferTriageTier(triage: Record<string, unknown>): string {
  const confidence = parseNumericValue(triage.confidence);
  if (confidence === null) return "Unscored";
  const normalized = confidence > 1 ? confidence / 100 : confidence;
  if (normalized >= 0.8) return "Tier A";
  if (normalized >= 0.65) return "Tier B";
  if (normalized >= 0.5) return "Tier C";
  return "Tier D";
}

function extractRiskMatrixLines(triage: Record<string, unknown>): string {
  const lines: string[] = [];
  const riskScores =
    triage.risk_scores && typeof triage.risk_scores === "object"
      ? (triage.risk_scores as Record<string, unknown>)
      : null;
  if (riskScores) {
    for (const [category, scoreRaw] of Object.entries(riskScores)) {
      const score = parseNumericValue(scoreRaw);
      const severity =
        score === null
          ? "unknown"
          : score >= 8
            ? "critical"
            : score >= 6
              ? "high"
              : score >= 4
                ? "medium"
                : "low";
      lines.push(
        `- ${category.replaceAll("_", " ")} | severity: ${severity} | score: ${score ?? "N/A"}/10`,
      );
    }
  }

  const disqualifiers = Array.isArray(triage.disqualifiers) ? triage.disqualifiers : [];
  for (const item of disqualifiers) {
    if (!item || typeof item !== "object") continue;
    const label = String((item as Record<string, unknown>).label ?? "Disqualifier");
    const detail = String((item as Record<string, unknown>).detail ?? "No detail");
    const severity = String((item as Record<string, unknown>).severity ?? "soft");
    lines.push(`- ${label} | severity: ${severity} | ${detail}`);
  }

  return lines.length > 0 ? lines.join("\n") : "- No material risks were identified.";
}

function buildEntitlementAnalysis(
  deal: DealWithRelations,
  triage: Record<string, unknown>,
): string {
  const strategy = String(
    triage.recommended_strategy ??
      triage.entitlement_strategy ??
      triage.path ??
      "Recommended path pending",
  );
  const approvalProbabilityRaw =
    parseNumericValue(triage.approval_probability) ??
    parseNumericValue(triage.approvalProbability);
  const approvalProbability =
    approvalProbabilityRaw === null
      ? "N/A"
      : `${(approvalProbabilityRaw > 1 ? approvalProbabilityRaw : approvalProbabilityRaw * 100).toFixed(1)}%`;
  const timelineMonths =
    parseNumericValue(triage.expected_timeline_months) ??
    parseNumericValue(triage.timeline_months);

  return [
    `**Jurisdiction:** ${deal.jurisdiction?.name ?? "N/A"}`,
    `**Recommended Strategy:** ${strategy}`,
    `**Approval Probability:** ${approvalProbability}`,
    `**Expected Timeline:** ${timelineMonths !== null ? `${timelineMonths} months` : "N/A"}`,
  ].join("\n");
}

function buildTriageFinancialContractSection(
  deal: DealWithRelations,
  triage: Record<string, unknown>,
): string {
  const assumptions =
    deal.financialModelAssumptions && typeof deal.financialModelAssumptions === "object"
      ? (deal.financialModelAssumptions as Record<string, unknown>)
      : null;
  const financialSummary =
    triage.financial_summary && typeof triage.financial_summary === "object"
      ? (triage.financial_summary as Record<string, unknown>)
      : null;
  const projectedIrr =
    parseNumericValue(financialSummary?.estimated_irr) ??
    parseNumericValue(assumptions?.targetIrrPct ?? null);
  const projectedCapRate = parseNumericValue(financialSummary?.projected_cap_rate);
  const equityMultiple = parseNumericValue(financialSummary?.equity_multiple);
  const irrText =
    projectedIrr === null
      ? "N/A"
      : `${(projectedIrr > 1 ? projectedIrr : projectedIrr * 100).toFixed(1)}%`;
  const capRateText =
    projectedCapRate === null
      ? "N/A"
      : `${(normalizeRate(projectedCapRate) * 100).toFixed(2)}%`;
  const equityMultipleText = equityMultiple === null ? "N/A" : `${equityMultiple.toFixed(2)}x`;

  return [
    `**Projected IRR:** ${irrText}`,
    `**Projected Exit Cap Rate:** ${capRateText}`,
    `**Projected Equity Multiple:** ${equityMultipleText}`,
  ].join("\n");
}

function buildPrioritizedActions(triage: Record<string, unknown>): string {
  const actions = Array.isArray(triage.next_actions) ? triage.next_actions : [];
  if (actions.length === 0) {
    return "1. Confirm file completeness\n2. Prepare submission packet\n3. Advance diligence tasks";
  }
  return actions
    .slice(0, 6)
    .map((action, index) => {
      if (!action || typeof action !== "object") {
        return `${index + 1}. Follow up on outstanding task`;
      }
      const title = String((action as Record<string, unknown>).title ?? "Action item");
      const description = String((action as Record<string, unknown>).description ?? "");
      return `${index + 1}. ${title}${description ? ` — ${description}` : ""}`;
    })
    .join("\n");
}

function buildBuyerTeaserThesis(
  deal: DealWithRelations,
  triage: Record<string, unknown> | null,
): string {
  const rationale = triage ? String(triage.rationale ?? "") : "";
  if (rationale.trim().length > 0) {
    return rationale
      .split(".")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((line) => `${line}.`)
      .join(" ");
  }
  return `This ${skuLabel(deal.sku).toLowerCase()} opportunity in ${
    deal.jurisdiction?.name ?? "Louisiana"
  } offers entitled positioning, executable site characteristics, and near-term monetization potential.`;
}

function formatRiskScores(triage: Record<string, unknown>): string {
  const scores = triage.risk_scores as Record<string, number> | undefined;
  if (!scores || typeof scores !== "object") {
    return "No risk scores available.";
  }
  return Object.entries(scores)
    .map(([key, value]) => `**${key.replace(/_/g, " ")}:** ${value}/10`)
    .join("\n");
}

function formatDisqualifiers(triage: Record<string, unknown>): string {
  const hard = triage.hard_disqualifiers as string[] | undefined;
  const soft = triage.soft_disqualifiers as string[] | undefined;
  const parts: string[] = [];
  parts.push(
    hard && hard.length > 0
      ? `**Hard Disqualifiers:**\n${hard.map((item) => `- ${item}`).join("\n")}`
      : "**Hard Disqualifiers:** None",
  );
  parts.push(
    soft && soft.length > 0
      ? `**Soft Disqualifiers:**\n${soft.map((item) => `- ${item}`).join("\n")}`
      : "**Soft Disqualifiers:** None",
  );
  return parts.join("\n\n");
}

function formatNextActions(triage: Record<string, unknown>): string {
  const actions = triage.next_actions as
    | Array<{ title: string; description?: string }>
    | undefined;
  if (!actions || actions.length === 0) {
    return "No next actions specified.";
  }
  return actions
    .map((action, index) => `${index + 1}. **${action.title}**${action.description ? `: ${action.description}` : ""}`)
    .join("\n");
}

function buildFinancialSnapshot(deal: DealWithRelations, triage: Record<string, unknown>): string {
  const financials = triage.financial_summary as Record<string, unknown> | undefined;
  const lines = [
    `**Product Type:** ${skuLabel(deal.sku)}`,
    `**Total Acreage:** ${totalAcreage(deal.parcels)} acres`,
  ];

  if (financials && typeof financials === "object") {
    if (financials.acquisition_cost) lines.push(`**Estimated Acquisition Cost:** ${String(financials.acquisition_cost)}`);
    if (financials.estimated_noi) lines.push(`**Estimated NOI:** ${String(financials.estimated_noi)}`);
    if (financials.projected_cap_rate) lines.push(`**Projected Cap Rate:** ${String(financials.projected_cap_rate)}`);
    if (financials.estimated_irr) lines.push(`**Estimated IRR:** ${String(financials.estimated_irr)}`);
    if (financials.total_development_cost) lines.push(`**Total Development Cost:** ${String(financials.total_development_cost)}`);
    if (financials.equity_multiple) lines.push(`**Equity Multiple:** ${String(financials.equity_multiple)}`);
  } else {
    lines.push(
      "",
      "*Financial data will be populated as deal analysis progresses. Run financial modeling tools for detailed projections.*",
    );
  }

  return lines.join("\n");
}

function buildInvestmentHighlights(
  deal: DealWithRelations,
  triage: Record<string, unknown> | null,
): string {
  const highlights: string[] = [];
  const acreage = totalAcreage(deal.parcels);
  if (Number.parseFloat(acreage) > 0) highlights.push(`${acreage} acres of developable land`);
  if (deal.jurisdiction) highlights.push(`Located in ${deal.jurisdiction.name}, ${deal.jurisdiction.state}`);
  highlights.push(`${skuLabel(deal.sku)} product type`);
  if (deal.status === "APPROVED" || deal.status === "EXIT_MARKETED") {
    highlights.push("Fully entitled — all approvals in place");
  }
  if (triage) {
    const decision = String(triage.decision ?? "");
    if (decision === "ADVANCE") highlights.push("Passed triage screening with ADVANCE recommendation");
    const confidence = parseNumericValue(triage.confidence);
    if (confidence !== null && confidence >= 0.7) {
      highlights.push(`High confidence triage score (${(confidence * 100).toFixed(0)}%)`);
    }
  }
  const zonings = [...new Set(deal.parcels.map((parcel) => parcel.currentZoning).filter(Boolean))];
  if (zonings.length > 0) highlights.push(`Zoned: ${zonings.join(", ")}`);
  return highlights.map((highlight) => `- ${highlight}`).join("\n");
}

function buildDealContextForLLM(
  deal: DealWithRelations,
  triage: Record<string, unknown>,
): string {
  const parts: string[] = [
    `Deal Name: ${deal.name}`,
    `Product Type: ${skuLabel(deal.sku)}`,
    `Jurisdiction: ${deal.jurisdiction?.name ?? "N/A"}, ${deal.jurisdiction?.state ?? "LA"}`,
    `Status: ${deal.status}`,
    `Parcels: ${deal.parcels.length}`,
    `Total Acreage: ${totalAcreage(deal.parcels)} acres`,
    "",
    "Parcel Details:",
    buildDetailedParcelSummary(deal.parcels),
    "",
    `Triage Decision: ${String(triage.decision ?? "N/A")}`,
    `Triage Confidence: ${String(triage.confidence ?? "N/A")}`,
    `Triage Rationale: ${String(triage.rationale ?? "N/A")}`,
    "",
    "Risk Scores:",
    formatRiskScores(triage),
    "",
    "Disqualifiers:",
    formatDisqualifiers(triage),
  ];

  const financials = triage.financial_summary as Record<string, unknown> | undefined;
  if (financials && typeof financials === "object") {
    parts.push("", "Financial Data:");
    for (const [key, value] of Object.entries(financials)) {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  if (deal.notes) {
    parts.push("", `Notes: ${deal.notes}`);
  }
  return parts.join("\n");
}

async function generateNarrative(
  prompt: string,
  systemPrompt: string,
  maxTokens = 800,
): Promise<string> {
  try {
    const { createTextResponse } = await import("@entitlement-os/openai");
    const { text } = await createTextResponse({
      model: "gpt-5.4-mini",
      maxOutputTokens: maxTokens,
      temperature: 0.4,
      systemPrompt,
      userPrompt: prompt,
    });
    return text || "(No narrative generated)";
  } catch {
    return "(Narrative generation failed — see logs)";
  }
}

async function buildArtifactSpec(
  artifactType: ArtifactType,
  deal: DealWithRelations & { jurisdictionId?: string },
  triageOutput: Record<string, unknown> | null,
  comparisonDeals?: DealWithRelations[] | null,
): Promise<ArtifactSpec> {
  const base = {
    schema_version: "1.0" as const,
    deal_id: deal.id,
    title: `${deal.name} - ${artifactTypeLabel(artifactType)}`,
    sources_summary: ["https://gallagherpropco.com"] as string[],
  };

  switch (artifactType) {
    case "TRIAGE_PDF": {
      const triage = triageOutput!;
      return {
        ...base,
        artifact_type: "TRIAGE_PDF",
        sections: [
          {
            key: "executive_summary",
            heading: "Executive Summary",
            body_markdown: [
              `**Deal Name:** ${deal.name}`,
              `**Recommendation:** ${String(triage.decision ?? "N/A")}`,
              `**Triage Tier:** ${inferTriageTier(triage)}`,
              "",
              "**Key Risks:**",
              extractRiskMatrixLines(triage),
            ].join("\n"),
          },
          {
            key: "site_overview",
            heading: "Site Overview",
            body_markdown: [
              `**Addresses:** ${deal.parcels.map((parcel) => parcel.address).join("; ") || "N/A"}`,
              `**Total Acreage:** ${totalAcreage(deal.parcels)} acres`,
              `**Zoning:** ${[...new Set(deal.parcels.map((parcel) => parcel.currentZoning).filter(Boolean))].join(", ") || "Unknown"}`,
              "",
              "**Map Thumbnail:** [Map thumbnail placeholder]",
            ].join("\n"),
          },
          {
            key: "entitlement_analysis",
            heading: "Entitlement Analysis",
            body_markdown: buildEntitlementAnalysis(deal, triage),
          },
          {
            key: "financial_summary",
            heading: "Financial Summary",
            body_markdown: buildTriageFinancialContractSection(deal, triage),
          },
          {
            key: "risk_matrix",
            heading: "Risk Matrix",
            body_markdown: extractRiskMatrixLines(triage),
          },
          {
            key: "next_actions",
            heading: "Next Actions",
            body_markdown: buildPrioritizedActions(triage),
          },
        ],
        sources_summary: buildSourcesSummary(triage),
      };
    }
    case "SUBMISSION_CHECKLIST_PDF": {
      const jurisdiction = deal.jurisdiction?.name ?? "Unknown Jurisdiction";
      const seedSources = deal.jurisdictionId
        ? await prisma.jurisdictionSeedSource.findMany({
            where: { jurisdictionId: deal.jurisdictionId, active: true },
            select: { purpose: true, url: true },
          })
        : [];
      const sourcesByPurpose: Record<string, string[]> = {};
      for (const source of seedSources) {
        sourcesByPurpose[source.purpose] ??= [];
        sourcesByPurpose[source.purpose].push(source.url);
      }
      const appUrl = sourcesByPurpose.applications?.[0] ?? sourcesByPurpose.forms?.[0];
      const ordUrl = sourcesByPurpose.ordinance?.[0];
      const feeUrl = sourcesByPurpose.fees?.[0] ?? ordUrl;
      const noticeUrl = sourcesByPurpose.public_notice?.[0] ?? ordUrl;
      const envUrl = sourcesByPurpose.environmental?.[0] ?? ordUrl;
      const trafficUrl = sourcesByPurpose.traffic?.[0] ?? ordUrl;
      const fallbackSource = "https://gallagherpropco.com/reference/submission-requirements";
      const checklistItems = [
        {
          item: "Application Forms",
          description: "Master entitlement application form and owner authorization package.",
          required: true,
          status: "pending" as const,
          notes: `${jurisdiction} form package.`,
          sources: appUrl ? [appUrl] : [fallbackSource],
        },
        {
          item: "Required Drawings/Plans",
          description: "Site plan, boundary survey, legal description, and utility layout.",
          required: true,
          status: "pending" as const,
          notes: "Prepared by licensed surveyor/engineer.",
          sources: ordUrl ? [ordUrl] : [fallbackSource],
        },
        {
          item: "Environmental Reports",
          description: "Phase I ESA and supporting environmental documentation where required.",
          required: true,
          status: "pending" as const,
          notes: "Upload report package and consultant summary.",
          sources: envUrl ? [envUrl] : [fallbackSource],
        },
        {
          item: "Traffic Studies",
          description: "Traffic impact assessment if trip-generation threshold is exceeded.",
          required: false,
          status: "not_applicable" as const,
          notes: "Switch to pending when threshold trigger is met.",
          sources: trafficUrl ? [trafficUrl] : [fallbackSource],
        },
        {
          item: "Public Notice Requirements",
          description: "Mailing list, newspaper posting, and site signage requirements.",
          required: true,
          status: "pending" as const,
          notes: "Track notice windows and affidavit deadlines.",
          sources: noticeUrl ? [noticeUrl] : [fallbackSource],
        },
        {
          item: "Fee Schedule",
          description: "Application fees, hearing fees, and re-notice fees.",
          required: true,
          status: "pending" as const,
          notes: "Verify current fee schedule before filing.",
          sources: feeUrl ? [feeUrl] : [fallbackSource],
        },
      ];
      return {
        ...base,
        artifact_type: "SUBMISSION_CHECKLIST_PDF",
        checklist_items: checklistItems,
        sections: [
          {
            key: "deal_overview",
            heading: "Deal Overview",
            body_markdown: `**Deal:** ${deal.name}\n**SKU:** ${deal.sku}\n**Jurisdiction:** ${jurisdiction}\n\n${buildParcelSummary(deal.parcels)}`,
          },
          {
            key: "submission_sections",
            heading: "Submission Package Sections",
            body_markdown: checklistItems
              .map(
                (item) =>
                  `- **${item.item}:** ${item.description} (status: ${item.status.replaceAll("_", " ")})`,
              )
              .join("\n"),
          },
        ],
        sources_summary: Array.from(new Set(checklistItems.flatMap((item) => item.sources))),
      };
    }
    case "HEARING_DECK_PPTX": {
      const triage = triageOutput!;
      return {
        ...base,
        artifact_type: "HEARING_DECK_PPTX",
        slides: [
          {
            slide_no: 1,
            title: "Project Overview",
            bullets: [
              `Deal: ${deal.name}`,
              `Product: ${deal.sku}`,
              `Jurisdiction: ${deal.jurisdiction?.name ?? "N/A"}`,
            ],
            speaker_notes: "Introduce the project and development team.",
          },
          {
            slide_no: 2,
            title: "Site Location",
            bullets: deal.parcels.map((parcel) => `${parcel.address}${parcel.apn ? ` (APN: ${parcel.apn})` : ""}`),
            speaker_notes: "Walk through site location and access points.",
          },
          {
            slide_no: 3,
            title: "Proposed Use",
            bullets: [
              `Primary use: ${deal.sku}`,
              "Consistent with comprehensive plan",
              "Compatible with surrounding uses",
            ],
            speaker_notes: "Explain the proposed use and compatibility.",
          },
          {
            slide_no: 4,
            title: "Zoning Analysis",
            bullets: deal.parcels.map((parcel) => `${parcel.address}: ${parcel.currentZoning ?? "TBD"}`),
            speaker_notes: "Review current vs requested zoning.",
          },
          {
            slide_no: 5,
            title: "Site Conditions",
            bullets:
              deal.parcels
                .flatMap((parcel) =>
                  [
                    parcel.floodZone ? `Flood: ${parcel.floodZone}` : null,
                    parcel.soilsNotes ? `Soils: ${parcel.soilsNotes}` : null,
                  ].filter(Boolean) as string[],
                )
                .slice(0, 5) || ["No significant conditions identified"],
            speaker_notes: "Address environmental and physical site conditions.",
          },
          {
            slide_no: 6,
            title: "Risk Assessment",
            bullets: [
              `Decision: ${String(triage.decision ?? "N/A")}`,
              "Key risks identified in triage assessment",
            ],
            speaker_notes: "Summarize the risk profile from triage.",
          },
          {
            slide_no: 7,
            title: "Infrastructure & Access",
            bullets: [
              "Road access and traffic analysis",
              "Utility availability",
              "Stormwater management approach",
            ],
            speaker_notes: "Review infrastructure readiness.",
          },
          {
            slide_no: 8,
            title: "Community Impact",
            bullets: [
              "Employment opportunities",
              "Tax revenue generation",
              "Minimal residential disruption",
            ],
            speaker_notes: "Highlight positive community impacts.",
          },
          {
            slide_no: 9,
            title: "Conditions & Commitments",
            bullets: [
              "Landscape buffers per code",
              "Hours of operation restrictions if applicable",
              "Stormwater compliance",
            ],
            speaker_notes: "Address potential conditions the board may impose.",
          },
          {
            slide_no: 10,
            title: "Request",
            bullets: [
              `Requesting approval for ${deal.sku} use`,
              "Project meets all applicable standards",
              "Respectfully request favorable recommendation",
            ],
            speaker_notes: "Make the formal request and close.",
          },
        ],
        sections: [],
      };
    }
    case "EXIT_PACKAGE_PDF": {
      const triage = triageOutput!;
      const latestTriagePdf = await prisma.artifact.findFirst({
        where: { dealId: deal.id, artifactType: "TRIAGE_PDF" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const triageUrl = latestTriagePdf
        ? absoluteArtifactDownloadUrl(deal.id, latestTriagePdf.id)
        : null;
      const parish = deal.jurisdiction?.name ?? "";
      const marketData = parish
        ? await prisma.marketDataPoint.findMany({
            where: {
              parish: { equals: parish, mode: "insensitive" },
              dataType: "comp_sale",
            },
            orderBy: { observedAt: "desc" },
            take: 25,
            select: { source: true, data: true },
          })
        : [];
      const compCapRates = marketData
        .map((point) => parseNumericValue((point.data as Record<string, unknown>).cap_rate))
        .filter((value): value is number => value !== null);
      const compSalePrices = marketData
        .map((point) => parseNumericValue((point.data as Record<string, unknown>).sale_price))
        .filter((value): value is number => value !== null);
      const averageCapRate =
        compCapRates.length > 0
          ? compCapRates.reduce((sum, value) => sum + normalizeRate(value), 0) /
            compCapRates.length
          : null;
      const averageSale =
        compSalePrices.length > 0
          ? compSalePrices.reduce((sum, value) => sum + value, 0) / compSalePrices.length
          : null;
      const leases = deal.tenantLeases ?? [];
      const rentRollSf = leases.reduce(
        (sum, lease) => sum + (parseDecimal(lease.rentedAreaSf) ?? 0),
        0,
      );
      const weightedRent =
        rentRollSf > 0
          ? leases.reduce((sum, lease) => {
              const sf = parseDecimal(lease.rentedAreaSf) ?? 0;
              return sum + (parseDecimal(lease.rentPerSf) ?? 0) * sf;
            }, 0) / rentRollSf
          : null;
      const occupiedLeases = leases.filter((lease) => lease.endDate >= new Date()).length;
      const occupancyPct =
        leases.length > 0 ? (occupiedLeases / leases.length) * 100 : null;
      const marketSources = Array.from(
        new Set(
          marketData
            .map((point) => point.source)
            .filter((source): source is string => Boolean(source && /^https?:\/\//.test(source))),
        ),
      );
      return {
        ...base,
        artifact_type: "EXIT_PACKAGE_PDF",
        approval_summary: `Disposition package for "${deal.name}" with current entitlement and underwriting support.`,
        conditions_summary:
          "Verify entitlement conditions, title exceptions, and transfer constraints prior to final disposition.",
        evidence_index: [
          {
            label: "Triage Assessment",
            url: triageUrl ?? "https://gallagherpropco.com",
            notes: "Auto-generated triage report",
          },
        ],
        sections: [
          {
            key: "executive_summary",
            heading: "Executive Summary",
            body_markdown: [
              `**Deal:** ${deal.name}`,
              `**Status:** ${deal.status}`,
              `**SKU:** ${deal.sku}`,
              `**Disposition Thesis:** ${String(triage.rationale ?? "Transition to market with completed diligence package.")}`,
            ].join("\n"),
          },
          {
            key: "property_description",
            heading: "Property Description",
            body_markdown: buildDetailedParcelSummary(deal.parcels),
          },
          {
            key: "financial_performance",
            heading: "Financial Performance",
            body_markdown: [
              `**Historical NOI (Year 1):** ${formatCurrency(parseDecimal(deal.outcome?.actualNoiYear1 ?? null))}`,
              `**Rent Roll SF:** ${Math.round(rentRollSf).toLocaleString()} sf`,
              `**Weighted Avg Rent/SF:** ${weightedRent !== null ? `$${weightedRent.toFixed(2)}` : "N/A"}`,
              `**Occupancy Trend (active leases):** ${occupancyPct !== null ? `${occupancyPct.toFixed(1)}%` : "N/A"}`,
            ].join("\n"),
          },
          {
            key: "market_overview",
            heading: "Market Overview",
            body_markdown: [
              `**Parish:** ${parish || "N/A"}`,
              `**Recent Comp Count:** ${marketData.length}`,
              `**Average Comp Cap Rate:** ${averageCapRate !== null ? `${(averageCapRate * 100).toFixed(2)}%` : "N/A"}`,
              `**Average Comp Sale Price:** ${formatCurrency(averageSale)}`,
            ].join("\n"),
          },
          {
            key: "investment_highlights",
            heading: "Investment Highlights",
            body_markdown: buildInvestmentHighlights(deal, triage),
          },
          {
            key: "asking_price_terms",
            heading: "Asking Price and Terms",
            body_markdown: [
              `**Asking Price:** ${formatCurrency(parseDecimal(deal.terms?.offerPrice ?? null))}`,
              `**Offer Price Baseline:** ${formatCurrency(parseDecimal(deal.terms?.offerPrice ?? null))}`,
              `**Target Close:** ${deal.terms?.closingDate ? deal.terms.closingDate.toISOString().slice(0, 10) : "TBD"}`,
            ].join("\n"),
          },
        ],
        sources_summary: marketSources.length > 0 ? marketSources : buildSourcesSummary(triage),
      };
    }
    case "BUYER_TEASER_PDF": {
      const triage = triageOutput;
      const assumptions =
        deal.financialModelAssumptions && typeof deal.financialModelAssumptions === "object"
          ? (deal.financialModelAssumptions as Record<string, unknown>)
          : null;
      const financialSummary =
        triage && triage.financial_summary && typeof triage.financial_summary === "object"
          ? (triage.financial_summary as Record<string, unknown>)
          : null;
      const buildableSf = parseNumericValue(assumptions?.buildableSf) ?? null;
      const noi = parseNumericValue(financialSummary?.estimated_noi);
      const capRate = parseNumericValue(financialSummary?.projected_cap_rate);
      const zonings = [...new Set(deal.parcels.map((parcel) => parcel.currentZoning).filter(Boolean))].join(", ") || "See Details";
      return {
        ...base,
        artifact_type: "BUYER_TEASER_PDF",
        sections: [
          {
            key: "branding",
            heading: "Branding",
            body_markdown: [
              "**[GPC LOGO PLACEHOLDER]**",
              `**${deal.name}**`,
              "**Property Photo:** [Property photo placeholder]",
            ].join("\n"),
          },
          {
            key: "key_metrics",
            heading: "Key Metrics",
            body_markdown: [
              `- Acreage: ${totalAcreage(deal.parcels)} acres`,
              `- Buildable SF: ${buildableSf !== null ? Math.round(buildableSf).toLocaleString() : "N/A"} sf`,
              `- NOI: ${formatCurrency(noi)}`,
              `- Cap Rate: ${capRate !== null ? `${(normalizeRate(capRate) * 100).toFixed(2)}%` : "N/A"}`,
              `- Asking Price: ${formatCurrency(parseDecimal(deal.terms?.offerPrice ?? null))}`,
            ].join("\n"),
          },
          {
            key: "location_highlights",
            heading: "Location Highlights",
            body_markdown: [
              `- Jurisdiction: ${deal.jurisdiction?.name ?? "Louisiana"}`,
              `- Zoning: ${zonings}`,
              `- Addresses: ${deal.parcels.map((parcel) => parcel.address).join("; ") || "N/A"}`,
            ].join("\n"),
          },
          {
            key: "investment_thesis",
            heading: "Investment Thesis",
            body_markdown: buildBuyerTeaserThesis(deal, triage),
          },
          {
            key: "contact",
            heading: "Contact",
            body_markdown:
              "For more information, contact:\n\n**Gallagher Property Company**\nBaton Rouge, Louisiana\n(225) 000-0000\ninvestments@gallagherpropco.com",
          },
        ],
        sources_summary: buildSourcesSummary(triage),
      };
    }
    case "INVESTMENT_MEMO_PDF": {
      const triage = triageOutput!;
      const dealContext = buildDealContextForLLM(deal, triage);
      const systemPrompt =
        "You are a senior CRE investment analyst at Gallagher Property Company, writing an institutional-quality investment memorandum. Write in professional third-person prose. Be specific and data-driven. Use the provided deal data — never fabricate numbers.";
      const [
        executiveSummary,
        investmentThesis,
        marketAnalysis,
        financialAnalysis,
        riskNarrative,
        businessPlan,
      ] = await Promise.all([
        generateNarrative(
          `Write a 2-3 paragraph executive summary for this deal:\n\n${dealContext}\n\nCover: what the opportunity is, why it's compelling, key metrics, and recommended action.`,
          systemPrompt,
          500,
        ),
        generateNarrative(
          `Write the investment thesis (2-3 paragraphs) for this deal:\n\n${dealContext}\n\nExplain: why this property fits GPC's strategy, market tailwinds, competitive advantages, and value creation opportunity.`,
          systemPrompt,
          500,
        ),
        generateNarrative(
          `Write a market analysis section (3-4 paragraphs) for this deal:\n\n${dealContext}\n\nCover: local market dynamics in ${deal.jurisdiction?.name ?? "Louisiana"}, supply/demand for ${skuLabel(deal.sku)}, comparable transactions, demographic and economic drivers. Use available parcel and enrichment data.`,
          systemPrompt,
          600,
        ),
        generateNarrative(
          `Write a financial analysis section (2-3 paragraphs) for this deal:\n\n${dealContext}\n\nCover: acquisition basis, estimated development costs, projected NOI, return metrics (cap rate, IRR, equity multiple), and how returns compare to target thresholds. Note any missing data.`,
          systemPrompt,
          500,
        ),
        generateNarrative(
          `Write a risk assessment narrative (2-3 paragraphs) for this deal:\n\n${dealContext}\n\nCover: key risks identified in triage, environmental considerations, entitlement risk, market risk, and proposed mitigants.`,
          systemPrompt,
          500,
        ),
        generateNarrative(
          `Write a development/business plan section (2-3 paragraphs) for this deal:\n\n${dealContext}\n\nCover: development timeline, entitlement strategy, site improvements needed, lease-up/disposition strategy.`,
          systemPrompt,
          400,
        ),
      ]);
      return {
        ...base,
        artifact_type: "INVESTMENT_MEMO_PDF",
        sections: [
          { key: "exec_summary", heading: "Executive Summary", body_markdown: executiveSummary },
          { key: "investment_thesis", heading: "Investment Thesis", body_markdown: investmentThesis },
          {
            key: "property_description",
            heading: "Property Description",
            body_markdown: buildDetailedParcelSummary(deal.parcels),
          },
          { key: "market_analysis", heading: "Market Analysis", body_markdown: marketAnalysis },
          { key: "financial_analysis", heading: "Financial Analysis", body_markdown: financialAnalysis },
          { key: "financial_snapshot", heading: "Financial Data", body_markdown: buildFinancialSnapshot(deal, triage) },
          { key: "risk_assessment", heading: "Risk Assessment", body_markdown: riskNarrative },
          {
            key: "risk_data",
            heading: "Risk Scores",
            body_markdown: `${formatRiskScores(triage)}\n\n${formatDisqualifiers(triage)}`,
          },
          { key: "business_plan", heading: "Development / Business Plan", body_markdown: businessPlan },
          {
            key: "deal_structure",
            heading: "Deal Structure",
            body_markdown: `**Product:** ${skuLabel(deal.sku)}\n**Jurisdiction:** ${deal.jurisdiction?.name ?? "N/A"}\n**Status:** ${deal.status}\n**Triage Decision:** ${String(triage.decision ?? "N/A")}\n**Confidence:** ${String(triage.confidence ?? "N/A")}`,
          },
          { key: "next_steps", heading: "Recommended Next Steps", body_markdown: formatNextActions(triage) },
        ],
      };
    }
    case "OFFERING_MEMO_PDF": {
      const triage = triageOutput!;
      const dealContext = buildDealContextForLLM(deal, triage);
      const systemPrompt =
        "You are a CRE marketing specialist at Gallagher Property Company, writing a professional offering memorandum to attract institutional buyers and investors. Write in polished marketing language that is factual and compelling. Use provided data — never fabricate.";
      const [executiveSummary, locationNarrative, marketOverview, incomeAnalysis] = await Promise.all([
        generateNarrative(
          `Write an executive summary (2-3 paragraphs) for this offering:\n\n${dealContext}\n\nHighlight: the opportunity, key investment metrics, entitlement status, and strategic value.`,
          systemPrompt,
          500,
        ),
        generateNarrative(
          `Write a location analysis section (2-3 paragraphs):\n\n${dealContext}\n\nDescribe: the property location in ${deal.jurisdiction?.name ?? "Louisiana"}, access and visibility, surrounding uses, proximity to infrastructure and economic drivers.`,
          systemPrompt,
          400,
        ),
        generateNarrative(
          `Write a market overview section (2-3 paragraphs):\n\n${dealContext}\n\nCover: ${skuLabel(deal.sku)} market dynamics in the area, vacancy rates, absorption trends, comparable lease rates, and growth outlook.`,
          systemPrompt,
          500,
        ),
        generateNarrative(
          `Write an income/financial analysis section (2-3 paragraphs):\n\n${dealContext}\n\nAddress: current or projected income, expense structure, NOI, cap rate, and return potential for a buyer.`,
          systemPrompt,
          400,
        ),
      ]);
      return {
        ...base,
        artifact_type: "OFFERING_MEMO_PDF",
        sections: [
          {
            key: "confidentiality",
            heading: "Confidentiality Notice",
            body_markdown:
              "This Offering Memorandum is provided solely for the purpose of evaluating the acquisition of the property described herein. By accepting this document, the recipient agrees to maintain the confidentiality of its contents.",
          },
          { key: "exec_summary", heading: "Executive Summary", body_markdown: executiveSummary },
          {
            key: "property_description",
            heading: "Property Description",
            body_markdown: buildDetailedParcelSummary(deal.parcels),
          },
          { key: "location", heading: "Location Analysis", body_markdown: locationNarrative },
          { key: "income_analysis", heading: "Financial Analysis", body_markdown: incomeAnalysis },
          { key: "financial_data", heading: "Financial Data", body_markdown: buildFinancialSnapshot(deal, triage) },
          { key: "market_overview", heading: "Market Overview", body_markdown: marketOverview },
          {
            key: "entitlement_status",
            heading: "Entitlement Status",
            body_markdown: `**Current Status:** ${deal.status}\n**Triage Decision:** ${String(triage.decision ?? "N/A")}\n**Confidence:** ${String(triage.confidence ?? "N/A")}\n\n${formatNextActions(triage)}`,
          },
          {
            key: "risk_summary",
            heading: "Risk Summary",
            body_markdown: formatRiskScores(triage),
          },
          {
            key: "site_conditions",
            heading: "Site Conditions & Environmental",
            body_markdown: deal.parcels
              .map((parcel) => {
                const items: string[] = [];
                if (parcel.floodZone) items.push(`Flood Zone: ${parcel.floodZone}`);
                if (parcel.soilsNotes) items.push(`Soils: ${parcel.soilsNotes}`);
                if (parcel.wetlandsNotes) items.push(`Wetlands: ${parcel.wetlandsNotes}`);
                if (parcel.envNotes) items.push(`Environmental: ${parcel.envNotes}`);
                return items.length > 0
                  ? `**${parcel.address}**\n${items.map((item) => `- ${item}`).join("\n")}`
                  : `**${parcel.address}**: No significant conditions noted.`;
              })
              .join("\n\n"),
          },
          {
            key: "contact",
            heading: "Contact Information",
            body_markdown:
              "For additional information or to schedule a site visit, please contact:\n\n**Gallagher Property Company**\nBaton Rouge, Louisiana\ngallagherpropco.com",
          },
        ],
      };
    }
    case "COMP_ANALYSIS_PDF": {
      const triage = triageOutput!;
      const allDeals = [deal, ...(comparisonDeals ?? [])];
      const comparisonItems = allDeals.map((comparisonDeal) => ({
        label: comparisonDeal.name,
        address: comparisonDeal.parcels.map((parcel) => parcel.address).join("; ") || "N/A",
        metrics: {
          "Product Type": skuLabel(comparisonDeal.sku),
          Jurisdiction: comparisonDeal.jurisdiction?.name ?? "N/A",
          "Total Acreage": totalAcreage(comparisonDeal.parcels),
          Zoning:
            [...new Set(comparisonDeal.parcels.map((parcel) => parcel.currentZoning).filter(Boolean))].join(", ") || "N/A",
          "Flood Zone":
            [...new Set(comparisonDeal.parcels.map((parcel) => parcel.floodZone).filter(Boolean))].join(", ") || "N/A",
          Status: comparisonDeal.status,
          "Parcel Count": String(comparisonDeal.parcels.length),
        },
      }));
      const comparisonContext = allDeals
        .map(
          (comparisonDeal) =>
            `${comparisonDeal.name}: ${skuLabel(comparisonDeal.sku)}, ${totalAcreage(comparisonDeal.parcels)} acres, ${comparisonDeal.jurisdiction?.name ?? "N/A"}, Status: ${comparisonDeal.status}, Parcels: ${comparisonDeal.parcels.length}`,
        )
        .join("\n");
      const recommendation = await generateNarrative(
        `Compare these ${allDeals.length} deals and provide a recommendation on which represents the best opportunity for a ${skuLabel(deal.sku)} investment:\n\n${comparisonContext}\n\nPrimary deal triage: Decision=${String(triage.decision)}, Confidence=${String(triage.confidence)}\n\nProvide a 2-3 paragraph recommendation covering relative strengths and weaknesses, and which deal (or combination) is most compelling.`,
        "You are a CRE investment analyst at Gallagher Property Company. Provide an objective comparison and recommendation based on available data. Be specific about trade-offs.",
        500,
      );
      return {
        ...base,
        artifact_type: "COMP_ANALYSIS_PDF",
        comparison_items: comparisonItems,
        recommendation,
        sections: [
          {
            key: "overview",
            heading: "Analysis Overview",
            body_markdown: `This comparative analysis evaluates ${allDeals.length} ${skuLabel(deal.sku)} opportunit${allDeals.length === 1 ? "y" : "ies"} across ${[...new Set(allDeals.map((comparisonDeal) => comparisonDeal.jurisdiction?.name).filter(Boolean))].join(", ") || "Louisiana"}.\n\n**Primary Deal:** ${deal.name}\n**Comparison Deals:** ${comparisonDeals?.map((comparisonDeal) => comparisonDeal.name).join(", ") || "None (single-deal analysis)"}`,
          },
          {
            key: "primary_detail",
            heading: `Primary Deal: ${deal.name}`,
            body_markdown: buildDetailedParcelSummary(deal.parcels),
          },
        ],
      };
    }
    case "IC_DECK_PPTX": {
      const triage = triageOutput!;
      const dealContext = buildDealContextForLLM(deal, triage);
      const systemPrompt =
        "You are a senior CRE investment analyst at Gallagher Property Company preparing an Investment Committee presentation. Write concise bullet points (not paragraphs). Each bullet should be a single key fact, metric, or recommendation. Use available deal data — never fabricate numbers. Be institutional-quality and data-driven.";
      const [marketBullets, financialBullets, riskBullets, planBullets, recommendationBullets] =
        await Promise.all([
          generateNarrative(
            `Generate 4-6 bullet points for a "Market Context" IC deck slide:\n\n${dealContext}\n\nCover: local market for ${skuLabel(deal.sku)} in ${deal.jurisdiction?.name ?? "Louisiana"}, supply/demand dynamics, comparable transactions, key drivers. Return ONLY bullet points, one per line, no numbering.`,
            systemPrompt,
            300,
          ),
          generateNarrative(
            `Generate 4-6 bullet points for a "Financial Projections" IC deck slide:\n\n${dealContext}\n\nCover: acquisition basis, development costs, projected NOI, target returns (IRR, cap rate, equity multiple), key assumptions. Return ONLY bullet points, one per line, no numbering.`,
            systemPrompt,
            300,
          ),
          generateNarrative(
            `Generate 4-6 bullet points for a "Risk Assessment" IC deck slide:\n\n${dealContext}\n\nCover: key risks from triage (environmental, entitlement, market, financial), proposed mitigants. Return ONLY bullet points, one per line, no numbering.`,
            systemPrompt,
            300,
          ),
          generateNarrative(
            `Generate 4-6 bullet points for a "Development Plan" IC deck slide:\n\n${dealContext}\n\nCover: entitlement timeline, site work, construction phases, lease-up/disposition strategy. Return ONLY bullet points, one per line, no numbering.`,
            systemPrompt,
            300,
          ),
          generateNarrative(
            `Generate 3-5 bullet points for a "Recommendation & Vote" IC deck slide:\n\n${dealContext}\n\nCover: recommended action (approve/hold/decline), key conditions, capital required, expected timeline to first returns. Return ONLY bullet points, one per line, no numbering.`,
            systemPrompt,
            250,
          ),
        ]);
      const parseBullets = (text: string): string[] =>
        text
          .split("\n")
          .map((line) => line.replace(/^[-\u2022*]\s*/, "").trim())
          .filter((line) => line.length > 0);
      const zonings = [...new Set(deal.parcels.map((parcel) => parcel.currentZoning).filter(Boolean))].join(", ") || "TBD";
      return {
        ...base,
        artifact_type: "IC_DECK_PPTX",
        slides: [
          {
            slide_no: 1,
            title: "Deal Overview",
            bullets: [
              `Deal: ${deal.name}`,
              `Product: ${skuLabel(deal.sku)}`,
              `Location: ${deal.jurisdiction?.name ?? "Louisiana"}`,
              `Total Acreage: ${totalAcreage(deal.parcels)} acres`,
              `Triage: ${String(triage.decision ?? "N/A")} (${String(triage.confidence ?? "N/A")})`,
            ],
            speaker_notes: "Introduce the deal to the Investment Committee. Cover the basic deal parameters and triage outcome.",
          },
          {
            slide_no: 2,
            title: "Site & Property",
            bullets: [
              ...deal.parcels.map((parcel) => `${parcel.address}${parcel.apn ? ` (APN: ${parcel.apn})` : ""}`),
              `Current Zoning: ${zonings}`,
              `Flood Zone: ${[...new Set(deal.parcels.map((parcel) => parcel.floodZone).filter(Boolean))].join(", ") || "See diligence"}`,
              `Parcels: ${deal.parcels.length}`,
            ],
            speaker_notes: "Walk through the site details, parcel composition, and current entitlement status.",
          },
          { slide_no: 3, title: "Market Context", bullets: parseBullets(marketBullets), speaker_notes: "Present the market analysis supporting this investment thesis. Reference comparable transactions and absorption data." },
          { slide_no: 4, title: "Financial Projections", bullets: parseBullets(financialBullets), speaker_notes: "Walk through the financial model assumptions and projected returns. Highlight sensitivity to key variables." },
          { slide_no: 5, title: "Risk Assessment", bullets: parseBullets(riskBullets), speaker_notes: "Address each key risk area and the proposed mitigation strategy. Reference triage scores." },
          { slide_no: 6, title: "Development Plan", bullets: parseBullets(planBullets), speaker_notes: "Outline the execution plan from closing through stabilization or disposition." },
          { slide_no: 7, title: "Recommendation & Vote", bullets: parseBullets(recommendationBullets), speaker_notes: "Present the recommendation and call for the IC vote. Summarize key conditions of approval." },
        ],
        sections: [],
      };
    }
  }
}

export async function listDealArtifacts(
  auth: ArtifactRouteAuth,
  dealId: string,
): Promise<{ artifacts: unknown[] }> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId: auth.orgId },
    select: { id: true },
  });
  if (!deal) {
    throw new DealArtifactRouteError(404, "Deal not found");
  }
  const artifacts = await prisma.artifact.findMany({
    where: { dealId, orgId: auth.orgId },
    orderBy: { createdAt: "desc" },
  });
  return { artifacts };
}

export async function generateDealArtifact(
  auth: ArtifactRouteAuth,
  dealId: string,
  artifactType: string,
  body: Record<string, unknown>,
  uploadArtifact: (
    auth: ArtifactRouteAuth,
    input: UploadArtifactInput,
  ) => Promise<UploadArtifactResult>,
): Promise<Record<string, unknown>> {
  if (!ARTIFACT_TYPES.includes(artifactType as ArtifactType)) {
    throw new DealArtifactRouteError(
      400,
      `Invalid artifactType. Must be one of: ${ARTIFACT_TYPES.join(", ")}`,
    );
  }

  const typedArtifactType = artifactType as ArtifactType;
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId: auth.orgId },
    include: {
      parcels: { orderBy: { createdAt: "asc" } },
      jurisdiction: true,
      terms: { select: { offerPrice: true, closingDate: true } },
      tenantLeases: {
        select: {
          rentPerSf: true,
          rentedAreaSf: true,
          startDate: true,
          endDate: true,
        },
      },
      outcome: {
        select: {
          actualNoiYear1: true,
          actualExitPrice: true,
          actualIrr: true,
          actualEquityMultiple: true,
        },
      },
    },
  });
  if (!deal) {
    throw new DealArtifactRouteError(404, "Deal not found");
  }

  const requiredStatus = STAGE_PREREQUISITES[typedArtifactType];
  if (!isAtOrPast(deal.status, requiredStatus)) {
    throw new DealArtifactRouteError(
      400,
      `Deal must be at ${requiredStatus} or later to generate ${typedArtifactType}. Current status: ${deal.status}`,
    );
  }

  const requiresParcels: ArtifactType[] = [
    "SUBMISSION_CHECKLIST_PDF",
    "HEARING_DECK_PPTX",
    "BUYER_TEASER_PDF",
    "OFFERING_MEMO_PDF",
  ];
  if (requiresParcels.includes(typedArtifactType) && deal.parcels.length === 0) {
    throw new DealArtifactRouteError(
      400,
      `At least one parcel is required to generate ${typedArtifactType}`,
    );
  }

  let triageOutput: Record<string, unknown> | null = null;
  const requiresTriage: ArtifactType[] = [
    "TRIAGE_PDF",
    "HEARING_DECK_PPTX",
    "EXIT_PACKAGE_PDF",
    "INVESTMENT_MEMO_PDF",
    "OFFERING_MEMO_PDF",
    "COMP_ANALYSIS_PDF",
    "IC_DECK_PPTX",
    "BUYER_TEASER_PDF",
  ];
  if (requiresTriage.includes(typedArtifactType)) {
    const triageRun = await prisma.run.findFirst({
      where: { dealId, orgId: auth.orgId, runType: "TRIAGE", status: "succeeded" },
      orderBy: { startedAt: "desc" },
      select: { outputJson: true },
    });
    if (!triageRun?.outputJson) {
      throw new DealArtifactRouteError(
        400,
        `A successful triage run is required to generate ${typedArtifactType}`,
      );
    }
    triageOutput = triageRun.outputJson as Record<string, unknown>;
  }

  let comparisonDeals: DealWithRelations[] | null = null;
  if (typedArtifactType === "COMP_ANALYSIS_PDF") {
    const comparisonDealIds = Array.isArray(body.comparisonDealIds)
      ? body.comparisonDealIds.filter((value): value is string => typeof value === "string")
      : [];
    if (comparisonDealIds.length > 0) {
      comparisonDeals = await prisma.deal.findMany({
        where: { id: { in: comparisonDealIds }, orgId: auth.orgId },
        include: {
          parcels: { orderBy: { createdAt: "asc" } },
          jurisdiction: true,
        },
      });
    }
  }

  const run = await prisma.run.create({
    data: {
      orgId: auth.orgId,
      dealId,
      runType: "ARTIFACT_GEN",
      status: "running",
    },
  });

  try {
    const spec = await buildArtifactSpec(
      typedArtifactType,
      deal as DealWithRelations & { jurisdictionId?: string },
      triageOutput,
      comparisonDeals,
    );
    const rendered = await renderArtifactFromSpec(spec);
    const latestArtifact = await prisma.artifact.findFirst({
      where: { dealId, artifactType: typedArtifactType },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latestArtifact?.version ?? 0) + 1;
    const uploaded = await uploadArtifact(auth, {
      dealId,
      artifactType: typedArtifactType,
      version,
      filename: rendered.filename,
      contentType: rendered.contentType,
      bytes: Buffer.from(rendered.bytes),
      generatedByRunId: run.id,
    });
    const artifact = await prisma.artifact.create({
      data: {
        orgId: auth.orgId,
        dealId,
        artifactType: typedArtifactType,
        version,
        storageObjectKey: uploaded.storageObjectKey,
        generatedByRunId: run.id,
      },
    });
    await prisma.run.update({
      where: { id: run.id },
      data: { status: "succeeded", finishedAt: new Date() },
    });
    return { artifact, run: { id: run.id, status: "succeeded" } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: errorMessage,
      },
    });
    if (error instanceof DealArtifactRouteError) {
      throw error;
    }
    throw new DealArtifactRouteError(500, `Artifact generation failed: ${errorMessage}`);
  }
}
