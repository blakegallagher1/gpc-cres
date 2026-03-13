#!/usr/bin/env bash
# ============================================================================
# chat-closeout-workflow.sh — scaffold the four-lane chat closeout workflow
# ============================================================================
# Usage:
#   ./scripts/codex-auto/chat-closeout-workflow.sh
#   ./scripts/codex-auto/chat-closeout-workflow.sh my-slug
#   ./scripts/codex-auto/chat-closeout-workflow.sh my-slug --force
# ============================================================================

source "$(dirname "$0")/common.sh"

SLUG="${1:-chat-closeout-four-lane}"
FORCE="${2:-}"
OUTPUT_DIR="${REPO_ROOT}/output/codex-agents-workflow/${SLUG}"

if [[ -e "$OUTPUT_DIR" && "$FORCE" != "--force" ]]; then
  log_error "Output directory already exists: $OUTPUT_DIR"
  log_error "Re-run with --force to replace it."
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/prompts"

cat > "${OUTPUT_DIR}/README.md" <<EOF
# Chat Closeout Four-Lane Workflow

This folder stores a gated multi-agent workflow for the current chat closeout.

Objective:
- complete the four next-step closeout tasks in parallel:
  - ship the current chat checkpoint
  - validate the GitHub/browser automation path end to end
  - remove the last non-actionable Playwright webserver warning noise
  - close roadmap and QA signoff for the run
EOF

cat > "${OUTPUT_DIR}/PLAN.md" <<EOF
# Chat Closeout Four-Lane Plan

## Objective
Execute a PM-gated multi-agent closeout for the chat-learning workstream.

