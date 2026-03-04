import { z } from "zod";
import { randomUUID } from "node:crypto";
import { parse, join } from "node:path";

import { withShell } from "../shell.js";
import { loadSkillInstructions } from "./skill-loader.js";
import type { CreateShellSessionOptions } from "../shell.js";

export type ShellWorkflowPaths = {
  inputArtifactPath: string;
  outputArtifactPath: string;
  skillArtifactPath: string;
};

export type ShellCommandContext = {
  inputPath: string;
  outputPath: string;
  skillPath: string;
};

export type PythonWorkflowCommandOptions = {
  /**
   * Additional Python imports needed by the workflow, e.g. ["import os"].
   */
  imports?: string[];
  /**
   * Optional skill slug checked for existence inside the skill artifact.
   */
  requiredSkill?: string;
  /**
   * Workflow python logic that computes `result`.
   */
  scriptLines: string[];
};

function dedupeLines(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const trimmed = value.trim();
    if (seen.has(trimmed)) {
      return false;
    }
    seen.add(trimmed);
    return true;
  });
}

function buildRequiredSkillGuard(requiredSkill: string): string[] {
  return [
    "skill_text = skill_path.read_text()",
    "if not skill_text.strip():",
    "  raise RuntimeError('Loaded skill instructions are empty')",
    "required_skill = " + JSON.stringify(requiredSkill),
    "frontmatter_match = re.search(r" +
      "'\\A\\*\\*\\*[\\r\\n]+([\\s\\S]*?)[\\r\\n]+\\*\\*\\*',",
    "                                       skill_text)",
    "if not frontmatter_match:",
    "  raise RuntimeError('Skill frontmatter header is missing')",
    "frontmatter = frontmatter_match.group(1)",
    "name_match = re.search(r'^name:\\s*(.+)$', frontmatter, flags=re.MULTILINE)",
    "if not name_match:",
    "  raise RuntimeError('Skill frontmatter did not define a name')",
    "if name_match.group(1).strip() != required_skill:",
    "  raise RuntimeError(f'Skill name mismatch: expected {required_skill} got {name_match.group(1).strip()}')",
  ];
}

export function buildPythonWorkflowCommand(
  context: ShellCommandContext,
  options: PythonWorkflowCommandOptions,
): string[] {
  const importLines = dedupeLines([
    "import json",
    "from pathlib import Path",
    ...(options.imports ?? []),
    ...(options.requiredSkill ? ["import re"] : []),
  ]);

  const guardLines = options.requiredSkill
    ? buildRequiredSkillGuard(options.requiredSkill)
    : [];

  return [
    "python3 - <<'PY'",
    ...importLines,
    "",
    `input_path = Path(${JSON.stringify(context.inputPath)})`,
    `output_path = Path(${JSON.stringify(context.outputPath)})`,
    `skill_path = Path(${JSON.stringify(context.skillPath)})`,
    "payload = json.loads(input_path.read_text())",
    ...guardLines,
    ...options.scriptLines,
    "output_path.parent.mkdir(parents=True, exist_ok=True)",
    "output_path.write_text(json.dumps(result))",
    "print(output_path.as_posix())",
    "PY",
  ];
}

type WorkflowRunOptions<TInput, TArtifact> = {
  rawInput: TInput;
  inputSchema: z.ZodType<TInput>;
  artifactSchema: z.ZodType<TArtifact>;
  paths: ShellWorkflowPaths;
  skillInstructionPath: string;
  buildCommand: (context: ShellCommandContext) => string[];
  model?: string;
  policy?: CreateShellSessionOptions["policy"];
  reuse?: boolean;
  trackSession?: boolean;
  preserveSession?: boolean;
};

type WorkflowRunResult<TArtifact> = TArtifact & {
  artifactPath: string;
  responseId: string | null;
  sessionId: string | null;
};

function withRunScopedPath(pathTemplate: string, runId: string): string {
  const parsed = parse(pathTemplate);
  const sanitizedRunId = runId.replace(/-/g, "").slice(0, 12);
  const filename = `${parsed.name}-${sanitizedRunId}${parsed.ext}`;
  if (!parsed.dir || parsed.dir === ".") {
    return filename;
  }
  return join(parsed.dir, filename);
}

function applyRunScopeToPaths(
  paths: ShellWorkflowPaths,
  runId: string,
): ShellWorkflowPaths {
  return {
    inputArtifactPath: withRunScopedPath(paths.inputArtifactPath, runId),
    outputArtifactPath: withRunScopedPath(paths.outputArtifactPath, runId),
    skillArtifactPath: withRunScopedPath(paths.skillArtifactPath, runId),
  };
}

function parseArtifactJson<T>(raw: string, schema: z.ZodType<T>, path: string): T {
  try {
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse workflow artifact ${path}: ${message}`);
  }
}

export async function runShellWorkflow<TInput, TArtifact>(
  options: WorkflowRunOptions<TInput, TArtifact>,
): Promise<WorkflowRunResult<TArtifact>> {
  const input = options.inputSchema.parse(options.rawInput);
  const skillInstructions = await loadSkillInstructions(options.skillInstructionPath);
  const runId = randomUUID();
  const scopedPaths = applyRunScopeToPaths(options.paths, runId);
  const { inputArtifactPath, outputArtifactPath, skillArtifactPath } = scopedPaths;

  return withShell(
    {
      model: options.model,
      policy: options.policy,
      reuse: options.reuse,
      trackSession: options.trackSession,
      preserveSession: options.preserveSession,
    },
    async (shell) => {
      await shell.writeFile(inputArtifactPath, JSON.stringify(input, null, 2));
      await shell.writeFile(skillArtifactPath, skillInstructions);

      const commandLines = options.buildCommand({
        inputPath: inputArtifactPath,
        outputPath: outputArtifactPath,
        skillPath: skillArtifactPath,
      });

      const execResult = await shell.exec({
        command: commandLines.join("\n"),
        timeoutMs: 60_000,
        maxOutputChars: 200_000,
      });

      if (execResult.timedOut || execResult.exitCode !== 0) {
        throw new Error(
          `Shell workflow execution failed: ${execResult.stderr || execResult.stdout}`,
        );
      }

      const artifactFile = await shell.readFile(outputArtifactPath);
      const artifact = parseArtifactJson(
        artifactFile.content,
        options.artifactSchema,
        outputArtifactPath,
      );

      return {
        ...artifact,
        artifactPath: outputArtifactPath,
        responseId: artifactFile.responseId ?? execResult.responseId,
        sessionId: artifactFile.sessionId ?? execResult.sessionId,
      } as WorkflowRunResult<TArtifact>;
    },
  );
}
