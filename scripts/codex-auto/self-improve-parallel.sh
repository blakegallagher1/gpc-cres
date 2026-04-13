#!/usr/bin/env bash
# ============================================================================
# self-improve-parallel.sh — Parallel multi-agent self-improvement
# ============================================================================
# Spawns 6 Codex agents simultaneously, one per quality dimension, each in
# its own git worktree. All 6 run at the same time. Collects all results,
# opens up to 6 PRs, and appends a combined cycle entry to compound-log.md.
#
# What you get vs. sequential:
#   Before: 1 improvement per 30 min cycle
#   After:  6 improvements in the same 30 min
#
# Usage:
#   ./scripts/codex-auto/self-improve-parallel.sh            # Run one parallel cycle
#   ./scripts/codex-auto/self-improve-parallel.sh --dry-run  # Show what would run
# ============================================================================

source "$(dirname "$0")/common.sh"

require_codex

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ---------- Paths ----------
IMPROVE_DIR="${REPO_ROOT}/output/self-improve"
COMPOUND_LOG="${IMPROVE_DIR}/compound-log.md"
CYCLE_COUNTER="${IMPROVE_DIR}/cycle-counter.txt"
WORKTREE_BASE="/tmp/gpc-self-improve"

mkdir -p "$IMPROVE_DIR"

CYCLE_N=1
[[ -f "$CYCLE_COUNTER" ]] && CYCLE_N=$(cat "$CYCLE_COUNTER")
TODAY=$(date +%Y%m%d)

# ---------- Domains ----------
DOMAINS="security reliability types auth tests perf"

domain_label() {
  case "$1" in
    security)    echo "Security: Missing orgId scoping" ;;
    reliability) echo "Reliability: Unhandled promises" ;;
    types)       echo "Type Safety: any → Record<string,unknown>" ;;
    auth)        echo "Auth: Missing resolveAuth() on routes" ;;
    tests)       echo "Test Coverage: Critical paths with zero tests" ;;
    perf)        echo "Performance: N+1 queries / unbounded fetches" ;;
  esac
}

worktree_path() { echo "${WORKTREE_BASE}-${1}-${CYCLE_N}"; }
pid_file()      { echo "/tmp/gpc-improve-${1}-pid"; }
result_file()   { echo "/tmp/gpc-improve-${1}-result.json"; }

# ---------- Per-domain prompts ----------
domain_prompt() {
  local domain="$1"
  local cycle="$2"
  local compound_log_contents
  compound_log_contents=$(cat "$COMPOUND_LOG" 2>/dev/null || echo "(no prior cycles)")

  case "$domain" in
  security)
    cat <<PROMPT
You are running the SECURITY agent for Self-Improvement Cycle ${cycle}.

PRIOR CYCLES — do not repeat these improvements:
${compound_log_contents}

YOUR DOMAIN ONLY: Find Prisma queries missing orgId tenant isolation.

1. grep -r "prisma\." apps/web --include="*.ts" | grep -v "orgId" | grep -v "node_modules" | grep -v ".next"
2. Pick the highest-risk instance (production API route > background job > utility).
3. Add the missing orgId scope. Follow the resolveAuth() pattern from CLAUDE.md.
4. Run: pnpm typecheck && pnpm lint
5. git add -A && git commit -m "fix(security): add orgId scope — [file] (Cycle ${cycle})"
6. gh pr create --title "fix(security): add orgId tenant scope (Cycle ${cycle})" --body "Auto-fix by self-improve security agent. Review before merging."
7. Write to $(result_file security):
   {"domain":"security","improvement":"<one-line>","files":["<file>"],"metric_before":"<N>","metric_after":"<N-1>","pr_url":"<url>","success":true}

If nothing to fix: {"domain":"security","improvement":"none needed","success":true,"metric_before":"0","metric_after":"0","pr_url":null}
PROMPT
    ;;

  reliability)
    cat <<PROMPT
You are running the RELIABILITY agent for Self-Improvement Cycle ${cycle}.

PRIOR CYCLES — do not repeat these improvements:
${compound_log_contents}

YOUR DOMAIN ONLY: Find dispatchEvent() calls or floating async operations missing .catch(() => {}).

