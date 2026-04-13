#!/usr/bin/env bash
# ============================================================================
# self-improve.sh — Recursive self-improvement loop
# ============================================================================
# Uses the 1M-token context window to load the entire codebase, select the
# highest-leverage improvement not yet made, implement it, verify all gates,
# and record the result so every subsequent run compounds on prior work.
#
# This is the AGI/ASI unlock: Codex pointing its full capabilities at itself.
#
# Usage:
#   ./scripts/codex-auto/self-improve.sh              # Run one cycle
#   ./scripts/codex-auto/self-improve.sh --cycles N   # Run N cycles
#   ./scripts/codex-auto/self-improve.sh --dry-run    # Show what would run
#
# Called by nightly.sh Phase 4 (once per night = one cycle per day)
# Run manually for multiple cycles: self-improve.sh --cycles 3
# ============================================================================

source "$(dirname "$0")/common.sh"

require_codex

# ---------- Args ----------
DRY_RUN=false
CYCLES=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true; shift ;;
    --cycles)    CYCLES="${2:-1}"; shift 2 ;;
    *)           shift ;;
  esac
done

# ---------- Paths ----------
IMPROVE_DIR="${REPO_ROOT}/output/self-improve"
COMPOUND_LOG="${IMPROVE_DIR}/compound-log.md"
CYCLE_COUNTER="${IMPROVE_DIR}/cycle-counter.txt"
WORKTREE_BASE="/tmp/gpc-self-improve-sequential"

# Ensure output dir exists
mkdir -p "$IMPROVE_DIR"

# Read current cycle number
CYCLE_N=1
if [[ -f "$CYCLE_COUNTER" ]]; then
  CYCLE_N=$(cat "$CYCLE_COUNTER")
fi

log_info "=========================================="
log_info "  Self-Improve: Recursive Improvement Loop"
log_info "  Starting at Cycle $CYCLE_N"
log_info "  Requested cycles: $CYCLES"
log_info "  $(date)"
log_info "=========================================="

if $DRY_RUN; then
  log_info "[DRY RUN] Would run $CYCLES self-improvement cycle(s)"
  log_info "[DRY RUN] Compound log: $COMPOUND_LOG"
  log_info "[DRY RUN] Current cycle: $CYCLE_N"
  exit 0
fi

# Sync remote refs without mutating the caller's checkout
cd "$REPO_ROOT"
git fetch origin 2>/dev/null || true
MAIN_REF="origin/main"
git show-ref --verify --quiet refs/remotes/origin/main 2>/dev/null \
  || MAIN_REF="origin/master"

# Run the requested number of cycles
CYCLES_COMPLETED=0
for ((i = 0; i < CYCLES; i++)); do
  CURRENT_CYCLE=$((CYCLE_N + i))
  log_info "--- Cycle $CURRENT_CYCLE start ---"

  CYCLE_LOG="${LOG_DIR}/${TIMESTAMP}-self-improve-cycle-${CURRENT_CYCLE}.log"
  WT="${WORKTREE_BASE}-${CURRENT_CYCLE}"
  BRANCH="auto/self-improve-${CURRENT_CYCLE}-$(date +%Y%m%d)"

  if [[ -d "$WT" ]]; then
    git worktree remove "$WT" --force 2>/dev/null || rm -rf "$WT"
  fi
  git branch -D "$BRANCH" 2>/dev/null || true
  git worktree add "$WT" -b "$BRANCH" "$MAIN_REF" 2>/dev/null

  WT_IMPROVE_DIR="${WT}/output/self-improve"
  WT_COMPOUND_LOG="${WT_IMPROVE_DIR}/compound-log.md"
  WT_CYCLE_COUNTER="${WT_IMPROVE_DIR}/cycle-counter.txt"
  mkdir -p "$WT_IMPROVE_DIR"

  if [[ ! -f "$WT_COMPOUND_LOG" ]]; then
    cat > "$WT_COMPOUND_LOG" <<'EOF'
# Self-Improvement Compound Log

This file records every autonomous improvement cycle run by self-improve.sh.
Each entry compounds on the last — the recursive self-improvement loop.

The memory system injects this file at the start of each Codex session,
ensuring every cycle is informed by all prior cycles.

---

EOF
  fi

  if [[ ! -f "$WT_CYCLE_COUNTER" ]]; then
    echo "$CURRENT_CYCLE" > "$WT_CYCLE_COUNTER"
  fi

  PROMPT="$(cat <<PROMPT
You are running Self-Improvement Cycle ${CURRENT_CYCLE} on the Entitlement OS codebase.

Use the self-improve skill. Follow every phase exactly:

Phase 0: Read output/self-improve/compound-log.md — know what has already been done.
Phase 1: Load the entire codebase into your 1M-token context window.
Phase 2: Run the quality benchmarks and record BEFORE metrics.
Phase 3: Select the single highest-leverage improvement not yet covered by prior cycles.
Phase 4: Implement, verify all gates (pnpm typecheck && pnpm lint && pnpm test), fix any gate failures.
Phase 5: Commit on branch auto/self-improve-${CURRENT_CYCLE}-$(date +%Y%m%d), open a PR, update compound-log.md and cycle-counter.txt.
Phase 6: Write a memory entry summarizing this cycle for future sessions.

This is Cycle ${CURRENT_CYCLE}. The compound log shows all prior cycles — do not repeat them.
After completing: print SELF-IMPROVE CYCLE ${CURRENT_CYCLE} COMPLETE and the PR URL.
PROMPT
)"

  log_info "Running Codex self-improvement cycle $CURRENT_CYCLE..."
  log_info "Log: $CYCLE_LOG"

  if codex exec \
      -C "$WT" \
      --dangerously-bypass-approvals-and-sandbox \
      --profile self-improve \
      "$PROMPT" \
      > "$CYCLE_LOG" 2>&1; then
    log_ok "Cycle $CURRENT_CYCLE completed successfully"
    CYCLES_COMPLETED=$((CYCLES_COMPLETED + 1))

    # If Codex didn't update the counter (it should, but be defensive)
    NEW_CYCLE=$((CURRENT_CYCLE + 1))
    COUNTER_AFTER=$(cat "$WT_CYCLE_COUNTER" 2>/dev/null || echo "$CURRENT_CYCLE")
    if [[ "$COUNTER_AFTER" == "$CURRENT_CYCLE" ]]; then
      echo "$NEW_CYCLE" > "$WT_CYCLE_COUNTER"
      log_warn "Counter not updated by Codex — incremented manually to $NEW_CYCLE"
    fi
  else
    log_error "Cycle $CURRENT_CYCLE failed — see $CYCLE_LOG"
    log_warn "Stopping cycle loop due to failure"
    git worktree remove "$WT" --force 2>/dev/null || rm -rf "$WT"
    break
  fi

  git worktree remove "$WT" --force 2>/dev/null || rm -rf "$WT"

  # Brief pause between cycles to avoid rate limits
  if [[ $i -lt $((CYCLES - 1)) ]]; then
    log_info "Pausing 30s before next cycle..."
    sleep 30
  fi
done

log_ok "=========================================="
log_ok "  Self-Improve complete"
log_ok "  Cycles completed: $CYCLES_COMPLETED / $CYCLES"
log_ok "  Compound log: $COMPOUND_LOG"
log_ok "  Logs: $LOG_DIR"
log_ok "=========================================="
