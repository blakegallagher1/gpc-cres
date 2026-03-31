# AGENTS.md — Entitlement OS (gallagher-cres)

## IMPLEMENTATION PROTOCOL (READ THIS FIRST)

**You are here to write code, not to analyze the codebase.**

1. **Read the plan or prompt.** Understand what files you need to create/modify.
2. **Read at most 3-5 source files** directly relevant to your task. Do NOT pre-read files "for context."
3. **If modifying API routes or DB queries, read `packages/db/prisma/schema.prisma`** to confirm field names exist. Don't assume — check.
4. **Start writing code within your first 5 tool calls.** If you've read 5 files and haven't written anything, you are stalling — pick the simplest file and start.
5. **Implement one file at a time.** Write it, save it, move to the next. Do not draft multiple files in your head.
6. **Run `pnpm typecheck` after EVERY file you write or modify.** Do not skip this. Do not batch multiple files before typechecking. Catching errors early saves 10x the time of catching them at build.
7. **Never re-read a file you already read** in this session. Take notes on what you need, then proceed.
8. **Never read files not mentioned in the task** unless you hit an import error or type you need to resolve.
9. **If a plan has multiple features, implement them sequentially.** Finish feature 1, test it, then start feature 2.
10. **Get the whole change right in one edit per file.** If you're editing the same file 3+ times, you're not thinking through the change before writing it. Read the file once, plan ALL your edits, apply them in one pass.
11. **When context feels large, write what you have.** Partial working code > perfect plan that exhausts context.
12. **Ship when tests pass.** Stage specific files with `git add <files>`, then `~/.codex/bin/gcommit "feat(scope): message"` and `~/.codex/bin/gpush`. Do NOT use `git add -A`.

### Anti-patterns That Waste Context
- Reading the same file twice → take notes the first time
- Reading `.tsbuildinfo`, `pnpm-lock.yaml`, or `node_modules/` files → never useful
- Reading `docs/` files not referenced in the task → won't help you write code
- Running `git status` or `git diff` repeatedly → once at the start is enough
- Planning all files before writing any → implement incrementally instead
- Editing the same file 5+ times → think through ALL changes before your first edit
- Skipping typecheck between files → errors compound; fix them immediately
- Assuming a Prisma field exists without reading schema.prisma → causes build failures
- Using `git add -A` → stages unrelated files, creates mixed commits

## Project Overview

Entitlement OS: full-stack real estate platform. pnpm monorepo, Next.js frontend (Vercel), shared TS packages, FastAPI gateway behind Cloudflare Tunnel.

- **Frontend:** `apps/web/` — Next.js, React, TailwindCSS, TypeScript (Vercel)
- **Packages:** `packages/{shared,db,evidence,artifacts,openai,server,gateway-client}/`
- **Gateway:** `infra/local-api/` — FastAPI (Docker, `api.gallagherpropco.com`)
- **Agent runtime:** `infra/cloudflare-agent/` — CF Workers + Durable Objects
- **Parked (don't touch):** `legacy/python/`, `apps/worker/`

## Dependency Layers (STRICT)

```
L0: packages/shared       — ZERO internal imports
L1: packages/db            — Prisma client only
L2: packages/evidence, packages/artifacts
L3: packages/openai, packages/server, packages/gateway-client
L4: apps/web               — leaf consumer
L5: infra/*                 — separate runtimes, HTTP only
```

**Import direction:** L4 → L3 → L2 → L1 → L0. Never reverse. Circular deps = CI blocker.

## Code Conventions

- TypeScript strict mode everywhere
- No `any` — use `unknown` with type guards
- Zod schemas for API validation
- Server components by default; `'use client'` only when needed
- Named exports only (except Next.js pages)
- No `console.log` in production — use structured logger
- No TODO comments — file issues instead
- Functions under 50 lines; modules under 500 LoC

## Verification Commands

```bash
pnpm typecheck              # TypeScript — run after every 1-2 file changes
pnpm lint                   # ESLint
pnpm test                   # Vitest
pnpm build                  # Full build (run before shipping)
```

## Shipping (MANDATORY)

When verification passes, commit and push — do not ask for permission.

```bash
# ALWAYS stage specific files first — never use git add -A
git add apps/web/components/maps/MyNewFile.tsx apps/web/components/maps/existingFile.ts

# Then commit (only commits staged files):
~/.codex/bin/gcommit "feat(scope): description"
~/.codex/bin/gpush

# Or combined (still requires pre-staging):
~/.codex/bin/gship "feat(scope): description"
```

Use `gcommit`/`gpush`/`gship` wrappers — raw `git commit`/`git push` is blocked by Codex CLI safety layer.
**Do NOT use `git add -A` or `git add .`** — these stage unrelated dirty files and create mixed-concern commits.

**Playwright cleanup** — after any Playwright run:
```bash
git checkout -- apps/web/next-env.d.ts apps/web/tsconfig.json
```

## What NOT To Do

- Don't modify Prisma migrations already applied to production
- Don't modify `.env` / `.env.local` / `.env.login`
- Don't delete `legacy/python/` or `apps/worker/`
- Don't add new workspace packages without updating `pnpm-workspace.yaml`
- Don't use `git add -A` — stage specific files
- Don't use destructive git commands without approval

## Reference Docs (read ONLY when needed for a specific task)

- Server ops & debugging: `docs/SERVER_MANAGEMENT.md`, `skills/server-ops/SKILL.md`
- Auth debugging: see "Debugging Auth / DB Connectivity" section in `docs/claude/backend.md`
- Architecture details: `docs/claude/architecture.md`
- Backend/gateway: `docs/claude/backend.md`
- Workflows: `docs/claude/workflows.md`
- CUA browser agent: `docs/plans/2026-03-25-cua-browser-agent-design.md`
