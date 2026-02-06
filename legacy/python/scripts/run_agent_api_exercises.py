from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = REPO_ROOT / "output"
BASE_URL = "http://127.0.0.1:8000"
HEALTH_TIMEOUT_SECONDS = 60
REQUEST_TIMEOUT_SECONDS = 120


@dataclass
class AgentExercise:
    name: str
    endpoint: str
    query: str


def load_env(path: Path) -> Dict[str, str]:
    env: Dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def wait_for_health(client: httpx.Client) -> Dict[str, Any]:
    deadline = time.time() + HEALTH_TIMEOUT_SECONDS
    last_error: str | None = None
    while time.time() < deadline:
        try:
            response = client.get("/health")
            if response.status_code == 200:
                return response.json()
            last_error = f"Status {response.status_code}: {response.text}"
        except httpx.HTTPError as exc:
            last_error = str(exc)
        time.sleep(1)
    raise RuntimeError(f"Health check failed after {HEALTH_TIMEOUT_SECONDS}s. {last_error}")


def create_project(client: httpx.Client) -> Dict[str, Any]:
    payload = {
        "name": "Baton Rouge Mixed-Use Pilot",
        "address": "6200 Perkins Rd, Baton Rouge, LA 70808",
        "property_type": "mixed_use",
        "description": "200-unit multifamily with 18k SF ground-floor retail; 8.2 acres; target delivery 2028.",
        "market": "Baton Rouge, LA",
        "status": "intake",
    }
    response = client.post("/projects", json=payload)
    response.raise_for_status()
    return response.json()


def build_exercises() -> list[AgentExercise]:
    return [
        AgentExercise(
            name="coordinator",
            endpoint="/agents/coordinator",
            query=(
                "Coordinate a full evaluation for a 200-unit mixed-use development at 6200 Perkins Rd, "
                "Baton Rouge. Ask Research for comps and demand, Finance for underwriting and DSCR, "
                "Risk for flood/environmental exposure, Legal for zoning/entitlement constraints, and "
                "Design for capacity assumptions. Synthesize into a recommendation with top 5 next steps."
            ),
        ),
        AgentExercise(
            name="deal_screener",
            endpoint="/agents/deal_screener",
            query=(
                "Screen this deal: 210-unit garden-style multifamily, asking $38.5M, current NOI $2.1M, "
                "market rent growth 3.5%, located in South Baton Rouge. Score against criteria: target cap "
                "rate >= 5.75%, min DSCR 1.35x, max cost per unit $190k, rent growth >= 3%, and strong "
                "submarket demand. Return score, tier, and 3 gating risks."
            ),
        ),
        AgentExercise(
            name="research",
            endpoint="/agents/research",
            query=(
                "Research the submarket around 6200 Perkins Rd, Baton Rouge, LA. Provide 3 recent multifamily "
                "comps with price/unit, estimate current Class A rents, note top 3 employers within 5 miles, "
                "and include citations."
            ),
        ),
        AgentExercise(
            name="finance",
            endpoint="/agents/finance",
            query=(
                "Underwrite a 200-unit mixed-use project: total cost $52M, stabilized NOI $3.35M, 5-year "
                "hold, exit cap 5.75%, rent growth 3% annually, opex 38% of EGI, 65% LTC debt at 6.5% "
                "interest-only. Provide IRR, equity multiple, DSCR, and a sensitivity on exit cap (5.5%-6.25%) "
                "and rent growth (2%-4%)."
            ),
        ),
        AgentExercise(
            name="legal",
            endpoint="/agents/legal",
            query=(
                "Review zoning constraints for a mixed-use project in Baton Rouge with C-3 zoning and a "
                "conditional use permit requirement for residential units. Identify approval steps, key risks, "
                "and propose contract clauses to protect against entitlement delays."
            ),
        ),
        AgentExercise(
            name="design",
            endpoint="/agents/design",
            query=(
                "Assume an 8.2-acre site, max FAR 2.0, 60% site coverage, 45-ft height limit, 15-ft setbacks. "
                "Estimate feasible unit count (avg 950 SF), suggest parking count (1.6 spaces/unit), and outline "
                "a conceptual site plan narrative."
            ),
        ),
        AgentExercise(
            name="operations",
            endpoint="/agents/operations",
            query=(
                "Create a high-level construction schedule for a 200-unit mixed-use project with 18k SF retail. "
                "Identify the critical path, propose milestone dates, and outline a cost tracking approach "
                "for GMP contracts."
            ),
        ),
        AgentExercise(
            name="marketing",
            endpoint="/agents/marketing",
            query=(
                "Develop a marketing plan for lease-up of a 200-unit Class A multifamily with 18k SF retail in "
                "South Baton Rouge. Include target tenant personas, key channels, and draft 5 bullet points for "
                "an offering memorandum executive summary."
            ),
        ),
        AgentExercise(
            name="risk",
            endpoint="/agents/risk",
            query=(
                "Assess risk for a mixed-use development near Ward Creek in Baton Rouge. Evaluate flood risk, "
                "environmental exposure, market risk, and insurance considerations. Provide a risk rating and "
                "mitigation steps."
            ),
        ),
        AgentExercise(
            name="due_diligence",
            endpoint="/agents/due_diligence",
            query=(
                "Set up a due diligence plan for acquiring a 200-unit multifamily property in Baton Rouge. "
                "Generate a checklist, document request list, and flag top 5 red flags to investigate."
            ),
        ),
        AgentExercise(
            name="entitlements",
            endpoint="/agents/entitlements",
            query=(
                "Analyze entitlements for a mixed-use project under C-3 zoning in East Baton Rouge Parish. "
                "List required permits, expected timelines, and any agenda or policy items that could impact approval."
            ),
        ),
        AgentExercise(
            name="market_intel",
            endpoint="/agents/market_intel",
            query=(
                "Provide a market intelligence snapshot for South Baton Rouge multifamily: include recent "
                "competitor transactions, key economic indicators (employment, wage growth), major "
                "infrastructure projects, and absorption trends over the last 12 months."
            ),
        ),
        AgentExercise(
            name="tax",
            endpoint="/agents/tax",
            query=(
                "Advise on tax strategy for acquiring a $38.5M multifamily asset with a 5-year hold. Consider "
                "cost segregation, bonus depreciation, 1031 exit, and partnership allocations. Cite relevant IRC "
                "sections and note any recent tax updates that matter."
            ),
        ),
    ]


