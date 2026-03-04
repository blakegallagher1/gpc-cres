import { z } from "zod";

import { NETWORK_POLICIES } from "../network-policies.js";
import {
  buildPythonWorkflowCommand,
  runShellWorkflow,
} from "./runner.js";

const UNDERWRITING_INPUT_ARTIFACT_PATH = "/workspace/artifacts/underwriting/input.json";
const UNDERWRITING_OUTPUT_ARTIFACT_PATH = "/workspace/artifacts/underwriting/result.json";
const UNDERWRITING_SKILL_ARTIFACT_PATH = "/workspace/artifacts/underwriting/skill.md";

export const UnderwritingArtifactSchema = z.object({
  propertyName: z.string().min(1),
  dscr: z.number().finite(),
  impliedValue: z.number().finite(),
});

export const UnderwritingWorkflowInputSchema = z.object({
  propertyName: z.string().min(1),
  netOperatingIncome: z.number().finite(),
  annualDebtService: z.number().positive(),
  capRate: z.number().positive().max(1),
  model: z.string().min(1).optional(),
});

export const UnderwritingWorkflowResultSchema = UnderwritingArtifactSchema.extend({
  artifactPath: z.string().min(1),
  responseId: z.string().nullable(),
  sessionId: z.string().nullable(),
});

export type UnderwritingWorkflowInput = z.infer<typeof UnderwritingWorkflowInputSchema>;
export type UnderwritingWorkflowResult = z.infer<typeof UnderwritingWorkflowResultSchema>;

export async function runUnderwritingWorkflow(
  rawInput: UnderwritingWorkflowInput,
): Promise<UnderwritingWorkflowResult> {
  return runShellWorkflow({
    rawInput,
    inputSchema: UnderwritingWorkflowInputSchema,
    artifactSchema: UnderwritingArtifactSchema,
    paths: {
      inputArtifactPath: UNDERWRITING_INPUT_ARTIFACT_PATH,
      outputArtifactPath: UNDERWRITING_OUTPUT_ARTIFACT_PATH,
      skillArtifactPath: UNDERWRITING_SKILL_ARTIFACT_PATH,
    },
    skillInstructionPath: "underwriting/SKILL.md",
    model: rawInput.model,
    policy: NETWORK_POLICIES.DENY_ALL,
    buildCommand: (context) =>
      buildPythonWorkflowCommand(context, {
        requiredSkill: "underwriting",
        scriptLines: [
          "noi = float(payload['netOperatingIncome'])",
          "debt_service = float(payload['annualDebtService'])",
          "cap_rate = float(payload['capRate'])",
          "result = {",
          "  'propertyName': payload['propertyName'],",
          "  'dscr': round(noi / debt_service, 4),",
          "  'impliedValue': round(noi / cap_rate, 2),",
          "}",
        ],
      }),
  }).then((result) => UnderwritingWorkflowResultSchema.parse(result));
}
