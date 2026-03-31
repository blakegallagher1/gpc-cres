# Cloud Codex Setup Guide

## Prerequisites

1. ChatGPT Plus, Pro, Business, or Enterprise plan
2. GitHub repo connected at chatgpt.com/codex

## Setup Steps

### 1. Connect GitHub

1. Go to chatgpt.com/codex
2. Click "Connect GitHub"
3. Authorize the OpenAI GitHub App for `gallagher-property-company/gallagher-cres`

### 2. Configure environment

In the Cloud Codex environment settings:

**Setup command:**
```bash
corepack enable && pnpm install --frozen-lockfile
```

**Environment variables:**
- `NODE_OPTIONS`: `--max-old-space-size=4096`

**Internet access:** Enabled (needed for pnpm install)

### 3. Usage patterns

**From chatgpt.com/codex:**
- "Fix the failing CI on branch feat/xyz"
- "Add tests for apps/web/app/api/deals/route.ts"
- "Refactor the enrichment handler to use the resilient tool wrapper"

**From GitHub issues:**
- Create issue using the "Codex Task" template
- Add comment: `@codex please implement this`
- Codex creates a PR with the implementation

**From GitHub PRs:**
- Comment: `@codex fix the failing checks`
- Comment: `@codex add test coverage for the new endpoint`

### 4. Parallel execution

Cloud Codex runs tasks in isolated sandboxes. You can:
- Open multiple tasks simultaneously at chatgpt.com/codex
- Each gets its own environment, branch, and PR
- Review and merge independently

### 5. Limitations

- Cloud environments are ephemeral — no state between runs
- Cannot access the Windows server (no Tailscale)
- Cannot access production database
- Best for: code changes, tests, refactoring, documentation
- Not for: infrastructure ops, database migrations, server debugging