def preview_response(payload: Any, limit: int = 2000) -> str:
    if isinstance(payload, str):
        text = payload
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2)
    if len(text) > limit:
        return f"{text[:limit]}\n... (truncated, {len(text)} chars)"
    return text


def terminate_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.send_signal(signal.SIGKILL)
        process.wait(timeout=5)


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    run_timestamp = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    env_file = REPO_ROOT / ".env"
    env_vars = load_env(env_file)

    server_env = os.environ.copy()
    server_env.update(env_vars)
    server_env["USE_IN_MEMORY_DB"] = "true"

    log_path = OUTPUT_DIR / f"agent_api_run_{run_timestamp}.log"
    log_file = log_path.open("w")
    process = None

    results: Dict[str, Any] = {
        "run_started_at": datetime.now(timezone.utc).isoformat(),
        "base_url": BASE_URL,
        "health": None,
        "project": None,
        "exercises": {},
    }

    try:
        python_executable = REPO_ROOT / ".venv" / "bin" / "python"
        if not python_executable.exists():
            python_executable = Path(sys.executable)

        process = subprocess.Popen(
            [
                str(python_executable),
                "-m",
                "uvicorn",
                "main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
            ],
            cwd=REPO_ROOT,
            env=server_env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )

        with httpx.Client(base_url=BASE_URL, timeout=REQUEST_TIMEOUT_SECONDS) as client:
            results["health"] = wait_for_health(client)
            results["project"] = create_project(client)
            project_id = results["project"].get("id") or results["project"].get("project", {}).get("id")

            for exercise in build_exercises():
                started = time.time()
                outcome: Dict[str, Any] = {
                    "endpoint": exercise.endpoint,
                    "query": exercise.query,
                    "status_code": None,
                    "success": False,
                    "duration_seconds": None,
                    "error": None,
                    "response_preview": None,
                }
                try:
                    response = client.post(
                        exercise.endpoint,
                        json={
                            "query": exercise.query,
                            "project_id": project_id,
                        },
                    )
                    outcome["status_code"] = response.status_code
                    outcome["success"] = response.status_code == 200
                    if response.headers.get("content-type", "").startswith("application/json"):
                        payload = response.json()
                        outcome["response_preview"] = preview_response(payload)
                    else:
                        outcome["response_preview"] = preview_response(response.text)
                except Exception as exc:  # pylint: disable=broad-except
                    outcome["error"] = str(exc)
                finally:
                    outcome["duration_seconds"] = round(time.time() - started, 2)

                results["exercises"][exercise.name] = outcome

    finally:
        if process is not None:
            terminate_process(process)
        log_file.close()

    summary_path = OUTPUT_DIR / f"agent_api_exercises_{run_timestamp}.json"
    summary_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))

    md_path = OUTPUT_DIR / f"agent_api_exercises_{run_timestamp}.md"
    lines = [
        "# Agent API Exercise Results",
        "",
        f"Run timestamp: {run_timestamp}",
        f"Base URL: {BASE_URL}",
        f"Log: {log_path}",
        "",
        "## Exercises",
    ]

    for exercise in build_exercises():
        lines.append(f"- {exercise.name}: {exercise.query}")

    lines.extend(["", "## Results", "", "| Agent | Status | Duration (s) | Endpoint |", "| --- | --- | --- | --- |"])

    for agent_name, data in results["exercises"].items():
        status = "ok" if data.get("success") else "failed"
        duration = data.get("duration_seconds")
        endpoint = data.get("endpoint")
        lines.append(f"| {agent_name} | {status} | {duration} | {endpoint} |")

    md_path.write_text("\n".join(lines))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
