import { hashJsonSha256 } from "../crypto/sha256.js";
import type { ParcelTriage } from "../schemas/parcelTriage.js";
import {
  OpportunityScorecardSchema,
  type OpportunityScorecard,
  type ScenarioEnvelope,
} from "../schemas/opportunityScorecard.js";

const TIMELINE_MONTHS_BY_PATH: Record<string, number> = {
  CUP: 6,
  REZONING: 12,
  VARIANCE: 4,
  UNKNOWN: 9,
};

type DecisionRecommendation = OpportunityScorecard["overall_recommendation"];

type ScorecardBuilderParams = {
  dealId: string;
  triage: ParcelTriage;
  evidenceReferences?: OpportunityScorecard["evidence_references"];
  rerunPolicy: OpportunityScorecard["rerun_policy"];
};

type ScenarioParam = ScenarioEnvelope["base"]["parameters"][number];

export function buildScenarioEnvelopeFromTriage(triage: ParcelTriage): ScenarioEnvelope {
  const avgRisk = round2(
    Object.values(triage.risk_scores).reduce((sum, score) => sum + score, 0) /
      Math.max(Object.keys(triage.risk_scores).length, 1),
  );

  const decisionConfidence = deriveConfidence(triage.decision, triage.risk_scores.politics, avgRisk);
  const timelineBase = TIMELINE_MONTHS_BY_PATH[triage.recommended_path] ?? TIMELINE_MONTHS_BY_PATH.UNKNOWN;

  const baseParameters: ScenarioParam[] = [
    {
      key: "entitlement_probability_pct",
      value: round2(decisionConfidence * 100),
      unit: "percent",
      provenance: "derived_from_triage_decision_and_risk_scores",
      evidence_refs: [],
    },
    {
      key: "execution_risk_index",
      value: avgRisk,
      unit: "0-10",
      provenance: "average_of_triage_risk_scores",
      evidence_refs: [],
    },
    {
      key: "expected_timeline_months",
      value: timelineBase,
      unit: "months",
      provenance: "mapped_from_recommended_path",
      evidence_refs: [],
    },
  ];

  const upsideParameters: ScenarioParam[] = [
    {
      key: "entitlement_probability_pct",
      value: round2(asNumber(baseParameters, "entitlement_probability_pct") * 1.1),
      unit: "percent",
      provenance: "base * 1.10",
      evidence_refs: [],
    },
    {
      key: "execution_risk_index",
      value: round2(asNumber(baseParameters, "execution_risk_index") * 0.85),
      unit: "0-10",
      provenance: "base * 0.85",
      evidence_refs: [],
    },
    {
      key: "expected_timeline_months",
      value: round2(asNumber(baseParameters, "expected_timeline_months") * 0.9),
      unit: "months",
      provenance: "base * 0.90",
      evidence_refs: [],
    },
  ];

  const downsideParameters: ScenarioParam[] = [
    {
      key: "entitlement_probability_pct",
      value: round2(asNumber(baseParameters, "entitlement_probability_pct") * 0.8),
      unit: "percent",
      provenance: "base * 0.80",
      evidence_refs: [],
    },
    {
      key: "execution_risk_index",
      value: round2(asNumber(baseParameters, "execution_risk_index") * 1.2),
      unit: "0-10",
      provenance: "base * 1.20",
      evidence_refs: [],
    },
    {
      key: "expected_timeline_months",
      value: round2(asNumber(baseParameters, "expected_timeline_months") * 1.2),
      unit: "months",
      provenance: "base * 1.20",
      evidence_refs: [],
    },
  ];

  return {
    base: {
      name: "base",
      assumptions_hash: hashJsonSha256(baseParameters),
      parameters: baseParameters,
    },
    upside: {
      name: "upside",
      assumptions_hash: hashJsonSha256(upsideParameters),
      parameters: upsideParameters,
    },
    downside: {
      name: "downside",
      assumptions_hash: hashJsonSha256(downsideParameters),
      parameters: downsideParameters,
    },
    changes: [
      ...buildScenarioChanges("upside", baseParameters, upsideParameters, "upside case stress adjustment"),
      ...buildScenarioChanges(
        "downside",
        baseParameters,
        downsideParameters,
        "downside case stress adjustment",
      ),
    ],
  };
}

