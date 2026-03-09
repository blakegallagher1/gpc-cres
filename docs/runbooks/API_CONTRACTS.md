# API Contracts Runbook

Status: Authoritative
Authority: Active API contract summary for operators and integrators
Owner: Backend owner
Last reviewed: 2026-03-09

## Contract Invariants

- Auth:
  - App/API uses NextAuth/Auth.js session resolution.
  - Protected routes must enforce auth and org scope.
- Error shape:
  - Validation failures: `400`
  - Auth failures: `401/403`
  - Internal failures: `500` with client-safe payload
- Correlation:
  - Request-id headers should be attached on API responses.
- Security:
  - No exposure of raw internal DB/infra errors to clients.

## Active Endpoint Families (high-level)

- Chat:
  - `POST /api/chat`
  - `POST /api/chat/tool-approval`
  - `POST /api/chat/resume`
- Observability:
  - `POST /api/observability/events`
  - `GET /api/admin/observability`
- Parcel/map:
  - `GET /api/parcels`
  - `GET /api/parcels/{parcelId}/geometry`
  - `GET /api/map/comps`
  - `POST /api/map/prospect`
- Runs:
  - `GET /api/runs`
  - `GET /api/runs/{runId}`
  - `GET /api/runs/{runId}/traces`
  - `GET /api/runs/dashboard`

## Data Path Contract

- Exact record reads/writes: Postgres via gateway/Hyperdrive path.
- Semantic retrieval: Qdrant as auxiliary/fuzzy recall only.
- Property DB access must remain gateway-mediated in production.

## Verification Hooks

- API behavior validation: `pnpm smoke:endpoints`
- Gateway access enforcement: `pnpm smoke:gateway:edge-access`
- Observability surface checks: `pnpm observability:monitor:prod`
