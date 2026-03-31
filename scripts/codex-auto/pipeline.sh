#!/usr/bin/env bash
set -euo pipefail

# pipeline.sh — Unified Autonomous Development Pipeline
# Usage:
#   ./pipeline.sh fix           # Auto-fix current CI failures (L3)
#   ./pipeline.sh review <PR#>  # Review a PR (L3)
#   ./pipeline.sh dispatch <dir># Dispatch task files (L1)
#   ./pipeline.sh orchestrate   # Run multi-agent workflow (L2)
#   ./pipeline.sh nightly       # Full nightly sweep (all layers)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh" 2>/dev/null || {
  # Fallback if common.sh doesn't exist yet
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  LOG_DIR="${REPO_ROOT}/.logs/codex-auto"
  mkdir -p "$LOG_DIR"
}

CMD="${1:-help}"
shift || true

case "$CMD" in
  fix)
    echo "=== Layer 3: CI Autofix ==="
    if [ -f "$SCRIPT_DIR/ci-fix.sh" ]; then
      "$SCRIPT_DIR/ci-fix.sh" "${1:-latest}"
    else
      echo "ci-fix.sh not found. Run 'codex \"fix the failing CI\"' to auto-fix."
    fi
    ;;

  review)
    PR_NUM="${1:?Usage: pipeline.sh review <PR-number>}"
    echo "=== Layer 3: PR Review ==="
    if [ -f "$SCRIPT_DIR/review-pr.sh" ]; then
      "$SCRIPT_DIR/review-pr.sh" "$PR_NUM"
    else
      echo "review-pr.sh not found. Run 'codex \"review PR #$PR_NUM\"' for automated review."
    fi
    ;;

  dispatch)
    TASK_PATH="${1:?Usage: pipeline.sh dispatch <task-file-or-dir>}"
    echo "=== Layer 1: Dual-Brain Dispatch ==="
    if [ -f "$SCRIPT_DIR/dispatch.sh" ]; then
      "$SCRIPT_DIR/dispatch.sh" "$TASK_PATH"
    else
      echo "dispatch.sh not found. Task dispatch requires task runner implementation."
    fi
    ;;

  orchestrate)
    OBJECTIVE="${1:?Usage: pipeline.sh orchestrate \"objective\" [slug]}"
    SLUG="${2:-}"
    echo "=== Layer 2: Multi-Agent Orchestration ==="
    if [ -f "$REPO_ROOT/.codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py" ]; then
      python3 "$REPO_ROOT/.codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py" \
        --objective "$OBJECTIVE" \
        ${SLUG:+--slug "$SLUG"}
    else
      echo "Agents SDK not found. Multi-agent orchestration requires codex-agents-sdk setup."
    fi
    ;;

  sweep)
    MODE="${1:-all}"
    echo "=== Layer 3: Code Sweep ==="
    if [ -f "$SCRIPT_DIR/sweep.sh" ]; then
      "$SCRIPT_DIR/sweep.sh" "$MODE"
    else
      echo "sweep.sh not found. Run 'codex \"sweep code quality\"' for automated sweeps."
    fi
    ;;

  nightly)
    echo "=== Full Nightly Pipeline ==="
    if [ -f "$SCRIPT_DIR/nightly.sh" ]; then
      "$SCRIPT_DIR/nightly.sh"
    else
      echo "nightly.sh not found. Full pipeline automation requires all layer scripts."
    fi
    ;;

  sentry)
    echo "=== Layer 3: Sentry Autofix ==="
    if [ -f "$SCRIPT_DIR/sentry-autofix-loop.sh" ]; then
      "$SCRIPT_DIR/sentry-autofix-loop.sh" "$@"
    else
      echo "sentry-autofix-loop.sh not found. Run 'codex \"fix the Sentry errors\"' for automated fixes."
    fi
    ;;

  status)
    echo "=== Pipeline Status ==="
    echo ""
    echo "Latest dispatch:"
    ls -1t "$LOG_DIR"/dispatch-* 2>/dev/null | head -1 | xargs -I{} cat {}/summary.json 2>/dev/null || echo "  No dispatch runs found"
    echo ""
    echo "Latest orchestration:"
    ls -1td "$REPO_ROOT"/output/codex-agents-workflow/*/ 2>/dev/null | head -1 | xargs -I{} cat {}progress.json 2>/dev/null || echo "  No orchestration runs found"
    echo ""
    echo "Latest CI run:"
    gh run list --limit 3 --json status,conclusion,name,headBranch 2>/dev/null || echo "  gh CLI not available"
    ;;

  help|*)
    echo "Autonomous Development Pipeline"
    echo ""
    echo "Commands:"
    echo "  fix                    Auto-fix current CI failures (L3)"
    echo "  review <PR#>           Review a PR with Codex (L3)"
    echo "  dispatch <path>        Execute task YAML files via Codex (L1)"
    echo "  orchestrate \"obj\"      Run multi-agent workflow (L2)"
    echo "  sweep [all|types|auth] Run code quality sweep (L3)"
    echo "  nightly                Full nightly automation (all)"
    echo "  sentry [--max N]       Auto-fix Sentry issues (L3)"
    echo "  status                 Show latest pipeline status"
    echo ""
    echo "Quick examples:"
    echo "  ./pipeline.sh fix"
    echo "  ./pipeline.sh review 42"
    echo "  ./pipeline.sh dispatch /tmp/codex-tasks/my-feature/"
    echo "  ./pipeline.sh orchestrate \"Add buyer outreach email templates\""
    ;;
esac
