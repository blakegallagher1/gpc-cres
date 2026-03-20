---
name: type-hardening
description: Eliminate `any` types, tighten Zod schemas, and enforce strict TypeScript across the monorepo
triggers:
  - "harden types"
  - "fix any types"
  - "type safety"
  - "strict typescript"
---

# Type Hardening Skill

Systematically eliminate unsafe types and strengthen schema validation across
the Entitlement OS monorepo.

## Workflow

1. **Scan** — Find all `any` types and weak typing:
   ```
   rg '\bany\b' --type ts --glob '!node_modules' --glob '!*.d.ts' -c
   rg 'as any' --type ts --glob '!node_modules' -l
   rg '@ts-ignore' --type ts --glob '!node_modules' -l
   rg '@ts-expect-error' --type ts --glob '!node_modules' -l
   ```

2. **Prioritize** — Fix in order of blast radius:
   - `packages/shared/` (Zod schemas used everywhere)
   - `packages/openai/` (API response types)
   - `packages/db/` (Prisma types, usually already strong)
   - `packages/evidence/` (hash/extract types)
   - `apps/web/` API routes (request/response types)
   - `apps/web/` components (props types)
   - `apps/worker/` (workflow input/output types)

3. **For each `any` found:**
   - Determine the actual type from usage context
   - Replace `any` with the concrete type or a Zod-inferred type
   - If the type is truly unknown, use `unknown` with a type guard
   - Never use `as any` — use proper type narrowing instead
   - Add Zod `.parse()` at system boundaries

4. **Zod schema tightening:**
   - Ensure all API route handlers validate input with `.parse()`
   - Ensure all OpenAI response schemas use `.strict()`
   - Add `.brand()` for nominal types where confusion is possible
   - Verify no `.passthrough()` on security-sensitive schemas

5. **Verify** — After each file:
   ```
   pnpm typecheck
   pnpm test
   ```

## Rules

- Never introduce `@ts-ignore` or `@ts-expect-error`
- Never weaken existing Zod schemas
- Prefer Zod `.infer<>` over manual type declarations
- Keep changes minimal — one type fix per commit is fine
- If a type requires a new shared type, add it to `packages/shared/`
