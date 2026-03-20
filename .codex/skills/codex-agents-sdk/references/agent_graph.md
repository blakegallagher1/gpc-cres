# Entitlement OS Agent Graph (Codex MCP)

Recommended execution graph:

1. `agent-manager` (Planner)
2. `agent-db`, `agent-openai`, `agent-web`, `agent-worker` in waves as required
3. `agent-qa` (verification)

Run gates:

- Planner writes a short plan and handoff checklist.
- Before moving from one wave to the next, the PM verifies required artifacts exist.
- QA signs off by producing `QA_REPORT.md` before success.

All artifacts should live under:

`output/codex-agents-workflow/<slug>/`
