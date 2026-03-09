# Documentation Source of Truth Map

Status: Authoritative
Authority: Conflict resolution for all docs
Owner: Platform engineering lead
Last reviewed: 2026-03-09

When docs conflict, this file decides which source wins.

## Authority Map

| Topic | Source of truth | Notes |
| --- | --- | --- |
| Active implementation status | `ROADMAP.md` | Single canonical status ledger |
| Runtime architecture contracts | `docs/SPEC.md` | Security + data-path contracts |
| Observability monitor operations | `docs/OBSERVABILITY_MONITOR.md` | Operator runbook and triage |
| Incident response process | `docs/runbooks/INCIDENT_RESPONSE.md` | On-call operational workflow |
| Release verification gate | `docs/runbooks/RELEASE_VERIFICATION.md` | Required pre/post release checks |
| API/auth/header/error contracts | `docs/runbooks/API_CONTRACTS.md` | Active endpoint families and standards |
| Infra/network operations | `docs/CLOUDFLARE.md`, `docs/SERVER_MANAGEMENT.md` | Cloudflare/host routing and ops |
| Developer conventions | `AGENTS.md`, `CLAUDE.md` | Execution and coding constraints |

## Conflict Rules

1. If a historical file conflicts with any authoritative file, authoritative file wins.
2. If two authoritative files conflict:
   - status/roadmap questions: `ROADMAP.md` wins,
   - architecture/security/data-path questions: `docs/SPEC.md` wins,
   - operator behavior questions: relevant runbook wins.
3. Any unresolved conflict must be fixed in docs within the same change set that discovers it.

## Non-Authoritative Files

Files marked with archived/non-authoritative banners are reference-only and must not be used for implementation decisions.
See `docs/ARCHIVE_POLICY.md` for required labeling.

## Agent Efficiency References

- Deterministic agent read protocol: `docs/AGENT_DOCS_PROTOCOL.md`
- Machine-readable authority/routing manifest: `docs/DOCS_MANIFEST.json`