## Scope
- Roadmap item: \`CHAT-010\`
- Output directory: \`output/codex-agents-workflow/${SLUG}/\`
- Complete four coordinated tasks:
  1. ship checkpoint
  2. validate GitHub/browser automation path
  3. remove remaining Playwright webserver warning noise
  4. close roadmap and QA signoff
EOF

cat > "${OUTPUT_DIR}/TASKS.md" <<'EOF'
# Chat Closeout Four-Lane Tasks

- [ ] T0 | Owner: PM | Capture roadmap alignment in `00_scope.md`.
- [ ] T0 | Owner: PM | Record auth/runtime approach in `00_auth_check.md`.
- [ ] T1 | Owner: PM | Finalize `PLAN.md`, `TASKS.md`, `HANDOFF_MATRIX.md`, and `TRACELOG.md`.
- [ ] T2 | Owner: Ship | Produce `SHIP_REPORT.md`.
- [ ] T2 | Owner: Automation | Produce `AUTOMATION_REPORT.md`.
- [ ] T2 | Owner: Runtime | Produce `RUNTIME_REPORT.md`.
- [ ] T3 | Owner: QA | Produce `QA_REPORT.md` and `08_qa_verification.md`.
- [ ] T4 | Owner: PM | Update final signoff and roadmap evidence.
EOF

cat > "${OUTPUT_DIR}/HANDOFF_MATRIX.md" <<'EOF'
# Handoff Matrix

## Gate 0
- Trigger: workflow start.
- Required artifacts: `00_scope.md`, `00_auth_check.md`, `00_deps.md`, `00_gate_pm_signoff.md`

## Gate 1
- Trigger: before lane execution.
- Required artifacts: `PLAN.md`, `TASKS.md`, `TRACELOG.md`, `02_agent_roster.md`, `03_handoff_gates.md`, `01_gate_pm_signoff.md`

## Gate 2
- `agent-ship` -> `SHIP_REPORT.md`
- `agent-automation` -> `AUTOMATION_REPORT.md`
- `agent-runtime` -> `RUNTIME_REPORT.md`

## Gate 3
- QA requires all lane reports.

## Gate 4
- Final signoff requires `QA_REPORT.md`, `08_qa_verification.md`, `07_outputs_inventory.md`, `07_run_log.md`, and `09_final_signoff.md`.
EOF

cat > "${OUTPUT_DIR}/TRACELOG.md" <<'EOF'
# TRACELOG

Scaffold created by scripts/codex-auto/chat-closeout-workflow.sh
EOF

cat > "${OUTPUT_DIR}/00_scope.md" <<'EOF'
# Scope and Roadmap Alignment

- ROADMAP item: `CHAT-010`
- Scope statement:
- Success criteria:
- Stop condition:
EOF

cat > "${OUTPUT_DIR}/00_scope_exception.md" <<'EOF'
# Scope Exception

- None by default.
EOF

cat > "${OUTPUT_DIR}/00_auth_check.md" <<'EOF'
# Auth Check

- Current execution path:
- Notes:
EOF

cat > "${OUTPUT_DIR}/00_deps.md" <<'EOF'
# Dependency Check

- pnpm
- Playwright browsers
- Optional: codex CLI and GitHub auth for replay
EOF

cat > "${OUTPUT_DIR}/00_gate_pm_signoff.md" <<'EOF'
# PM Gate 0 Signoff

- Status:
- Reason:
EOF

cat > "${OUTPUT_DIR}/01_gate_pm_signoff.md" <<'EOF'
# PM Gate 1 Signoff

- Status:
- Reason:
EOF

cat > "${OUTPUT_DIR}/02_agent_roster.md" <<'EOF'
# Agent Roster

- project_manager
- agent-ship
- agent-automation
- agent-runtime
- agent-qa
EOF

cat > "${OUTPUT_DIR}/03_handoff_gates.md" <<'EOF'
# Handoff Gates Summary

- See `HANDOFF_MATRIX.md` for enforceable conditions.
EOF

cat > "${OUTPUT_DIR}/04_outputs_manifest.md" <<'EOF'
# Output Manifest

- `SHIP_REPORT.md`
- `AUTOMATION_REPORT.md`
- `RUNTIME_REPORT.md`
- `QA_REPORT.md`
EOF

cat > "${OUTPUT_DIR}/05_run_config.md" <<EOF
# Run Configuration

- Worktree: ${REPO_ROOT}
- Output dir: output/codex-agents-workflow/${SLUG}
EOF

cat > "${OUTPUT_DIR}/06_run_commands.md" <<'EOF'
# Run Commands

- `./scripts/codex-auto/chat-closeout-workflow.sh`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `OPENAI_API_KEY=placeholder pnpm build`
EOF

cat > "${OUTPUT_DIR}/07_outputs_inventory.md" <<'EOF'
# Outputs Inventory

- Pending run completion.
EOF

cat > "${OUTPUT_DIR}/07_run_log.md" <<'EOF'
# Run Log

- Pending run completion.
EOF

cat > "${OUTPUT_DIR}/08_qa_verification.md" <<'EOF'
# QA Verification

- Pending QA review.
EOF

cat > "${OUTPUT_DIR}/09_final_signoff.md" <<'EOF'
# Final Signoff

- Pending PM closure.
EOF

cat > "${OUTPUT_DIR}/SHIP_REPORT.md" <<'EOF'
# Ship Report

- Pending specialist output.
EOF

cat > "${OUTPUT_DIR}/AUTOMATION_REPORT.md" <<'EOF'
# Automation Report

- Pending specialist output.
EOF

cat > "${OUTPUT_DIR}/RUNTIME_REPORT.md" <<'EOF'
# Runtime Report

- Pending specialist output.
EOF

cat > "${OUTPUT_DIR}/QA_REPORT.md" <<'EOF'
# QA Report

- Pending QA output.
EOF

cat > "${OUTPUT_DIR}/prompts/agent-manager.md" <<'EOF'
# Agent Manager Prompt

Own gates, artifact completeness, roadmap linkage, and final signoff.
EOF

cat > "${OUTPUT_DIR}/prompts/agent-ship.md" <<'EOF'
# Agent Ship Prompt

Own checkpoint shipping and `SHIP_REPORT.md`.
EOF

cat > "${OUTPUT_DIR}/prompts/agent-automation.md" <<'EOF'
# Agent Automation Prompt

Own GitHub/browser automation validation and `AUTOMATION_REPORT.md`.
EOF

cat > "${OUTPUT_DIR}/prompts/agent-runtime.md" <<'EOF'
# Agent Runtime Prompt

Own Playwright warning cleanup and `RUNTIME_REPORT.md`.
EOF

cat > "${OUTPUT_DIR}/prompts/agent-qa.md" <<'EOF'
# Agent QA Prompt

Own final acceptance review and `QA_REPORT.md`.
EOF

log_ok "Scaffolded chat closeout workflow at $OUTPUT_DIR"
