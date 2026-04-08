export type OpportunityFeedbackSignal = "new" | "seen" | "pursued" | "dismissed";

export interface OpportunityParcelData {
  parish?: string | null;
  parcelUid?: string | null;
  ownerName?: string | null;
  address?: string | null;
  acreage?: number | null;
  lat?: number | null;
  lng?: number | null;
}

export interface OpportunitySavedSearchContext {
  id: string;
  name: string;
  criteria?: Record<string, unknown> | null;
}

export interface OpportunityMatchForThesis {
  id: string;
  parcelId: string;
  matchScore: number | string;
  matchedCriteria?: Record<string, unknown> | null;
  parcelData: OpportunityParcelData;
  savedSearch: OpportunitySavedSearchContext;
  createdAt: string | Date;
  seenAt?: string | Date | null;
  pursuedAt?: string | Date | null;
  dismissedAt?: string | Date | null;
}

export interface OpportunityFeedbackProfile {
  positiveCount: number;
  negativeCount: number;
  confidence: number;
  parishWeights: Record<string, number>;
  pursuedAcreageMedian: number | null;
  pursuedAcreageWindow: number | null;
}

export interface OpportunityThesis {
  summary: string;
  whyNow: string;
  angle: string;
  nextBestAction: string;
  confidence: number;
  keyRisks: string[];
  signals: string[];
}

export interface EnrichedOpportunityMatch extends OpportunityMatchForThesis {
  priorityScore: number;
  feedbackSignal: OpportunityFeedbackSignal;
  thesis: OpportunityThesis;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: number | string): number {
  const num = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid] ?? null;
}

