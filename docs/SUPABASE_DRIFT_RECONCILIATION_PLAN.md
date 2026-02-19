# Supabase Drift Reconciliation Plan (Safe, Non-Destructive First)

Last reviewed: 2026-02-19


## Scope
Reconcile schema drift between Prisma migration history and shared Supabase development database without destructive reset.

## Constraints
- Do not run `prisma migrate reset` on shared Supabase.
- Do not delete production-like data without explicit approved backup/restore plan.
- Keep migration history authoritative and forward-only.

## Phase 0: Change Freeze
1. Freeze schema-changing merges to `main` during reconciliation window.
2. Announce freeze window and rollback owner.

## Phase 1: Snapshot and Recovery Readiness
1. Capture a full logical backup of shared Supabase dev database.
2. Export current `_prisma_migrations` table.
3. Record restore procedure and validate backup artifact integrity.

## Phase 2: Diff and Classification
1. Run schema diff between:
- Expected schema from migrations (`prisma migrate diff --from-migrations ...`)
- Actual shared Supabase schema (`--to-url ...`)
2. Classify drift items:
- `A`: Safe additive forward fixes (indexes, nullable columns, enum variants).
- `B`: Potentially destructive / rename / type coercion items.
- `C`: Legacy/manual tables that should remain unmanaged.

## Phase 3: Decide Source of Truth Per Drift Item
1. For each item, pick one:
- `Migrations are correct` -> create forward SQL migration to align DB.
- `Database is correct` -> codify state in Prisma schema and generate migration.
- `Out of Prisma scope` -> document and exclude from Prisma-managed schema decisions.
2. Require explicit reviewer sign-off for all `B` items.

## Phase 4: Staging Rehearsal (Mandatory)
1. Restore backup to isolated staging database.
2. Apply proposed reconciliation migrations there.
3. Run verification gate on staging-connected app:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
4. Validate key API routes and worker flows that touch changed tables.

## Phase 5: Controlled Shared-DB Rollout
1. Execute reconciliation migrations in shared Supabase during maintenance window.
2. Verify:
- `prisma migrate status` reports up to date.
- No pending drift warning.
- Critical route smoke checks pass.
3. Unfreeze schema merges after verification.

## Phase 6: Hardening (Prevent Recurrence)
1. Default developer workflow to local migrations:
- `pnpm db:migrate` (now local)
- `pnpm db:migrate:remote` only for controlled remote operations
2. Require schema PR checklist item:
- "Migration tested locally on clean DB"
3. Add CI guard to reject direct remote `migrate dev` usage.

## Ownership
- Technical owner: Platform/DB maintainer
- Approver: Engineering lead
- Executor: Feature author with DB owner present for rollout

## Rollback Plan
1. If reconciliation fails, stop migration sequence immediately.
2. Restore from validated backup to last consistent point.
3. Re-open freeze and produce postmortem diff report.
