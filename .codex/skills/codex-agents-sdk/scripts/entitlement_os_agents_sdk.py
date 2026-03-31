#!/usr/bin/env python3
"""
Entitlement OS — Production-grade multi-agent orchestrator.
Uses Codex MCP + OpenAI Agents SDK with structured output, retries,
progress tracking, cost ceilings, and programmatic gate validation.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from agents import Agent, Runner, RunResult, set_default_openai_api
from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX
from agents.mcp import MCPServerStdio
from dotenv import load_dotenv


MAX_TURNS = 40
COST_CEILING_USD = 5.0
PROGRESS_INTERVAL_TURNS = 3
RETRY_MAX = 2
RETRY_BACKOFF_BASE = 5


class ProgressTracker:
    """Writes progress.json to output_dir on each update."""

    def __init__(self, run_id: str, objective: str, output_dir: Path, max_turns: int, cost_ceiling: float):
        self.run_id = run_id
        self.objective = objective
        self.output_dir = output_dir
        self.max_turns = max_turns
        self.cost_ceiling = cost_ceiling
        self.status = "running"
        self.current_agent = ""
        self.turn = 0
        self.completed_gates: list[str] = []
        self.pending_gates: list[str] = ["PLAN.md", "TASKS.md", "specialist_reports", "QA_REPORT.md"]
        self.artifacts: list[str] = []
        self.errors: list[str] = []
        self.cost_usd = 0.0
        self.start_time = time.time()

    def update(self, **kwargs: Any) -> None:
        for k, v in kwargs.items():
            if hasattr(self, k):
                setattr(self, k, v)
        self._write()

    def add_artifact(self, path: str) -> None:
        if path not in self.artifacts:
            self.artifacts.append(path)
        self._write()

    def complete_gate(self, gate: str) -> None:
        if gate not in self.completed_gates:
            self.completed_gates.append(gate)
        if gate in self.pending_gates:
            self.pending_gates.remove(gate)
        self._write()

    def add_error(self, error: str) -> None:
        self.errors.append(error)
        self._write()

    def _write(self) -> None:
        data = {
            "run_id": self.run_id,
            "objective": self.objective,
            "status": self.status,
            "current_agent": self.current_agent,
            "turn": self.turn,
            "max_turns": self.max_turns,
            "completed_gates": self.completed_gates,
            "pending_gates": self.pending_gates,
            "artifacts": self.artifacts,
            "errors": self.errors,
            "cost_usd": round(self.cost_usd, 4),
            "cost_ceiling_usd": self.cost_ceiling,
            "elapsed_seconds": round(time.time() - self.start_time, 1),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        progress_path = self.output_dir / "progress.json"
        progress_path.write_text(json.dumps(data, indent=2))


def validate_gate(gate_name: str, output_dir: Path, required_files: list[str]) -> dict:
    """Check if required artifacts exist and have content."""
    results = []
    all_passed = True
    for f in required_files:
        path = output_dir / f
        exists = path.exists()
        size = path.stat().st_size if exists else 0
        passed = exists and size > 10
        results.append({"path": f, "exists": exists, "min_bytes": size})
        if not passed:
            all_passed = False

    return {
        "gate_name": gate_name,
        "passed": all_passed,
        "required_artifacts": results,
        "checks": [{"name": f"file:{f}", "passed": (output_dir / f).exists()} for f in required_files],
    }


def make_instructions(role: str, scope: str, deliverable: str, output_dir: Path) -> str:
    return (
        f"{RECOMMENDED_PROMPT_PREFIX}\n"
        f"You are {role} for Entitlement OS.\n"
        f"Scope: {scope}\n"
        "Only execute tasks within your assigned scope.\n"
        "When creating files, call Codex MCP with "
        "'{\"approval-policy\":\"never\",\"sandbox\":\"workspace-write\"}'.\n"
        f"Deliverable: write {output_dir}/{deliverable}\n"
        "Rules:\n"
        "- All API routes: resolveAuth() + orgId scoping\n"
        "- Zod params: .nullable() not .optional()\n"
        "- No .url()/.email() Zod validators\n"
        "- Event dispatch: .catch(() => {})\n"
        "- Import handlers.ts at top of routes that dispatch events\n"
    )


async def run_orchestrator(objective: str, slug: str | None, cost_ceiling: float, max_turns: int) -> None:
    load_dotenv(override=True)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required.")
    set_default_openai_api("responses")  # type: ignore[arg-type]

    run_id = str(uuid.uuid4())[:8]
    base = Path(os.environ.get(
        "ENTITLEMENT_OS_AGENT_WORKFLOW_OUTPUT_DIR",
        str(Path.cwd() / "output" / "codex-agents-workflow"),
    ))
    output_dir = base / (slug or f"run-{run_id}")
    output_dir.mkdir(parents=True, exist_ok=True)
    workspace = str(Path.cwd())

    tracker = ProgressTracker(run_id, objective, output_dir, max_turns, cost_ceiling)
    print(f"Run {run_id} | Output: {output_dir} | Max turns: {max_turns} | Cost ceiling: ${cost_ceiling}")

    codex_params: dict[str, Any] = {"command": "npx", "args": ["-y", "codex", "mcp-server"]}

    async with MCPServerStdio(
        name="Codex CLI",
        params=codex_params,  # type: ignore[arg-type]
        client_session_timeout_seconds=360000,
    ) as codex_mcp_server:

        project_manager = Agent(
            name="project_manager",
            instructions=(
                f"{RECOMMENDED_PROMPT_PREFIX}\n"
                "You are the Entitlement OS Project Manager.\n"
                "Decompose the objective into scoped tasks. Enforce gated handoffs.\n"
                f"Output directory: {output_dir}\n"
                "Required outputs: PLAN.md, TASKS.md, TRACELOG.md\n"
                "\n"
                "GATE PROTOCOL:\n"
                "1. Do NOT handoff to specialists until PLAN.md + TASKS.md exist.\n"
                "2. Require specialist *_REPORT.md before handoff to QA.\n"
                "3. QA must produce QA_REPORT.md before declaring completion.\n"
                "4. If a required file is missing, instruct the owner to produce it.\n"
                "\n"
                "PROGRESS: After each handoff, append to TRACELOG.md with timestamp.\n"
                "COST: If told budget is exhausted, wrap up immediately.\n"
            ),
            mcp_servers=[codex_mcp_server],
        )

        db_agent = Agent(
            name="db_agent",
            instructions=make_instructions(
                "the Database Engineer",
                "packages/db/, packages/shared/",
                "DB_REPORT.md",
                output_dir,
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        openai_agent = Agent(
            name="openai_agent",
            instructions=make_instructions(
                "the AI Platform Engineer",
                "packages/openai/, packages/evidence/, packages/artifacts/",
                "OPENAI_REPORT.md",
                output_dir,
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        web_agent = Agent(
            name="web_agent",
            instructions=make_instructions(
                "the Web Engineer",
                "apps/web/",
                "WEB_REPORT.md",
                output_dir,
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        qa_agent = Agent(
            name="qa_agent",
            instructions=(
                f"{RECOMMENDED_PROMPT_PREFIX}\n"
                "You are the QA Reviewer for Entitlement OS.\n"
                f"Output directory: {output_dir}\n"
                "Produce QA_REPORT.md with:\n"
                "- Auth rejection test\n"
                "- Org-scope rejection test\n"
                "- Schema validation test\n"
                "- Happy path test\n"
                "- Idempotency test (if applicable)\n"
                "\n"
                "Run: pnpm lint && pnpm typecheck && pnpm test\n"
                "Report results in QA_REPORT.md\n"
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        db_agent.handoffs = [project_manager]
        openai_agent.handoffs = [project_manager]
        web_agent.handoffs = [project_manager]
        qa_agent.handoffs = [project_manager]
        project_manager.handoffs = [db_agent, openai_agent, web_agent, qa_agent]

        full_objective = (
            f"Workspace: {workspace}\n"
            f"Output directory: {output_dir}\n"
            f"Objective:\n{objective}"
        )

        result: RunResult | None = None
        for attempt in range(1, RETRY_MAX + 1):
            try:
                tracker.update(status="running", turn=0)
                result = await Runner.run(project_manager, full_objective, max_turns=max_turns)

                # Extract token usage and estimate cost
                if result and hasattr(result, "raw_responses"):
                    total_input = 0
                    total_output = 0
                    for resp in result.raw_responses:
                        usage = getattr(resp, "usage", None)
                        if usage:
                            total_input += getattr(usage, "input_tokens", 0)
                            total_output += getattr(usage, "output_tokens", 0)
                    # GPT-5.4 approximate pricing: $3/M input, $15/M output
                    estimated_cost = (total_input * 3.0 + total_output * 15.0) / 1_000_000
                    tracker.update(cost_usd=estimated_cost)
                    if estimated_cost > cost_ceiling:
                        print(f"WARNING: Cost ${estimated_cost:.2f} exceeded ceiling ${cost_ceiling:.2f}")
                        tracker.add_error(f"Cost ceiling exceeded: ${estimated_cost:.2f} > ${cost_ceiling:.2f}")

                tracker.update(status="completed", turn=max_turns)
                break
            except Exception as e:
                error_msg = f"Attempt {attempt}/{RETRY_MAX} failed: {e}"
                print(f"ERROR: {error_msg}")
                tracker.add_error(error_msg)
                if attempt < RETRY_MAX:
                    backoff = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                    print(f"Retrying in {backoff}s...")
                    await asyncio.sleep(backoff)
                else:
                    tracker.update(status="failed")
                    raise

        gate1 = validate_gate("planning", output_dir, ["PLAN.md", "TASKS.md"])
        gate2 = validate_gate("specialist_reports", output_dir, ["DB_REPORT.md", "WEB_REPORT.md", "OPENAI_REPORT.md"])
        gate3 = validate_gate("qa", output_dir, ["QA_REPORT.md"])

        for gate in [gate1, gate2, gate3]:
            gate_file = output_dir / f"gate_{gate['gate_name']}.json"
            gate_file.write_text(json.dumps(gate, indent=2))
            if gate["passed"]:
                tracker.complete_gate(gate["gate_name"])

        summary = {
            "run_id": run_id,
            "objective": objective,
            "output_dir": str(output_dir),
            "final_output": result.final_output if result else "No output",
            "gates": {
                "planning": gate1["passed"],
                "specialist_reports": gate2["passed"],
                "qa": gate3["passed"],
            },
            "all_gates_passed": all(g["passed"] for g in [gate1, gate2, gate3]),
        }
        (output_dir / "summary.json").write_text(json.dumps(summary, indent=2))

        tracker.update(status="completed" if summary["all_gates_passed"] else "failed")
        print(f"\nRun {run_id} {'PASSED' if summary['all_gates_passed'] else 'FAILED'}")
        print(f"Output: {output_dir}")
        if result:
            print(f"\nFinal output:\n{result.final_output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Entitlement OS multi-agent orchestrator")
    parser.add_argument("--objective", required=True, help="High-level task prompt")
    parser.add_argument("--slug", required=False, help="Output folder slug")
    parser.add_argument("--cost-ceiling", type=float, default=COST_CEILING_USD, help=f"Max USD spend (default: {COST_CEILING_USD})")
    parser.add_argument("--max-turns", type=int, default=MAX_TURNS, help=f"Max agent turns (default: {MAX_TURNS})")
    args = parser.parse_args()
    asyncio.run(run_orchestrator(args.objective, args.slug, args.cost_ceiling, args.max_turns))
