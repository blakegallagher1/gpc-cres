# Incident Response Runbook

Status: Authoritative
Authority: Production incident triage and escalation flow
Owner: Ops/on-call owner
Last reviewed: 2026-03-09

## Scope

Use this runbook for production incidents affecting API routes, map/parcels, chat runtime, authentication, or observability ingestion.

## Severity

- Sev-1: core app unavailable, data corruption risk, auth bypass/security impact.
- Sev-2: major feature outage (map, deals, chat) with workaround unavailable.
- Sev-3: degraded behavior with workaround available.

## Triage Flow

1. Confirm incident signal:
   - Check latest monitor artifacts under `output/observability/`.
   - Run one-shot monitor from `docs/OBSERVABILITY_MONITOR.md`.
2. Classify surface:
   - auth/session issue,
   - gateway/data-path issue,
   - route contract/header issue,
   - frontend-only runtime issue.
3. Collect minimal evidence:
   - failing route/path,
   - status code and error body,
   - request id/correlation id (if present),
   - timestamp + environment.
4. Contain impact:
   - disable non-critical behavior flags if available,
   - keep auth/org-scoping and security invariants intact.
5. Escalate:
   - platform engineering lead for Sev-1/Sev-2,
   - infra owner for tunnel/gateway/host routing failures.
6. Validate fix:
   - rerun one-shot monitor,
   - rerun affected route tests,
   - record outcome in `ROADMAP.md` and `docs/CHANGELOG_DOCS.md` if docs changed.

## Quick Diagnostic Commands

```bash
pnpm observability:monitor:prod
pnpm smoke:endpoints
pnpm smoke:gateway:edge-access
```

## Escalation Contacts

- Platform engineering lead: owns status and release gating.
- Infra owner: owns Cloudflare tunnel, Hyperdrive, host/container operations.