1. grep -rn "dispatchEvent\|\.dispatch(" apps/web --include="*.ts" | grep -v "\.catch" | grep -v node_modules
2. Also find unhandled floating promises in API routes.
3. Fix the highest-risk instance (production API route first).
4. Run: pnpm typecheck && pnpm lint
5. git add -A && git commit -m "fix(reliability): add .catch() to fire-and-forget — [file] (Cycle ${cycle})"
6. gh pr create --title "fix(reliability): unhandled promise safety (Cycle ${cycle})" --body "Auto-fix by self-improve reliability agent. Review before merging."
7. Write to $(result_file reliability):
   {"domain":"reliability","improvement":"<one-line>","files":["<file>"],"metric_before":"<N>","metric_after":"<N-1>","pr_url":"<url>","success":true}

If nothing to fix: {"domain":"reliability","improvement":"none needed","success":true,"metric_before":"0","metric_after":"0","pr_url":null}
PROMPT
    ;;

  types)
    cat <<PROMPT
You are running the TYPE SAFETY agent for Self-Improvement Cycle ${cycle}.

PRIOR CYCLES — do not repeat these improvements:
${compound_log_contents}

YOUR DOMAIN ONLY: Replace \`any\` types with \`Record<string, unknown>\` or a proper typed interface.

1. grep -rn ": any\b\|<any>\|as any\b" apps/web/lib apps/web/app packages --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
2. Pick the most critical code path (agent tools > API routes > utilities > UI).
3. Replace with correct type. Add a proper interface if the shape is known.
4. Run: pnpm typecheck && pnpm lint
5. git add -A && git commit -m "fix(types): replace any with typed interface — [file] (Cycle ${cycle})"
6. gh pr create --title "fix(types): eliminate any type (Cycle ${cycle})" --body "Auto-fix by self-improve types agent. Review before merging."
7. Write to $(result_file types):
   {"domain":"types","improvement":"<one-line>","files":["<file>"],"metric_before":"<N>","metric_after":"<N-1>","pr_url":"<url>","success":true}

If nothing to fix: {"domain":"types","improvement":"none needed","success":true,"metric_before":"0","metric_after":"0","pr_url":null}
PROMPT
    ;;

  auth)
    cat <<PROMPT
You are running the AUTH agent for Self-Improvement Cycle ${cycle}.

PRIOR CYCLES — do not repeat these improvements:
${compound_log_contents}

YOUR DOMAIN ONLY: Find API route handlers missing resolveAuth() before any DB operation.

1. find apps/web/app/api -name "route.ts" | xargs grep -L "resolveAuth" 2>/dev/null
2. Pick the highest-risk unprotected route.
3. Add resolveAuth() and scope all queries with the returned orgId.
4. Run: pnpm typecheck && pnpm lint
5. git add -A && git commit -m "fix(auth): add resolveAuth() to unprotected route — [file] (Cycle ${cycle})"
6. gh pr create --title "fix(auth): protect unauthenticated route (Cycle ${cycle})" --body "Auto-fix by self-improve auth agent. Review before merging."
7. Write to $(result_file auth):
   {"domain":"auth","improvement":"<one-line>","files":["<file>"],"metric_before":"<N>","metric_after":"<N-1>","pr_url":"<url>","success":true}

If nothing to fix: {"domain":"auth","improvement":"none needed","success":true,"metric_before":"0","metric_after":"0","pr_url":null}
PROMPT
    ;;

  tests)
    cat <<PROMPT
You are running the TEST COVERAGE agent for Self-Improvement Cycle ${cycle}.

PRIOR CYCLES — do not repeat these improvements:
${compound_log_contents}

YOUR DOMAIN ONLY: Find critical code with zero test coverage and add a meaningful test.

1. Look at packages/ and apps/web/lib/ — find files with no *.test.ts or *.spec.ts counterpart.
2. Priority: agent tools > automation handlers > API route logic > utilities.
3. Write a focused unit test covering the happy path AND one error case.
4. Run: pnpm typecheck && pnpm lint
5. git add -A && git commit -m "test: add coverage for [module] (Cycle ${cycle})"
6. gh pr create --title "test: add missing coverage (Cycle ${cycle})" --body "Auto-fix by self-improve tests agent. Review before merging."
7. Write to $(result_file tests):
   {"domain":"tests","improvement":"<one-line>","files":["<file>"],"metric_before":"0 tests","metric_after":"<N> tests","pr_url":"<url>","success":true}

If nothing meaningful to test: {"domain":"tests","improvement":"none needed","success":true,"metric_before":"adequate","metric_after":"adequate","pr_url":null}
PROMPT
    ;;

  perf)
    cat <<PROMPT
You are running the PERFORMANCE agent for Self-Improvement Cycle ${cycle}.

PRIOR CYCLES — do not repeat these improvements:
${compound_log_contents}

YOUR DOMAIN ONLY: Find unbounded queries, N+1 patterns, or missing pagination limits.

1. grep -rn "findMany\b" apps/web --include="*.ts" | grep -v "node_modules" | grep -v "take:\|limit:\|_count"
2. Also check raw SQL without LIMIT in gateway or agent tools.
3. Fix the most impactful instance: add take/limit, replace SELECT *, or batch a loop.
4. Run: pnpm typecheck && pnpm lint
5. git add -A && git commit -m "perf: bound unbounded query — [file] (Cycle ${cycle})"
6. gh pr create --title "perf: bound unbounded DB query (Cycle ${cycle})" --body "Auto-fix by self-improve perf agent. Review before merging."
7. Write to $(result_file perf):
   {"domain":"perf","improvement":"<one-line>","files":["<file>"],"metric_before":"unbounded","metric_after":"bounded","pr_url":"<url>","success":true}

If nothing to fix: {"domain":"perf","improvement":"none needed","success":true,"metric_before":"clean","metric_after":"clean","pr_url":null}
PROMPT
    ;;
  esac
}

# ---------- Initialize compound log ----------
if [[ ! -f "$COMPOUND_LOG" ]]; then
  cat > "$COMPOUND_LOG" <<'EOF'
# Self-Improvement Compound Log

Records every autonomous improvement cycle. Memory system injects this at
session start — each cycle compounds on all prior cycles.

---

EOF
  echo "1" > "$CYCLE_COUNTER"
  CYCLE_N=1
fi

log_info "=========================================="
log_info "  Self-Improve: Parallel Multi-Agent Mode"
log_info "  Cycle $CYCLE_N — 6 agents launching simultaneously"
log_info "  $(date)"
log_info "=========================================="

if $DRY_RUN; then
  log_info "[DRY RUN] Would launch 6 parallel Codex agents:"
  for domain in $DOMAINS; do
    log_info "  → $(domain_label "$domain")"
    log_info "    worktree: $(worktree_path "$domain")"
    log_info "    branch:   auto/self-improve-${CYCLE_N}-${domain}-${TODAY}"
  done
  exit 0
fi

cd "$REPO_ROOT"
# Fetch latest without disturbing local working tree state
git fetch origin 2>/dev/null || true
# Worktrees branch off origin/main — no need to switch the current branch
MAIN_REF="origin/main"
git show-ref --verify --quiet refs/remotes/origin/main 2>/dev/null \
  || MAIN_REF="origin/master"

# ---------- Setup: create worktrees + symlink node_modules ----------
log_info "Creating 6 git worktrees..."

for domain in $DOMAINS; do
  wt="$(worktree_path "$domain")"
  branch="auto/self-improve-${CYCLE_N}-${domain}-${TODAY}"

  # Clean stale worktree
  if [[ -d "$wt" ]]; then
    git worktree remove "$wt" --force 2>/dev/null || rm -rf "$wt"
  fi
  git branch -D "$branch" 2>/dev/null || true

  git worktree add "$wt" -b "$branch" "$MAIN_REF" 2>/dev/null
  log_ok "  Worktree: $domain → $wt"

  # Write a minimal Spark-compatible .codex/config.toml (NOT a symlink).
  # Symlinking the repo .codex inherits model_reasoning_summary which Spark rejects.
  mkdir -p "${wt}/.codex"
  cat > "${wt}/.codex/config.toml" <<'SPARK_CONFIG'
#:schema https://developers.openai.com/codex/config-schema.json
approval_policy        = "never"
sandbox_mode           = "danger-full-access"
model_reasoning_effort = "medium"
web_search             = "live"
SPARK_CONFIG

  # Symlink node_modules so typecheck/lint work without reinstalling
  ln -sf "${REPO_ROOT}/node_modules" "${wt}/node_modules"
  for pkg_dir in apps/web apps/worker packages/db packages/openai packages/server packages/shared packages/gateway-client packages/evidence; do
    if [[ -d "${REPO_ROOT}/${pkg_dir}/node_modules" ]]; then
      mkdir -p "${wt}/${pkg_dir}"
      ln -sf "${REPO_ROOT}/${pkg_dir}/node_modules" "${wt}/${pkg_dir}/node_modules"
    fi
  done
done

# ---------- Launch all 6 agents in parallel ----------
log_info "Launching 6 Codex agents in parallel..."

for domain in $DOMAINS; do
  wt="$(worktree_path "$domain")"
  rf="$(result_file "$domain")"
  agent_log="${LOG_DIR}/${TIMESTAMP}-self-improve-${CYCLE_N}-${domain}.log"
  rm -f "$rf"
  prompt="$(domain_prompt "$domain" "$CYCLE_N")"

  (
    codex exec \
      -C "$wt" \
      --dangerously-bypass-approvals-and-sandbox \
      --model gpt-5.3-codex-spark \
      "$prompt" \
      > "$agent_log" 2>&1

    # Fallback result if Codex didn't write one
    if [[ ! -f "$rf" ]]; then
      printf '{"domain":"%s","improvement":"no output","success":false,"metric_before":"?","metric_after":"?","pr_url":null}\n' \
        "$domain" > "$rf"
    fi
  ) &

  echo $! > "$(pid_file "$domain")"
  log_info "  Agent launched: $(domain_label "$domain") (PID $!)"
done

log_info "All 6 agents running — waiting for completion..."

# ---------- Wait for all agents ----------
for domain in $DOMAINS; do
  pf="$(pid_file "$domain")"
  if [[ -f "$pf" ]]; then
    pid=$(cat "$pf")
    if wait "$pid" 2>/dev/null; then
      log_ok "  Done: $domain"
    else
      log_warn "  Non-zero exit: $domain"
    fi
    rm -f "$pf"
  fi
done

# ---------- Collect results ----------
log_info "Collecting results..."

IMPROVEMENTS_MADE=0
{
  printf "## Cycle %s — %s (Parallel: 6 agents)\n\n" "$CYCLE_N" "$(date +%Y-%m-%d)"

  for domain in $DOMAINS; do
    rf="$(result_file "$domain")"
    agent_log="${LOG_DIR}/${TIMESTAMP}-self-improve-${CYCLE_N}-${domain}.log"

    improvement="unknown"; pr_url=""; metric_before="?"; metric_after="?"; success="FALSE"

    if [[ -f "$rf" ]]; then
      improvement=$(python3 -c "import json; d=json.load(open('$rf')); print(d.get('improvement','unknown'))" 2>/dev/null || echo "parse error")
      pr_url=$(python3 -c "import json; d=json.load(open('$rf')); print(d.get('pr_url','') or '')" 2>/dev/null || echo "")
      metric_before=$(python3 -c "import json; d=json.load(open('$rf')); print(d.get('metric_before','?'))" 2>/dev/null || echo "?")
      metric_after=$(python3 -c "import json; d=json.load(open('$rf')); print(d.get('metric_after','?'))" 2>/dev/null || echo "?")
      success=$(python3 -c "import json; d=json.load(open('$rf')); print(str(d.get('success',False)).upper())" 2>/dev/null || echo "FALSE")
    fi

    if [[ "$improvement" != "none needed" && "$success" == "TRUE" ]]; then
      IMPROVEMENTS_MADE=$((IMPROVEMENTS_MADE + 1))
      log_ok "  $domain: $improvement${pr_url:+ → $pr_url}"
    else
      log_info "  $domain: clean (nothing to fix)"
    fi

    printf '### %s\n' "$(domain_label "$domain")"
    printf '%s\n' "- **Improvement:** ${improvement}"
    printf '%s\n' "- **Metric:** ${metric_before} → ${metric_after}"
    [[ -n "$pr_url" ]] && printf '%s\n' "- **PR:** ${pr_url}"
    printf '%s\n\n' "- **Log:** ${agent_log}"
  done

  printf '%s\n\n' "---"
} >> "$COMPOUND_LOG"

# Increment cycle counter
echo $((CYCLE_N + 1)) > "$CYCLE_COUNTER"

# ---------- Cleanup worktrees ----------
log_info "Cleaning up worktrees..."
for domain in $DOMAINS; do
  wt="$(worktree_path "$domain")"
  git worktree remove "$wt" --force 2>/dev/null || rm -rf "$wt"
done
git worktree prune 2>/dev/null

log_ok "=========================================="
log_ok "  Parallel Self-Improve Cycle ${CYCLE_N} Complete"
log_ok "  Improvements made: ${IMPROVEMENTS_MADE} / 6"
log_ok "  Compound log: $COMPOUND_LOG"
log_ok "  Logs: $LOG_DIR"
log_ok "=========================================="
