---
name: playwright
description: "Use when the task requires browser automation OR E2E testing in Entitlement OS. Covers: playwright-cli for ad-hoc browser interaction, AND @playwright/test for spec-based E2E verification gates."
triggers:
  - "playwright"
  - "browser automation"
  - "e2e test"
  - "end to end"
  - "ui flow"
  - "click test"
  - "form fill"
  - "frontend smoke"
  - "verification gate"
---

# Playwright Skill — Entitlement OS

Two modes of operation:

1. **CLI mode** — ad-hoc browser interaction via `playwright-cli` wrapper
2. **Test mode** — `@playwright/test` spec files under `apps/web/e2e/`

## CRITICAL: E2E Test Runner Rules

The `playwright.config.ts` in `apps/web/` defines **named projects**:

| Project    | Device preset     |
|------------|-------------------|
| `chromium` | Desktop Chrome    |
| `firefox`  | Desktop Firefox   |
| `webkit`   | Desktop Safari    |

### Running E2E specs — correct invocations

```bash
# Run all E2E specs (defaults to all projects)
pnpm -C apps/web exec playwright test

# Run a single spec against chromium (most common)
pnpm -C apps/web exec playwright test e2e/chat-learning.spec.ts --project chromium --workers=1

# Run against an already-running dev server (fast iteration, NO build)
PLAYWRIGHT_REUSE_EXISTING_SERVER=true \
PLAYWRIGHT_BASE_URL=http://localhost:3002 \
  pnpm -C apps/web exec playwright test e2e/chat-learning.spec.ts --project chromium --workers=1

# Run headless with reporter
pnpm -C apps/web exec playwright test --project chromium --reporter=list
```

### NEVER do this

```bash
# WRONG: --project chromium on a config without named projects (old bug)
npx playwright test --project chromium  # Error: Project "chromium" not found

# WRONG: npm run build/start (this is a pnpm monorepo)
npm run build && PORT=3100 npm run start  # use pnpm

# WRONG: run against next dev when HMR websocket causes stack overflow
# Use PLAYWRIGHT_REUSE_EXISTING_SERVER=true only when stable
```

### Dev-server vs production-server mode

| Mode | When to use | Command |
|------|-------------|---------|
| Production (default) | CI, verification gates | `pnpm -C apps/web exec playwright test --project chromium` |
| Reuse dev server | Fast local iteration | `PLAYWRIGHT_REUSE_EXISTING_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:3002 pnpm -C apps/web exec playwright test --project chromium` |

The config's `webServer` block builds and starts a production Next.js server automatically when `PLAYWRIGHT_REUSE_EXISTING_SERVER` is not `true`.

### Required env vars for E2E

These are set automatically by `playwright.config.ts` defaults, but can be overridden:

```bash
PLAYWRIGHT_BASE_URL          # default: http://localhost:3100
PLAYWRIGHT_PORT              # default: 3100
PLAYWRIGHT_DATABASE_URL      # default: postgresql://postgres:postgres@localhost:54323/entitlement_os?schema=public
PLAYWRIGHT_REUSE_EXISTING_SERVER  # set "true" to skip build and use running server
OPENAI_API_KEY               # placeholder is fine for non-AI specs
```

### Existing E2E specs

| Spec | What it tests |
|------|--------------|
| `e2e/chat-learning.spec.ts` | Chat → memory store → entity lookup (DB-backed) |
| `e2e/navigation.spec.ts` | Route navigation and sidebar links |
| `e2e/agents.spec.ts` | Agent interaction flows |
| `e2e/admin.spec.ts` | Admin panel functionality |
| `e2e/map.spec.ts` | Map rendering and interaction |
| `e2e/command-center-kpi.spec.ts` | KPI dashboard in command center |
| `e2e/workflows.spec.ts` | Workflow execution flows |

### Writing new E2E specs

```typescript
import { expect, test } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

test.describe("Feature name", () => {
  test("does the thing", async ({ page }) => {
    test.setTimeout(120_000); // generous for slow flows
    await page.goto("/");
    await ensureCopilotClosed(page); // always close copilot first
    // ... test body
  });
});
```

Always use `ensureCopilotClosed(page)` before interacting with non-copilot UI — the panel can intercept clicks.

---

## CLI Mode (ad-hoc browser automation)

Drive a real browser from the terminal using `playwright-cli`. Prefer the bundled wrapper script.

### Entitlement OS mapping

- App routes: `/market`, `/command-center`, `/map`, `/deals`, `/workflow`, `/prospecting`, `/saved-searches`.
- For quick smoke checks, use `ENTITLEMENT_OS_BASE_URL` (default `http://localhost:3000`).
- Generated browser artifacts go under `output/playwright/`.

### Prerequisite check

```bash
command -v npx >/dev/null 2>&1
```

### Skill path (set once)

```bash
export PWCLI="${PWCLI:-$PWD/.codex/skills/playwright/scripts/playwright_cli.sh}"
export ENTITLEMENT_OS_BASE_URL="${ENTITLEMENT_OS_BASE_URL:-http://localhost:3000}"
export PLAYWRIGHT_OUTPUT_DIR="${PLAYWRIGHT_OUTPUT_DIR:-$PWD/output/playwright}"
mkdir -p "$PLAYWRIGHT_OUTPUT_DIR"
```

### Quick start

```bash
"$PWCLI" open https://playwright.dev --headed
"$PWCLI" snapshot
"$PWCLI" click e15
"$PWCLI" type "Playwright"
"$PWCLI" press Enter
"$PWCLI" screenshot "$PLAYWRIGHT_OUTPUT_DIR/playwright-home.png"
```

### Core workflow

1. Open the page
2. Snapshot to get stable element refs
3. Interact using refs from the latest snapshot
4. Re-snapshot after navigation or significant DOM changes
5. Capture artifacts (screenshot, pdf, traces) when useful

### Entitlement OS smoke routes

```bash
"$PWCLI" open "$ENTITLEMENT_OS_BASE_URL/market" --headed
"$PWCLI" snapshot
"$PWCLI" screenshot "$PLAYWRIGHT_OUTPUT_DIR/market.png"

"$PWCLI" open "$ENTITLEMENT_OS_BASE_URL/map" --headed
"$PWCLI" snapshot
"$PWCLI" screenshot "$PLAYWRIGHT_OUTPUT_DIR/map.png"
```

### When to snapshot again

Re-snapshot after: navigation, clicking elements that change UI, opening/closing modals, tab switches.

### Recommended patterns

#### Form fill

```bash
"$PWCLI" open "${ENTITLEMENT_OS_BASE_URL}/example-form"
"$PWCLI" snapshot
"$PWCLI" fill e1 "user@example.com"
"$PWCLI" fill e2 "password123"
"$PWCLI" click e3
"$PWCLI" snapshot
```

#### Debug with traces

```bash
"$PWCLI" open "$ENTITLEMENT_OS_BASE_URL/map" --headed
"$PWCLI" tracing-start
# ...interactions...
"$PWCLI" tracing-stop
"$PWCLI" screenshot "$PLAYWRIGHT_OUTPUT_DIR/map-trace.png"
```

## References

- CLI command reference: `references/cli.md`
- Practical workflows and troubleshooting: `references/workflows.md`

## Guardrails

- Always snapshot before referencing element ids like `e12`.
- Re-snapshot when refs seem stale.
- Prefer explicit commands over `eval` and `run-code` unless needed.
- Use `--headed` when a visual check will help.
- Artifacts go in `output/playwright/` — no new top-level folders.
- For verification gates, use `@playwright/test` with `--project chromium`, not CLI mode.
