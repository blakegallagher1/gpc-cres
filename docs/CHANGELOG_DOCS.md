# Documentation Changelog

Status: Authoritative
Authority: Record of documentation contract changes
Owner: Platform engineering
Last reviewed: 2026-03-20

## 2026-03-20

- Added canonical machine-readable summary for the Windows PC backend + tunnel + Vercel env **names**: `docs/server-manifest.json`
- Aligned operator docs: `docs/SERVER_MANAGEMENT.md` (OS label, Postgres service vs container naming), `docs/claude/backend.md` (pool table wording)
- Wired navigation: `docs/INDEX.md`, `docs/SOURCE_OF_TRUTH.md`, comments in `.env.example` and `apps/web/.env.example`
- **Agent layout:** Moved historical root-level prompts and status snapshots into `docs/archive/2026-03-20-root-cleanup/` (see folder `README.md`); updated references across `ROADMAP.md`, `skills/entitlement-os/`, `docs/claude/reference.md`, `.github/copilot-instructions.md`, `scripts/observability/sentinel-eval.ts`, and related files; added `**/*.bak.*` to `.gitignore` for local editor backups.
- Removed obsolete continuation prompt (superseded by `docs/INDEX.md` + `ROADMAP.md` workflows):
  - `docs/COMPREHENSIVE_CLAUDE_CODE_CONTINUATION_PROMPT_2026-03-07.md` (deleted)
- Removed non-canonical gateway prototypes from `infra/local-api/`:
  - `api_server.py`, `tile_server.py` (deleted — canonical gateway is `main.py` + `admin_router.py`; history in git)
- Updated infra docs: `infra/local-api/README.md`, `infra/local-api/SPEC.md`
- Updated archived deployment log `PHASE_3_DEPLOYMENT_BLOCKERS.md` (Option B + removal note; file now lives under `docs/archive/2026-03-20-root-cleanup/`)
- Updated completed roadmap evidence: `ROADMAP.md` (INFRA-002 file target)
- Corrected agent architecture docs: root `AGENTS.md`, `packages/db/AGENTS.md`
- Corrected archived plan table + banner: `docs/PLAN.md`
- Clarified reference areas: `CLAUDE.md`, `docs/claude/architecture.md`

## 2026-03-11

- Added repo-specific platform generalization roadmap for expanding beyond entitlement-only workflows:
  - `docs/OPPORTUNITY_OS_GENERALIZATION_ROADMAP.md`
- Updated active implementation status and docs navigation to point to the new roadmap:
  - `ROADMAP.md`
  - `docs/INDEX.md`

## 2026-03-10

- Added canonical stabilization release note + operational runbook:
  - `docs/runbooks/STABILITY_RELEASE_RUNBOOK_2026-03-10.md`
- Updated documentation entry surfaces to route future sessions to that canonical file:
  - `docs/INDEX.md`
  - `docs/DOCS_MANIFEST.json`

## 2026-03-09

- Added canonical documentation governance set:
  - `docs/INDEX.md`
  - `docs/OWNERSHIP.md`
  - `docs/SOURCE_OF_TRUTH.md`
  - `docs/ARCHIVE_POLICY.md`
  - `docs/CHANGELOG_DOCS.md`
  - `docs/runbooks/INCIDENT_RESPONSE.md`
  - `docs/runbooks/RELEASE_VERIFICATION.md`
  - `docs/runbooks/API_CONTRACTS.md`
- Updated `README.md` to point to `docs/INDEX.md` as the primary docs entrypoint.
- Extended `docs/OBSERVABILITY_MONITOR.md` into a canonical operator runbook with quickstart, interpretation, triage workflow, and security notes.
- Added agent-optimized docs routing surfaces:
  - `docs/AGENT_DOCS_PROTOCOL.md`
  - `docs/DOCS_MANIFEST.json`
- Updated `docs/INDEX.md`, `docs/SOURCE_OF_TRUTH.md`, and `docs/OWNERSHIP.md` to include the agent protocol + manifest as canonical references.
