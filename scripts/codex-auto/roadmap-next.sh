#!/usr/bin/env bash
# ============================================================================
# roadmap-next.sh — Pick the next Planned ROADMAP item and implement it
# ============================================================================
# Usage:
#   ./scripts/codex-auto/roadmap-next.sh              # Auto-pick next Planned
#   ./scripts/codex-auto/roadmap-next.sh "R-006"      # Implement specific item
# ============================================================================

source "$(dirname "$0")/common.sh"
require_codex

ITEM_ID="${1:-}"

if [[ -z "$ITEM_ID" ]]; then
  log_info "Scanning ROADMAP.md for next Planned item..."
  ITEM_HEADER=$(get_next_roadmap_item) || {
    log_warn "No Planned items in ROADMAP.md. Nothing to do."
    exit 0
  }
  log_info "Found: $ITEM_HEADER"
else
  ITEM_HEADER="$ITEM_ID"
  log_info "Targeting specific item: $ITEM_HEADER"
fi

TODAY=$(date +%Y%m%d)
BRANCH_SLUG=$(echo "$ITEM_HEADER" | grep -oE '[A-Z]+-[0-9]+' | head -1 | tr '[:upper:]' '[:lower:]')
BRANCH_SLUG="${BRANCH_SLUG:-roadmap-item}"

PROMPT="You are implementing a ROADMAP item for the Entitlement OS project.

TASK: Implement the following ROADMAP item:
${ITEM_HEADER}

INSTRUCTIONS:
1. Read ROADMAP.md and find the full details for this item (problem, expected outcome, acceptance criteria, target files).

2. Implement the feature/fix as described:
   - Follow all patterns in AGENTS.md
   - Use the canonical auth pattern for any API routes
   - Add proper Zod validation
   - Follow existing code patterns in the codebase

3. Write tests that cover the acceptance criteria:
   - Auth 401/403 tests for any new routes
   - Input validation tests
   - Happy-path tests
   - Idempotency tests if applicable

4. Run the full MVP verification:
   pnpm lint && pnpm typecheck && pnpm test && pnpm build

5. If all pass, create a branch and commit:
   git checkout -b auto/${BRANCH_SLUG}-${TODAY}
   git add -A
   git commit -m 'feat: implement ${ITEM_HEADER}'

6. Update ROADMAP.md:
   - Change the item Status from Planned to Done
   - Add a Completion note
   - Add Operational verification section

7. Commit the ROADMAP update:
   git add ROADMAP.md
   git commit -m 'docs: mark ${ITEM_HEADER} as Done in ROADMAP'

8. Push and create PR:
   git push -u origin HEAD
   gh pr create --title 'feat: ${ITEM_HEADER}' --body 'Implements ROADMAP item. See ROADMAP.md for full acceptance criteria and verification.'

Do NOT skip any verification steps. If tests fail, fix them before committing."

run_codex_yolo "$PROMPT"

log_ok "Roadmap implementation complete. Check logs in $LOG_DIR"
