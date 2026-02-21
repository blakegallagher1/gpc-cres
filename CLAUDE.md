# CLAUDE.md

Last reviewed: 2026-02-20

## Project Overview

**Entitlement OS** — Internal operating system for Gallagher Property Company, a commercial real estate investment and development firm focused on light industrial, outdoor storage, and truck parking in Louisiana. The platform combines a 14-agent AI coordinator with a deal pipeline UI, property database integration, and document generation to manufacture certainty in entitlement processes.

**Live at:** gallagherpropco.com
**Deployed on:** Vercel (frontend) + Local 12-core i7 Windows 11 (Docker Compose: FastAPI gateway :8000, Martin tiles :3000, PostgreSQL/Qdrant internal, Cloudflare Tunnel)

**Architecture (verified 2026-02-20):** Docker Compose on Windows 11 — FastAPI gateway (:8000), Martin (:3000), PostgreSQL + Qdrant on internal Docker network, single Cloudflare Tunnel with remotely-managed ingress rules. All P0/P1/P2 deployment blockers resolved. See `PHASE_3_DEPLOYMENT_BLOCKERS.md` for deployment evidence.

## Key Rules

### Do This
- Use `.nullable()` (not `.optional()`) for Zod tool parameters — OpenAI structured outputs requires it
- Use plain `z.string()` — never `z.string().url()` or `z.string().email()` (OpenAI rejects `format:` constraints)
- Wire agent tools in `createConfiguredCoordinator()`, not on module-level exports
- Scope all DB queries with `orgId` for multi-tenant isolation
- Dispatch automation events with `.catch(() => {})` — fire-and-forget, never blocks API response
- Import `@/lib/automation/handlers` at top of any API route that dispatches events (ensures handler registration)
- Use `import "server-only"` in modules that touch Supabase service-role keys — prevents client-side bundling
- Force-add `apps/web/lib/` files to git — root `.gitignore` has `lib/` pattern
- Delete `apps/web/.next/` before CLI deploys to avoid FUNCTION_PAYLOAD_TOO_LARGE
- Use `--archive=tgz` for Vercel CLI deploys (>15K files)

### Don't Do This
- Don't delete `legacy/python/` or `apps/worker/` — parked for reference/v2
- Don't use Chat Completions API — use OpenAI Responses API
- Don't auto-advance deals past TRIAGE_DONE — all post-triage status transitions require human approval (see `gates.ts`)
- Don't auto-send buyer outreach emails — `buyerOutreach.neverAutoSend` is `true`; handlers only create review tasks
- Don't call `dispatchEvent()` without `.catch(() => {})` — unhandled promise rejections crash the route
- Don't prefix Supabase service-role keys with `NEXT_PUBLIC_` — they are server-only secrets
- Don't use `any` type — use `Record<string, unknown>` for dynamic objects

## ROADMAP-FIRST IMPLEMENTATION PROTOCOL (MANDATORY)

Before implementing or changing any feature:

1. Check `ROADMAP.md` first.
2. Only work items that are actively marked (`Planned`/in-progress) in that file.
3. When adding new ideas, require a value-analysis before planning:
   - Problem statement and impacted user path
   - Measurable expected outcome
   - Evidence from logs/tests/reports that this is needed
   - Alignment with existing architecture, security, and org-scoping rules
   - Acceptance criteria and test plan
4. If value is unclear or impact is low, mark as `Deferred` with reason and expected revisit date.
5. After completion, update `ROADMAP.md` with results/evidence and status.

The same protocol applies to every future agent session to avoid ad-hoc implementation drift.

## Context Discipline

- Do NOT pre-read files speculatively
- Do NOT read test files unless fixing a test
- Read `/docs/claude/` files only when directly relevant to current task

## Detailed Documentation

For architecture, conventions, workflows, and reference details, see:
- `/docs/claude/architecture.md` — Tech stack, agents, data model, automation, local API
- `/docs/claude/conventions.md` — Code style, naming, patterns
- `/docs/claude/workflows.md` — Agent tool wiring, event dispatch, property DB search, Vercel deploy
- `/docs/claude/reference.md` — Build commands, env vars, CI/CD, gotchas
