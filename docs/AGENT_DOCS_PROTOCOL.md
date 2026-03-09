# Agent Documentation Protocol

Status: Authoritative
Authority: Deterministic doc routing for Codex and Claude-Code
Owner: Platform engineering
Last reviewed: 2026-03-09

This protocol is optimized for coding agents that must minimize context reads and avoid stale documentation.

## Primary Rule

Always start at `docs/INDEX.md` unless a task-specific authoritative file is already known from `docs/DOCS_MANIFEST.json`.

## Deterministic Read Order By Task

- Implementation status / what is pending:
  1. `ROADMAP.md`
  2. `docs/SOURCE_OF_TRUTH.md`
- Architecture / security / data-path behavior:
  1. `docs/SPEC.md`
  2. `docs/runbooks/API_CONTRACTS.md`
- Incident triage:
  1. `docs/runbooks/INCIDENT_RESPONSE.md`
  2. `docs/OBSERVABILITY_MONITOR.md`
- Release readiness:
  1. `docs/runbooks/RELEASE_VERIFICATION.md`
  2. `ROADMAP.md`
- Documentation governance:
  1. `docs/OWNERSHIP.md`
  2. `docs/ARCHIVE_POLICY.md`
  3. `docs/CHANGELOG_DOCS.md`

## Rules For Efficient Agent Behavior

- Never treat archived docs as implementation authority.
- Prefer authoritative docs listed in `docs/DOCS_MANIFEST.json`.
- Read the minimum number of files required by task category.
- If two docs conflict, resolve with `docs/SOURCE_OF_TRUTH.md` immediately.
- When adding/changing docs:
  - update `docs/CHANGELOG_DOCS.md`,
  - update `docs/DOCS_MANIFEST.json` if canonical docs changed,
  - keep the required header fields on authoritative docs.

## Archived Doc Guardrail

Archived docs may be read for historical context only. They must not drive implementation decisions unless the content is promoted into authoritative docs.