function formatAcreage(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${round2(value)} ac`;
}

function hasPositiveMatchFlag(value: Record<string, unknown> | null | undefined): boolean {
  if (!value) return false;
  return Object.values(value).some((entry) => entry === true);
}

export function deriveOpportunityFeedbackSignal(
  match: Pick<OpportunityMatchForThesis, "dismissedAt" | "pursuedAt" | "seenAt">,
): OpportunityFeedbackSignal {
  if (match.dismissedAt) return "dismissed";
  if (match.pursuedAt) return "pursued";
  if (match.seenAt) return "seen";
  return "new";
}

export function buildOpportunityFeedbackProfile(
  history: OpportunityMatchForThesis[],
): OpportunityFeedbackProfile {
  const parishWeights = new Map<string, number>();
  const pursuedAcreages: number[] = [];
  let positiveCount = 0;
  let negativeCount = 0;

  for (const match of history) {
    const parishKey = normalizeKey(match.parcelData.parish);
    const acreage = match.parcelData.acreage;
    const signal = deriveOpportunityFeedbackSignal(match);

    let delta = 0;
    if (signal === "pursued") {
      delta = 1.5;
      positiveCount += 1;
      if (typeof acreage === "number" && Number.isFinite(acreage)) {
        pursuedAcreages.push(acreage);
      }
    } else if (signal === "dismissed") {
      delta = -1;
      negativeCount += 1;
    } else if (signal === "seen") {
      delta = 0.15;
    }

    if (!parishKey || delta === 0) continue;
    parishWeights.set(parishKey, (parishWeights.get(parishKey) ?? 0) + delta);
  }

  const pursuedAcreageMedian = median(pursuedAcreages);
  const pursuedAcreageWindow =
    pursuedAcreageMedian === null ? null : Math.max(1, round2(pursuedAcreageMedian * 0.35));
  const confidence = clamp((positiveCount + negativeCount * 0.75) / 8, 0, 1);

  return {
    positiveCount,
    negativeCount,
    confidence: round2(confidence),
    parishWeights: Object.fromEntries(parishWeights.entries()),
    pursuedAcreageMedian,
    pursuedAcreageWindow,
  };
}

export function scoreOpportunityPriority(
  match: OpportunityMatchForThesis,
  profile: OpportunityFeedbackProfile,
): number {
  const signal = deriveOpportunityFeedbackSignal(match);
  let score = clamp(toNumber(match.matchScore), 0, 100);

  const parishWeight = profile.parishWeights[normalizeKey(match.parcelData.parish)] ?? 0;
  score += parishWeight * (6 + profile.confidence * 6);

  const acreage = match.parcelData.acreage;
  if (
    typeof acreage === "number" &&
    Number.isFinite(acreage) &&
    profile.pursuedAcreageMedian !== null &&
    profile.pursuedAcreageWindow !== null
  ) {
    const distance = Math.abs(acreage - profile.pursuedAcreageMedian);
    if (distance <= profile.pursuedAcreageWindow) {
      score += 6 * (1 - distance / profile.pursuedAcreageWindow);
    } else if (profile.confidence >= 0.4) {
      score -= Math.min(6, (distance / profile.pursuedAcreageWindow - 1) * 2);
    }
  }

  if (!(match.parcelData.lat && match.parcelData.lng)) score -= 2;
  if (match.parcelData.acreage === null || typeof match.parcelData.acreage === "undefined") {
    score -= 2;
  }
  if (!match.parcelData.address?.trim()) score -= 3;

  if (signal === "pursued") score = Math.max(score, 95);
  if (signal === "dismissed") score = Math.min(score, 20);

  return round2(clamp(score, 0, 100));
}

export function buildOpportunityThesis(
  match: OpportunityMatchForThesis,
  profile: OpportunityFeedbackProfile,
  priorityScore: number = scoreOpportunityPriority(match, profile),
): OpportunityThesis {
  const parish = match.parcelData.parish?.trim() || "the target parish";
  const acreageLabel = formatAcreage(match.parcelData.acreage);
  const signal = deriveOpportunityFeedbackSignal(match);
  const parishWeight = profile.parishWeights[normalizeKey(match.parcelData.parish)] ?? 0;
  const matchedCriteria = match.matchedCriteria ?? {};
  const matchedSavedSearch = hasPositiveMatchFlag(matchedCriteria);

  const signals = [`Matches saved search "${match.savedSearch.name}"`];
  if (matchedCriteria.parish === true) {
    signals.push(`Inside the saved parish filter for ${parish}`);
  }
  if (matchedCriteria.acreageInRange === true) {
    signals.push("Acreage sits inside the saved target band");
  }
  if (parishWeight > 0.4) {
    signals.push(`Operator history is positive in ${parish}`);
  } else if (parishWeight < -0.4) {
    signals.push(`Operator history is weak in ${parish}`);
  }
  if (priorityScore >= 80) {
    signals.push("Composite ranking is already in the high-priority band");
  }
  if (signal === "pursued") {
    signals.push("This parcel has already been marked for pursuit");
  }

  const whyNowParts = [
    `Fresh parcel match for "${match.savedSearch.name}" with a learned priority score of ${Math.round(priorityScore)}.`,
  ];
  if (parishWeight > 0.4) {
    whyNowParts.push(
      `Your recent pursued opportunities cluster in ${parish}, so the engine is giving this market extra weight.`,
    );
  } else if (matchedSavedSearch) {
    whyNowParts.push(
      "The parcel is aligned with one or more explicit saved-search criteria, so it cleared the first-pass filter without manual triage.",
    );
  } else {
    whyNowParts.push(
      "The parcel cleared the baseline saved-search filter and surfaced as a fresh candidate for review.",
    );
  }

  const angleParts = [acresOrFallback(acreageLabel), parish];
  const anglePrefix = priorityScore >= 80 ? "High-conviction follow-up" : "Promising follow-up";
  const angle = `${anglePrefix} around ${angleParts.join(" in ")} tied to "${match.savedSearch.name}".`;

  const keyRisks: string[] = [];
  if (!acreageLabel) {
    keyRisks.push("Cached parcel data does not include acreage yet, which weakens fit scoring.");
  }
  if (!(match.parcelData.lat && match.parcelData.lng)) {
    keyRisks.push(
      "Parcel coordinates are missing, so map/comps diligence is incomplete until geometry is verified.",
    );
  }
  if (profile.confidence < 0.45) {
    keyRisks.push("The feedback loop is still sparse, so ranking leans more on rules than learned taste.");
  }
  if (!matchedSavedSearch) {
    keyRisks.push(
      "Matched-criteria evidence is thin, so this may be a broader saved-search hit rather than a tightly qualified parcel.",
    );
  }
  if (keyRisks.length === 0) {
    keyRisks.push(
      "No material structural risk surfaced from the cached parcel snapshot; validate with comps and geometry next.",
    );
  }

  let nextBestAction = "Open the parcel on the map, review nearby comps, and decide whether to create a deal.";
  if (!(match.parcelData.lat && match.parcelData.lng)) {
    nextBestAction = "Verify parcel geometry and coordinates before spending more diligence time.";
  } else if (priorityScore >= 82 || signal === "pursued") {
    nextBestAction =
      "Create or continue the deal record now, then run comps and parcel geometry review while the thesis is fresh.";
  } else if (parishWeight > 0.4) {
    nextBestAction = `Compare this parcel against other pursued ${parish} opportunities before deciding whether to escalate.`;
  }

  const confidence = round2(clamp(priorityScore / 100 * 0.65 + profile.confidence * 0.35, 0, 1));
  const summary = `${match.parcelData.address || "This parcel"} is a ${priorityScore >= 80 ? "high" : "medium"}-priority match for "${match.savedSearch.name}".`;

  return {
    summary,
    whyNow: whyNowParts.join(" "),
    angle,
    nextBestAction,
    confidence,
    keyRisks,
    signals,
  };
}

function acresOrFallback(value: string | null): string {
  return value ?? "an unverified acreage parcel";
}

export function enrichOpportunityMatch(
  match: OpportunityMatchForThesis,
  profile: OpportunityFeedbackProfile,
): EnrichedOpportunityMatch {
  const priorityScore = scoreOpportunityPriority(match, profile);
  return {
    ...match,
    priorityScore,
    feedbackSignal: deriveOpportunityFeedbackSignal(match),
    thesis: buildOpportunityThesis(match, profile, priorityScore),
  };
}
