import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  buildPythonWorkflowCommand,
  runShellWorkflow,
  type ShellCommandContext,
} from "../shell-workflows/runner.js";

const mockFilesWritten: string[] = [];
const commandContexts: ShellCommandContext[] = [];

vi.mock("../shell.js", () => {
  return {
    withShell: vi.fn(async (_options: unknown, runner: (shell: unknown) => Promise<unknown>) => {
      const fileStore = new Map<string, string>();

      const shell = {
        writeFile: async (path: string, content: string) => {
          mockFilesWritten.push(path);
          fileStore.set(path, content);
          return {
            path,
            bytes: Buffer.byteLength(content),
            responseId: "resp_write",
            sessionId: "session_1",
          };
        },
        readFile: async (path: string) => {
          return {
            path,
            content: fileStore.get(path) ?? "",
            responseId: "resp_read",
            sessionId: "session_1",
          };
        },
        exec: async () => {
          const lastContext = commandContexts[commandContexts.length - 1];
          if (lastContext?.outputPath) {
            fileStore.set(lastContext.outputPath, JSON.stringify({ ok: true }));
          }
          return {
            stdout: "ok",
            stderr: "",
            exitCode: 0,
            timedOut: false,
            responseId: "resp_exec",
            sessionId: "session_1",
          };
        },
        close: vi.fn(),
      };

      return runner(shell);
    }),
  };
});

beforeEach(() => {
  mockFilesWritten.length = 0;
  commandContexts.length = 0;
});

describe("runShellWorkflow", () => {
  it("writes workflow artifacts to per-run scoped paths", async () => {
    const run = await runShellWorkflow({
      rawInput: { name: "alpha" },
      inputSchema: z.object({ name: z.string().min(1) }),
      artifactSchema: z.object({ ok: z.boolean() }),
      skillInstructionPath: "underwriting/SKILL.md",
      paths: {
        inputArtifactPath: "/workspace/artifacts/underwriting/input.json",
        outputArtifactPath: "/workspace/artifacts/underwriting/result.json",
        skillArtifactPath: "/workspace/artifacts/underwriting/skill.md",
      },
      buildCommand: (ctx: ShellCommandContext) => {
        commandContexts.push(ctx);
        return ["echo done"];
      },
      model: "gpt-5-mini",
    });

    const firstPaths = [...mockFilesWritten];
    mockFilesWritten.length = 0;
    commandContexts.length = 0;

    const runTwo = await runShellWorkflow({
      rawInput: { name: "beta" },
      inputSchema: z.object({ name: z.string().min(1) }),
      artifactSchema: z.object({ ok: z.boolean() }),
      skillInstructionPath: "underwriting/SKILL.md",
      paths: {
        inputArtifactPath: "/workspace/artifacts/underwriting/input.json",
        outputArtifactPath: "/workspace/artifacts/underwriting/result.json",
        skillArtifactPath: "/workspace/artifacts/underwriting/skill.md",
      },
      buildCommand: (ctx: ShellCommandContext) => {
        commandContexts.push(ctx);
        return ["echo done"];
      },
      model: "gpt-5-mini",
    });

    const secondPaths = [...mockFilesWritten];

    expect(run.artifactPath).not.toBe(runTwo.artifactPath);
    expect(run.artifactPath).toMatch(/result-[a-z0-9]{12}\.json$/);
    expect(runTwo.artifactPath).toMatch(/result-[a-z0-9]{12}\.json$/);

    const firstWriteRunIds = new Set(
      firstPaths.map((path) => path.match(/-([a-z0-9]{12})\.[a-z]+$/)?.[1]),
    );
    const secondWriteRunIds = new Set(
      secondPaths.map((path) => path.match(/-([a-z0-9]{12})\.[a-z]+$/)?.[1]),
    );

    expect(firstWriteRunIds.size).toBe(1);
    expect(secondWriteRunIds.size).toBe(1);
    expect([...firstWriteRunIds][0]).toBeDefined();
    expect([...secondWriteRunIds][0]).toBeDefined();
    expect([...firstWriteRunIds][0]).not.toBe([...secondWriteRunIds][0]);

    expect(firstPaths.length).toBe(2);
    expect(secondPaths.length).toBe(2);
    });

  it("buildPythonWorkflowCommand standardizes command scaffolding", () => {
    const commandLines = buildPythonWorkflowCommand(
      {
        inputPath: "/workspace/artifacts/input.json",
        outputPath: "/workspace/artifacts/result.json",
        skillPath: "/workspace/artifacts/skill.md",
      },
      {
        requiredSkill: "underwriting",
        scriptLines: [
          "result = {",
          "  'propertyName': 'demo',",
          "  'dscr': 1.23,",
          "  'impliedValue': 100.0,",
          "}",
        ],
      },
    );

    expect(commandLines[0]).toBe("python3 - <<'PY'");
    expect(commandLines).toContain("import json");
    expect(commandLines).toContain("from pathlib import Path");
    expect(commandLines).toContain('input_path = Path("/workspace/artifacts/input.json")');
    expect(commandLines).toContain('output_path = Path("/workspace/artifacts/result.json")');
    expect(commandLines).toContain('skill_path = Path("/workspace/artifacts/skill.md")');
    expect(commandLines).toContain("payload = json.loads(input_path.read_text())");
    expect(commandLines).toContain("required_skill = \"underwriting\"");
    expect(commandLines).toContain("frontmatter_match = re.search(r'\\A\\*\\*\\*[\\r\\n]+([\\s\\S]*?)[\\r\\n]+\\*\\*\\*',");
    expect(commandLines).toContain("if not frontmatter_match:");
    expect(commandLines).toContain("name_match = re.search(r'^name:\\s*(.+)$', frontmatter, flags=re.MULTILINE)");
    expect(commandLines).toContain("if not name_match:");
    expect(commandLines).toContain("output_path.write_text(json.dumps(result))");
    expect(commandLines[commandLines.length - 1]).toBe("PY");
  });
});
