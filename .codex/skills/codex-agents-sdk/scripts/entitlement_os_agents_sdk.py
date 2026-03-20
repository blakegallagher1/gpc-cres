#!/usr/bin/env python3
"""
Entitlement OS starter for Codex MCP + Agents SDK multi-agent orchestration.
"""

from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path

from agents import Agent, Runner, set_default_openai_api
from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX
from agents.mcp import MCPServerStdio
from dotenv import load_dotenv


def resolve_output_dir(slug: str | None) -> Path:
    base = Path(
        os.environ.get(
            "ENTITLEMENT_OS_AGENT_WORKFLOW_OUTPUT_DIR",
            str(Path.cwd() / "output" / "codex-agents-workflow"),
        )
    )
    if not slug:
        slug = "run"
    path = base / slug
    path.mkdir(parents=True, exist_ok=True)
    return path


def make_instructions(role: str, outputs: str) -> str:
    return (
        f"{RECOMMENDED_PROMPT_PREFIX}\n"
        f"You are {role} for Entitlement OS.\n"
        "Only execute tasks within your assigned scope.\n"
        "When creating files, call Codex MCP with "
        "'{\"approval-policy\":\"never\",\"sandbox\":\"workspace-write\"}'.\n"
        f"{outputs}\n"
    )


async def main(objective: str, slug: str | None) -> None:
    load_dotenv(override=True)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required to run this workflow.")
    set_default_openai_api(api_key)

    output_dir = resolve_output_dir(slug)
    workspace_scope = str(Path.cwd())

    codex_bootstrap = {
        "command": "npx",
        "args": ["-y", "codex", "mcp-server"],
    }
    async with MCPServerStdio(
        name="Codex CLI",
        params=codex_bootstrap,
        client_session_timeout_seconds=360000,
    ) as codex_mcp_server:
        project_manager = Agent(
            name="project_manager",
            instructions=(
                f"{RECOMMENDED_PROMPT_PREFIX}\n"
                "You are the Entitlement OS Project Manager.\n"
                "Decompose the user objective into scoped tasks and enforce gated handoffs.\n"
                f"All artifacts should be created in: {output_dir}\n"
                "Output files expected:\n"
                "- PLAN.md\n"
                "- TASKS.md (Owner-tagged)\n"
                "- TRACELOG.md (handoff decisions and handoff rationale)\n"
                "Workflow gates:\n"
                "1) Do not handoff to specialist agents until PLAN.md and TASKS.md exist.\n"
                "2) Require specialist deliverables before handoff to QA.\n"
                "3) Ask QA to produce QA_REPORT.md before declaring completion.\n"
                "If any required file is missing, instruct the owner to rerun and fix immediately.\n"
                "Default to secure, schema-safe implementations only.\n"
            ),
            mcp_servers=[codex_mcp_server],
        )

        db_agent = Agent(
            name="db_agent",
            instructions=make_instructions(
                "the Database Engineer",
                "Scope: packages/db/, packages/shared/. "
                f"Deliverable: write {output_dir}/DB_REPORT.md with schema/migration notes.",
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        openai_agent = Agent(
            name="openai_agent",
            instructions=make_instructions(
                "the AI Platform Engineer",
                "Scope: packages/openai/, packages/evidence/, packages/artifacts/. "
                f"Deliverable: write {output_dir}/OPENAI_REPORT.md with schema + validation notes.",
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        web_agent = Agent(
            name="web_agent",
            instructions=make_instructions(
                "the Web Engineer",
                "Scope: apps/web/. "
                "Preserve auth/session, org_id scope, API route validation, and idempotency checks. "
                f"Deliverable: write {output_dir}/WEB_REPORT.md with changed routes and invariants.",
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        worker_agent = Agent(
            name="worker_agent",
            instructions=make_instructions(
                "the Worker Engineer",
                "Scope: apps/worker/. "
                "Preserve idempotency and replay safety for all new workflows. "
                f"Deliverable: write {output_dir}/WORKER_REPORT.md with retry/cost guardrails.",
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        qa_agent = Agent(
            name="qa_agent",
            instructions=make_instructions(
                "the QA Reviewer",
                "Produce a concise QA_REPORT.md with acceptance check outcomes and risks. "
                "Required checks: auth rejection, org scope rejection, schema validation, happy path, "
                "and idempotency coverage if applicable.",
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        # PM owns orchestration; each specialist returns to PM for gate checks.
        db_agent.handoffs = [project_manager]
        openai_agent.handoffs = [project_manager]
        web_agent.handoffs = [project_manager]
        worker_agent.handoffs = [project_manager]
        qa_agent.handoffs = [project_manager]
        project_manager.handoffs = [db_agent, openai_agent, web_agent, worker_agent, qa_agent]

        # Ensure local output directory is visible to all agents via prompt context.
        objective = (
            f"Workspace: {workspace_scope}\n"
            f"Output directory: {output_dir}\n"
            f"Objective:\n{objective}"
        )

        result = await Runner.run(project_manager, objective, max_turns=30)
        print(result.final_output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--objective", required=True, help="High-level task prompt for the workflow.")
    parser.add_argument(
        "--slug",
        required=False,
        help="Output folder slug (defaults to 'run').",
    )
    args = parser.parse_args()
    asyncio.run(main(args.objective, args.slug))
