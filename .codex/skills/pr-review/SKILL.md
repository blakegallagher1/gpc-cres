---
name: pr-review
description: "Structured PR review using headless Codex. Use when the user asks to review a PR, review a pull request, check a PR, or code review."
triggers:
  - "review pr"
  - "review pull request"
  - "code review"
  - "check pr"
  - "review #"
---

# PR Review Skill

Run a structured, multi-dimensional code review on any pull request.

## Quick Start

```bash
# Review PR by number:
./scripts/codex-auto/pipeline.sh review 42

# Review the latest PR on current branch:
CURRENT_PR=$(gh pr view --json number --jq '.number' 2>/dev/null)
./scripts/codex-auto/pipeline.sh review "$CURRENT_PR"
```

## What Gets Reviewed

The review uses a structured output schema (`scripts/codex-auto/schemas/review-output.json`) that evaluates:

| Dimension | What it checks |
|-----------|---------------|
| **Security** | Injection, auth bypass, secret exposure, org-scoping gaps |
| **Correctness** | Logic errors, edge cases, null handling, race conditions |
| **Performance** | N+1 queries, missing indexes, unbounded fetches, bundle size |
| **Style** | Naming, patterns, consistency with existing code |
| **Testing** | Coverage gaps, missing edge case tests, snapshot staleness |

Each finding includes:
- `severity`: critical / warning / info
- `file` + `line`: exact location
- `suggestion`: concrete fix (not just "consider...")

## Workflow

1. **Run the review:**
   ```bash
   ./scripts/codex-auto/pipeline.sh review <pr-number>
   ```

2. **Read the output** — results land in:
   ```
   scripts/codex-auto/logs/review-<timestamp>/
   ├── review.json          # Structured findings
   ├── review.log           # Full Codex output
   └── summary.md           # Human-readable summary
   ```

3. **Act on findings:**
   - Critical → fix before merge
   - Warning → fix or document why it's OK
   - Info → nice-to-have, skip if time-constrained

## GitHub Action (Automatic)

`.github/workflows/codex-review.yml` runs automatically on every PR:
- Posts a review comment with structured findings
- Labels PRs with `codex-reviewed`
- Blocks merge on critical findings (if branch protection is configured)

## Tips

- Review a specific commit range: check out the branch, then `pipeline.sh review`
- For deeper analysis, use the `review` profile: `CODEX_PROFILE=review pipeline.sh review 42`
- Combine with fix: if review finds issues, run `pipeline.sh fix` to auto-remediate