export function buildOpportunityScorecard(params: ScorecardBuilderParams): OpportunityScorecard {
  const scenarioEnvelope = buildScenarioEnvelopeFromTriage(params.triage);

  const intakeConfidence = deriveConfidence(
    params.triage.decision,
    params.triage.risk_scores.politics,
    asNumber(scenarioEnvelope.base.parameters, "execution_risk_index"),
  );
  const overallRecommendation = normalizeRecommendation(params.triage.decision);

  const scorecard: OpportunityScorecard = {
    schema_version: "1.0",
    generated_at: params.triage.generated_at,
    deal_id: params.dealId,
    overall_recommendation: overallRecommendation,
    overall_confidence: intakeConfidence,
    evidence_references: params.evidenceReferences ?? [],
    stage_assessments: {
      intake: {
        stage: "intake",
        descriptive: {
          status: "complete",
          summary: params.triage.rationale,
          confidence: intakeConfidence,
          evidence_refs: [],
          facts: [
            {
              metric: "triage_decision",
              value: params.triage.decision,
              evidence_refs: [],
            },
            {
              metric: "recommended_path",
              value: params.triage.recommended_path,
              evidence_refs: [],
            },
          ],
        },
        prescriptive: {
          status: "complete",
          recommendation: overallRecommendation,
          rationale: params.triage.rationale,
          confidence: intakeConfidence,
          actions: params.triage.next_actions.map((action) => ({
            title: action.title,
            description: action.description,
            due_in_days: action.due_in_days,
            evidence_refs: [],
          })),
          evidence_refs: [],
        },
      },
      underwriting: pendingStage("underwriting"),
      entitlement_probability: {
        stage: "entitlement_probability",
        descriptive: {
          status: "provisional",
          summary: "Entitlement probability estimated from triage risk profile.",
          confidence: intakeConfidence,
          evidence_refs: [],
          facts: [
            {
              metric: "entitlement_probability_pct_base",
              value: asNumber(scenarioEnvelope.base.parameters, "entitlement_probability_pct"),
              unit: "percent",
              evidence_refs: [],
            },
          ],
        },
        prescriptive: {
          status: "provisional",
          recommendation: overallRecommendation,
          rationale: "Initial estimate uses triage-only inputs; validate with underwriting and municipal diligence.",
          confidence: round2(Math.max(0.3, intakeConfidence - 0.15)),
          actions: [
            {
              title: "Validate entitlement timeline assumptions",
              description: "Confirm path timing with jurisdiction process constraints.",
              due_in_days: 7,
              evidence_refs: [],
            },
          ],
          evidence_refs: [],
        },
      },
      execution_risk: {
        stage: "execution_risk",
        descriptive: {
          status: "provisional",
          summary: "Execution risk derived from average triage risk dimension scores.",
          confidence: intakeConfidence,
          evidence_refs: [],
          facts: [
            {
              metric: "execution_risk_index_base",
              value: asNumber(scenarioEnvelope.base.parameters, "execution_risk_index"),
              unit: "0-10",
              evidence_refs: [],
            },
          ],
        },
        prescriptive: {
          status: "provisional",
          recommendation: params.triage.decision === "ADVANCE" ? "INVESTIGATE" : overallRecommendation,
          rationale: "Risk score is preliminary and should be pressure-tested against utility, environmental, and politics diligence.",
          confidence: round2(Math.max(0.3, intakeConfidence - 0.1)),
          actions: [
            {
              title: "Run execution risk deep-dive",
              description: "Expand hard constraints and permitting friction review before commitment.",
              due_in_days: 5,
              evidence_refs: [],
            },
          ],
          evidence_refs: [],
        },
      },
      exit_confidence: pendingStage("exit_confidence"),
    },
    scenario_envelope: scenarioEnvelope,
    rerun_policy: params.rerunPolicy,
  };

  return OpportunityScorecardSchema.parse(scorecard);
}

function pendingStage(
  stage: OpportunityScorecard["stage_assessments"]["underwriting"]["stage"],
): OpportunityScorecard["stage_assessments"]["underwriting"] {
  return {
    stage,
    descriptive: {
      status: "pending",
      summary: "Stage not yet evaluated.",
      facts: [],
      confidence: 0,
      evidence_refs: [],
    },
    prescriptive: {
      status: "pending",
      recommendation: "PENDING",
      rationale: "Awaiting additional inputs.",
      confidence: 0,
      actions: [],
      evidence_refs: [],
    },
  };
}

function normalizeRecommendation(value: ParcelTriage["decision"]): DecisionRecommendation {
  if (value === "ADVANCE" || value === "HOLD" || value === "KILL") {
    return value;
  }
  return "INVESTIGATE";
}

function deriveConfidence(decision: ParcelTriage["decision"], politicsRisk: number, avgRisk: number): number {
  const decisionBase: Record<ParcelTriage["decision"], number> = {
    ADVANCE: 0.78,
    HOLD: 0.62,
    KILL: 0.82,
  };

  const riskPenalty = ((politicsRisk + avgRisk) / 20) * 0.2;
  return round2(Math.min(0.95, Math.max(0.35, decisionBase[decision] - riskPenalty)));
}

function asNumber(parameters: ScenarioParam[], key: string): number {
  const param = parameters.find((item) => item.key === key);
  if (!param || typeof param.value !== "number") {
    throw new Error(`Scenario parameter ${key} is missing or not numeric`);
  }
  return param.value;
}

function buildScenarioChanges(
  scenario: "upside" | "downside",
  base: ScenarioParam[],
  variant: ScenarioParam[],
  rationale: string,
): ScenarioEnvelope["changes"] {
  const byKey = new Map(base.map((item) => [item.key, item]));

  return variant
    .map((item) => {
      const original = byKey.get(item.key);
      if (!original) {
        return null;
      }

      if (original.value === item.value) {
        return null;
      }

      return {
        scenario,
        key: item.key,
        from: original.value,
        to: item.value,
        rationale,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
