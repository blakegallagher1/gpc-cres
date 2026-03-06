# PRD: GPC-CRES "Zero-Cost, High-Security Local Compute" Platform Harness

Version: 1.0  
Owner: Blake  
Date: 2026-02-22  
Primary agents: Cursor Codebase Agent (Mac), Windows HP Server Ops Agent (BG)

---

## 0) Executive Summary

We are migrating an enterprise commercial real estate app to a **"Perfect Zero-Cost, High-Security Workflow"** optimized for **2–3 concurrent users** by running all compute and data locally on a **Windows 11 HP server** (BG) while keeping the UI on **Vercel** and exposing only safe HTTP endpoints via **Cloudflare Tunnels**.

**Core rule:** Vercel is a **UI-only** layer. **No direct DB connections** from Vercel. All data access goes through a **single public API behind Cloudflare Tunnel** (the "Gateway").

---

## 1) Goals and Non-Goals

### Goals
1) **Security First / Zero DB Exposure** — No Postgres ports exposed; only Cloudflare Tunnel ingress to HTTP services.
2) **Zero-Cost Operations** — UI on Vercel; backend on local HP server.
3) **Clean Data Plane** — Authoritative parcel/property and exact knowledge data flows through `https://api.gallagherpropco.com/...`; production Postgres traffic uses the gateway/Hyperdrive path, and Qdrant stays semantic-only.
4) **Production Practicality** — Strong observability, CI gates, backward-compatible migration.
5) **Agentic Operations** — Codex/Cursor can detect errors, propose patches, run tests, stage deployments.

### Non-Goals (this phase)
- Full autonomous cron without approvals.
- Public admin tools (pgAdmin, Postgres, Qdrant ports).
- High-scale multi-tenant SaaS hardening.

---

## 2) Target Architecture

### Publicly reachable (only via Cloudflare Tunnel)
- `api.gallagherpropco.com` → Gateway `gateway:8000`
- `tiles.gallagherpropco.com` → Martin `martin:3000`

### Private (never internet reachable)
- `entitlement_os` Postgres (consolidated), `qdrant`, `pgadmin` — internal only

### Data flow
User → Vercel Next.js → HTTPS fetch → Cloudflare Tunnel → Gateway → (Postgres authoritative read/write, Qdrant semantic, Martin tiles) → response.

---

## 3) Current State

- Gateway: `infra/local-api/main.py` — auth allowlist, tenant headers, dual DB pools.
- Deals: GET/POST/PATCH `/deals` implemented; GET/PATCH/DELETE `/deals/{id}` in progress.
- Next.js: `apps/web/app/api/deals/route.ts` proxies to Gateway; `apps/web/app/deals/page.tsx` fetches via Gateway.

---

## 4) Implementation Plan

### Phase 0 — Lock the Platform Harness (DONE)
- [x] Cloudflare Tunnel works from Windows primary connector
- [x] DB ports not exposed
- [x] Gateway has auth allowlist + tenant enforcement
- [x] Gateway has dual DB pools
- [x] GET /deals exists and is tenant-scoped

### Phase 1 — Deals Domain Parity
1) Inventory `/api/deals/[id]/**` routes
2) For each: define gateway endpoint → implement → convert Next route to proxy-only
3) Add contract tests

**Exit criteria:** No Prisma usage in deals route family.

### Phase 2 — Parcels + Map + Prospecting
Goal: route map and parcel intelligence through the Cloudflare-tunneled gateway path so Postgres stays authoritative, while semantic/property-memory recall can augment those results from Qdrant without becoming a fallback source of truth.

### Phase 3 — Runs/Evidence/Chat/Business Domains
### Phase 4 — Cron/Background

---

## 5) Coding Standards

### Next.js Proxy Pattern
- Use `LOCAL_API_URL`, `LOCAL_API_KEY`
- `cache: "no-store"`
- Sanitize query params (allowlists)
- Attach tenant headers: `X-Org-Id`, `X-User-Id` from server auth

### Gateway Patterns (FastAPI)
- Every app endpoint: Bearer auth + tenant headers
- Validate inputs; enforce org scope in SQL
- Limit results

### Testing
- Gateway: auth + tenant + org scoping
- Next proxy: 401, 400 without tenant headers, query sanitization

---

## 6) Environment Variables

### Gateway (Windows)
- `GATEWAY_API_KEY` = single bearer key used by runtime
- `DATABASE_URL` = entitlement_os
- `APPLICATION_DATABASE_URL` = entitlement_os
- `LOCAL_API_KEY` = one of the allowed bearer keys
- `LOCAL_API_KEY` is the Vercel-side value of `GATEWAY_API_KEY` (same token).

### Vercel / Next.js
- `LOCAL_API_URL` = `https://api.gallagherpropco.com`
- `LOCAL_API_KEY` = one of the allowed bearer keys
- `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` = Cloudflare Access service token
- `GATEWAY_DATABASE_URL` = Hyperdrive HTTPS endpoint for Prisma
- `QDRANT_URL` (+ `QDRANT_API_KEY` if not using gateway proxy)

### Smoke verification (run after any gateway or tunnel change)
- `pnpm smoke:endpoints` — Vercel-facing health (deals, parcels, semantic tools). Auth failures should be 401; everything else must return `200/4xx` with data.
- `pnpm smoke:gateway:edge-access` — Confirms Cloudflare Access policy blocks unauthorized callers and allows authorized requests for Postgres+Qdrant endpoints.
- `bash scripts/verify-production-features.sh` — Replays the five gateway guarantees (cache, batch screening, push streaming, semantic recall, error handling) to prove the UI continues to rely on gateway-backed Postgres for source-of-truth data while Qdrant stays semantic-only.

---

## 7) Appendix A: Source of Truth

- Web: `apps/web/app/deals/page.tsx`, `apps/web/app/api/deals/route.ts`
- Gateway: `infra/local-api/main.py`
- DB schema: `packages/db/prisma/schema.prisma`
- Infra docs: `infra/local-api/*.md`, `docs/claude/backend.md`
