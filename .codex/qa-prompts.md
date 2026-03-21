# QA Subagent Prompts for Entitlement OS

## Full QA Suite (all 5 agents in parallel)

```
Run a full QA sweep of gallagherpropco.com. Spawn all five QA agents in parallel:

1. qa_smoke — Run Playwright E2E smoke tests on every critical user path: auth flow, sidebar navigation (/market, /command-center, /map, /deals, /workflow, /prospecting, /saved-searches), deal pipeline CRUD, chat send/receive, command center KPIs, and admin panel. Screenshot every page. Report pass/fail per route.

2. qa_api — Test all API routes: hit /api/health for baseline, then test auth enforcement on /api/deals, /api/parcels, /api/chat, /api/agent/tools/execute, /api/map, /api/workflows, /api/admin/stats WITHOUT auth (expect 401/403, not 200 or 500). Run the Jest test suites for apps/web, packages/openai, and packages/db. Pull the last 24h of unresolved Sentry issues and correlate any 500s with routes tested.

3. qa_map — Verify the full map pipeline: Martin tile server health, parcel search with known addresses ("Airline Hwy", "Plank Rd"), map page rendering in Playwright (tiles load, parcels draw, detail panel opens on click), and tile response latency (flag anything over 200ms avg). Run the map E2E spec.

4. qa_agents — Validate the AI pipeline: check tool catalog wiring in createConfiguredCoordinator() matches toolCatalog.ts, test /api/agent/tools/execute with recall_property_intelligence and parcel_triage_score, open chat in Playwright and send "What properties do we have in Baton Rouge?", run the chat-learning E2E spec, and run the packages/openai test suite.

5. qa_perf — Measure performance: page load times for all critical routes (flag >3s), API response latency for /api/health, /api/deals, /api/parcels (3x each, report median), Martin tile response times (5x, report min/avg/max), run a production build and report the top 5 largest pages by JS bundle size, and check Sentry for performance-class issues.

Wait for all five to finish. Then produce a consolidated QA report with:
- Overall health: GREEN / YELLOW / RED
- Per-surface pass/fail table (UI, API, Map, AI, Perf)
- Critical issues list (anything blocking users)
- Warning issues list (degraded but functional)
- Recommended fixes in priority order

If any agent finds a critical issue, have reviewer triage it, then web-agent or db-agent fix it, reviewer verify the fix, and shipper deploy it. Repeat until all critical issues are resolved.
```

## Quick Smoke Only (fastest, ~2 min)

```
Spawn qa_smoke to run a quick smoke test of gallagherpropco.com. Hit every sidebar route, screenshot each page, and report any that fail to load or show errors.
```

## API + Sentry Health Check

```
Spawn qa_api to test all API routes for auth enforcement and health. Also pull the last 24h of Sentry issues and flag any unresolved 500s. Report a pass/fail table by route.
```

## Map Pipeline Verification

```
Spawn qa_map to verify the full map pipeline: Martin tiles, parcel search, map rendering, and parcel detail interaction. Screenshot the map at different zoom levels and report any tile failures or rendering issues.
```

## AI Agent Pipeline Test

```
Spawn qa_agents to validate the AI coordinator tool wiring, test tool execution, and verify chat end-to-end. Run the chat-learning E2E spec and the packages/openai test suite. Flag any Zod validation errors or tool wiring mismatches.
```

## Performance Regression Check

```
Spawn qa_perf to measure performance against the March 2026 stabilization baselines. Report page load times, API latency, tile speed, and bundle sizes. Flag any regressions over 2x baseline.
```

## QA + Auto-Fix Loop

```
Run the full QA suite (spawn qa_smoke, qa_api, qa_map, qa_agents, qa_perf in parallel). After results come back:

For every CRITICAL or HIGH severity issue found:
1. Have explorer trace the root cause
2. Have reviewer confirm it's a real bug and assess blast radius
3. Have web-agent or db-agent implement the smallest correct fix
4. Have reviewer verify the fix passes org-scoping and auth checks
5. Have shipper commit and deploy
6. Re-run the specific QA agent that found the issue to confirm the fix

Loop until all critical/high issues are resolved. Report the final state.
```
