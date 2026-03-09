# Documentation Ownership

Status: Authoritative
Authority: Documentation governance and review ownership
Owner: Platform engineering
Last reviewed: 2026-03-09

This file defines who owns each critical doc and how often it must be reviewed.

## Review Rules

- Every authoritative doc must include: `Status`, `Authority`, `Owner`, `Last reviewed`.
- Review SLA:
  - Runbooks: every 14 days
  - Architecture/contracts: every 30 days
  - Roadmap/status docs: on every material status change
- If a doc is not reviewed within SLA, it is treated as stale until updated.

## Ownership Matrix

| Document | Owner | Review cadence | Trigger to update |
| --- | --- | --- | --- |
| `ROADMAP.md` | Platform engineering lead | Continuous | Any status change or completion evidence |
| `docs/SPEC.md` | Architecture owner | 30 days | Runtime architecture/auth/data-path changes |
| `docs/INDEX.md` | Platform engineering | 14 days | Add/remove canonical docs |
| `docs/SOURCE_OF_TRUTH.md` | Platform engineering lead | 14 days | Any authority model change |
| `docs/AGENT_DOCS_PROTOCOL.md` | Platform engineering | 14 days | Task-routing/read-order updates |
| `docs/DOCS_MANIFEST.json` | Platform engineering | 14 days | Canonical doc set or routing-map updates |
| `docs/OBSERVABILITY_MONITOR.md` | Ops/on-call owner | 14 days | Monitor behavior/check set change |
| `docs/runbooks/INCIDENT_RESPONSE.md` | Ops/on-call owner | 14 days | Incident workflow/roles update |
| `docs/runbooks/RELEASE_VERIFICATION.md` | Release owner | 14 days | Gate commands or pass criteria update |
| `docs/runbooks/API_CONTRACTS.md` | Backend owner | 14 days | Route/auth/error/header contract change |
| `docs/CLOUDFLARE.md` | Infra owner | 30 days | Tunnel/hyperdrive/auth edge change |
| `docs/SERVER_MANAGEMENT.md` | Infra owner | 30 days | Host topology/service operational change |

## Escalation

- If two docs conflict, follow `docs/SOURCE_OF_TRUTH.md`.
- If ownership is unclear, platform engineering lead is default owner.
