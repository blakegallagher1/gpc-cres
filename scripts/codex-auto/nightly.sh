#!/usr/bin/env bash
# ============================================================================
# nightly.sh — Nightly automation: sweep + roadmap + CI fix
# ============================================================================
# Designed to be run by cron/launchd. Runs all automations in sequence.
#
# Usage:
#   ./scripts/codex-auto/nightly.sh              # Run all nightly tasks
#   ./scripts/codex-auto/nightly.sh --dry-run    # Just show what would run
#
# Cron example (run at 2 AM daily):
#   0 2 * * * /Users/gallagherpropertycompany/Documents/gallagher-cres/scripts/codex-auto/nightly.sh >> /tmp/codex-nightly.log 2>&1
#
# Launchd: see scripts/codex-auto/com.gallagher.codex-nightly.plist
# ============================================================================

source "$(dirname "$0")/common.sh"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

log_info "=========================================="
log_info "  Codex Nightly Automation"
log_info "  $(date)"
log_info "=========================================="

# Ensure we're on main and up to date
cd "$REPO_ROOT"
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" != "master" ]]; then
  log_warn "Not on main branch (on: $CURRENT_BRANCH). Switching to main..."
  if ! $DRY_RUN; then
    git checkout main 2>/dev/null || git checkout master 2>/dev/null
    git pull --ff-only
  fi
else
  if ! $DRY_RUN; then
    git pull --ff-only
  fi
fi

# ---------- Phase 1: Quality Sweep ----------
log_info "Phase 1: Quality sweep (lint + types + auth)"
if $DRY_RUN; then
  log_info "[DRY RUN] Would run: sweep.sh all"
else
  "$SCRIPTS_DIR/sweep.sh" all || log_warn "Sweep had issues, continuing..."
  # Return to main for next phase
  git checkout main 2>/dev/null || git checkout master 2>/dev/null
  git pull --ff-only
fi

# ---------- Phase 2: CI Fix ----------
log_info "Phase 2: Fix latest CI failure (if any)"
if $DRY_RUN; then
  log_info "[DRY RUN] Would run: ci-fix.sh latest"
else
  "$SCRIPTS_DIR/ci-fix.sh" latest || log_warn "CI fix had issues, continuing..."
fi

# ---------- Phase 3: Roadmap Next ----------
log_info "Phase 3: Implement next ROADMAP item (if any Planned)"
if $DRY_RUN; then
  log_info "[DRY RUN] Would run: roadmap-next.sh"
else
  "$SCRIPTS_DIR/roadmap-next.sh" || log_warn "Roadmap had issues or nothing to do."
  git checkout main 2>/dev/null || git checkout master 2>/dev/null
fi

log_ok "=========================================="
log_ok "  Nightly automation complete"
log_ok "  Logs: $LOG_DIR"
log_ok "=========================================="
