import { describe, expect, it } from "vitest";

import {
  buildOpportunityScorecard,
  buildScenarioEnvelopeFromTriage,
  OpportunityScorecardSchema,
  type ParcelTriage,
} from "../src/index.js";

function buildSampleTriage(overrides: Partial<ParcelTriage> = {}): ParcelTriage {
  return {
    schema_version: "1.0",
    generated_at: "2026-02-11T00:00:00.000Z",
    deal_id: "deal-1",
    decision: "ADVANCE",
    recommended_path: "CUP",
    rationale: "Strong access and utilities with manageable politics risk.",
    risk_scores: {
      access: 3,
      drainage: 4,
      adjacency: 4,
      env: 2,
      utilities: 3,
      politics: 5,
    },
    disqualifiers: [],
    next_actions: [
      {
        title: "Schedule pre-application meeting",
        description: "Confirm process path with planning staff.",
        pipeline_step: 3,
        due_in_days: 7,
      },
    ],
    assumptions: [
      {
        assumption: "No major utility extension is required.",
        impact: "Keeps schedule within six months.",
        sources: ["src-1"],
      },
    ],
    sources_summary: ["Planning code excerpt", "Recent permits register"],
    ...overrides,
  };
}

describe("buildScenarioEnvelopeFromTriage", () => {
  it("produces deterministic hashes and change tracking", () => {
    const triage = buildSampleTriage();
    const first = buildScenarioEnvelopeFromTriage(triage);
    const second = buildScenarioEnvelopeFromTriage(triage);

    expect(first.base.assumptions_hash).toBe(second.base.assumptions_hash);
    expect(first.upside.assumptions_hash).toBe(second.upside.assumptions_hash);
    expect(first.downside.assumptions_hash).toBe(second.downside.assumptions_hash);
    expect(first.changes.length).toBeGreaterThan(0);
  });
});

describe("buildOpportunityScorecard", () => {
  it("separates descriptive and prescriptive analytics by stage", () => {
    const triage = buildSampleTriage();
    const scorecard = buildOpportunityScorecard({
      dealId: triage.deal_id,
      triage,
      rerunPolicy: {
        input_hash: "a".repeat(64),
        deterministic: true,
        rerun_reason: "test_case",
      },
    });

    expect(scorecard.stage_assessments.intake.descriptive.status).toBe("complete");
    expect(scorecard.stage_assessments.intake.prescriptive.status).toBe("complete");
    expect(scorecard.stage_assessments.underwriting.prescriptive.recommendation).toBe("PENDING");
    expect(scorecard.scenario_envelope.base.parameters.length).toBeGreaterThan(0);
    expect(scorecard.overall_recommendation).toBe("ADVANCE");

    const parsed = OpportunityScorecardSchema.parse(scorecard);
    expect(parsed.rerun_policy.deterministic).toBe(true);
  });
});
