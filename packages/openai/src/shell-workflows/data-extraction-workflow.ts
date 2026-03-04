import { z } from "zod";

import { NETWORK_POLICIES } from "../network-policies.js";
import {
  buildPythonWorkflowCommand,
  runShellWorkflow,
} from "./runner.js";

const EXTRACTION_INPUT_ARTIFACT_PATH = "/workspace/artifacts/data-extraction/input.json";
const EXTRACTION_OUTPUT_ARTIFACT_PATH = "/workspace/artifacts/data-extraction/result.json";
const EXTRACTION_SKILL_ARTIFACT_PATH = "/workspace/artifacts/data-extraction/skill.md";

const DataExtractionRuleSchema = z.object({
  name: z.string().min(1),
  pattern: z.string().min(1),
});

const DataExtractionArtifactSchema = z.object({
  sourceName: z.string().min(1),
  dataFetchStatus: z.string().min(1),
  matches: z.array(
    z.object({
      name: z.string().min(1),
      values: z.array(z.string()),
    }),
  ),
  failedRules: z.array(
    z.object({
      name: z.string().min(1),
      error: z.string().min(1),
    }),
  ),
});

export const DataExtractionWorkflowInputSchema = z.object({
  sourceName: z.string().min(1),
  sourceApiUrl: z.string().min(1).optional(),
  rawText: z.string().min(1),
  rules: z.array(DataExtractionRuleSchema).min(1),
  model: z.string().min(1).optional(),
});

export const DataExtractionWorkflowResultSchema = DataExtractionArtifactSchema.extend({
  artifactPath: z.string().min(1),
  responseId: z.string().nullable(),
  sessionId: z.string().nullable(),
});

export type DataExtractionWorkflowInput = z.infer<typeof DataExtractionWorkflowInputSchema>;
export type DataExtractionWorkflowResult = z.infer<typeof DataExtractionWorkflowResultSchema>;

export async function runDataExtractionWorkflow(
  rawInput: DataExtractionWorkflowInput,
): Promise<DataExtractionWorkflowResult> {
  return runShellWorkflow({
    rawInput,
    inputSchema: DataExtractionWorkflowInputSchema,
    artifactSchema: DataExtractionArtifactSchema,
    paths: {
      inputArtifactPath: EXTRACTION_INPUT_ARTIFACT_PATH,
      outputArtifactPath: EXTRACTION_OUTPUT_ARTIFACT_PATH,
      skillArtifactPath: EXTRACTION_SKILL_ARTIFACT_PATH,
    },
    skillInstructionPath: "data-extraction/SKILL.md",
    model: rawInput.model,
    policy: NETWORK_POLICIES.LOCAL_GATEWAY,
    buildCommand: (context) =>
      buildPythonWorkflowCommand(context, {
        imports: ["import os", "import re", "import urllib.error", "import urllib.request"],
        requiredSkill: "data-extraction",
        scriptLines: [
          "api_url = payload.get('sourceApiUrl') or 'https://api.gallagherpropco.com/health'",
          "headers = {}",
          "gateway_key = os.getenv('GATEWAY_KEY')",
          "if gateway_key:",
          "  headers['Authorization'] = f'Bearer {gateway_key}'",
          "request = urllib.request.Request(api_url, headers=headers)",
          "fetch_status = 'not_attempted'",
          "try:",
          "  with urllib.request.urlopen(request, timeout=5) as response:",
          "    fetch_status = f'ok:{response.status}'",
          "except urllib.error.URLError as err:",
          "  fetch_status = f'failed:{err.reason}'",
          "raw_text = payload['rawText']",
          "matches = []",
          "failed_rules = []",
          "for rule in payload['rules']:",
          "  name = rule['name']",
          "  pattern = rule['pattern']",
          "  try:",
          "    found = re.findall(pattern, raw_text, flags=re.MULTILINE)",
          "    normalized = [value if isinstance(value, str) else ' '.join(value) for value in found]",
          "    matches.append({'name': name, 'values': normalized})",
          "  except re.error as err:",
          "    failed_rules.append({'name': name, 'error': str(err)})",
          "result = {",
          "  'sourceName': payload['sourceName'],",
          "  'dataFetchStatus': fetch_status,",
          "  'matches': matches,",
          "  'failedRules': failed_rules,",
          "}",
        ],
      }),
  }).then((result) => DataExtractionWorkflowResultSchema.parse(result));
}
