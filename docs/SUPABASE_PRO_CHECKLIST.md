# Supabase Pro Optimization Checklist

Last updated: 2026-02-19

Code-implementable items in this checklist are now wired in repository code. Remaining unchecked work is dashboard/infra operational.

## Read Replicas
- `Status`: Code wiring complete (env + read-client wiring); dashboard replica provisioning still required.
- `Action`: Enable read replicas for read-heavy workloads in Supabase dashboard.
- `Action`: Route read-only analytics/listing queries to replica connection string where applicable. ✅ Implemented via `READ_REPLICA_DATABASE_URL` + `ENABLE_READ_REPLICA` and `prismaRead`.
- `Action`: Add an app-level toggle/env to selectively use replica reads for non-critical freshness paths. ✅ Implemented (`ENABLE_READ_REPLICA`).
- `Validation`: Compare p95 latency and primary CPU before/after rollout.

## Connection Pooling
- `Status`: Implemented in code via runtime URL parameter wiring; dashboard pooled endpoint selection still required.
- `Action`: Ensure production DB URLs use Supavisor/pooled connection strings for app and workers.
- `Action`: Keep long-lived pooled clients; avoid per-request client construction.
- `Action`: Verify Prisma pool sizing and timeout settings align with Supabase limits. ✅ Implemented via `PRISMA_CONNECTION_LIMIT` + `PRISMA_POOL_TIMEOUT_SECONDS`.
- `Validation`: Confirm reduced connection churn and no pool exhaustion during peak traffic.

## Custom Domains
- `Status`: Code-side env wiring implemented; dashboard DNS/TLS/callback setup still required.
- `Action`: Configure custom domain for Supabase Auth redirects and API endpoints where required.
- `Action`: Update allowed redirect URLs and CORS origins to custom domain values. ✅ Implemented env support via `SUPABASE_CUSTOM_DOMAIN_URL` + `NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL`.
- `Action`: Ensure TLS issuance/renewal is healthy and monitored.
- `Validation`: Complete login/logout flow and callback handling across preview + production.

## PITR (Point-in-Time Recovery)
- `Status`: Dashboard-level setting; not visible in code.
- `Action`: Confirm PITR is enabled for the production project.
- `Action`: Document target recovery window and retention requirements.
- `Action`: Run a restore drill in non-prod from a known timestamp.
- `Validation`: Record restore duration and data integrity checks in incident runbook.

## Spend Caps
- `Status`: Dashboard-level setting; not visible in code.
- `Action`: Set monthly spend caps and alert thresholds aligned to budget guardrails.
- `Action`: Configure alert recipients (engineering + operations ownership).
- `Action`: Add escalation policy for cap/threshold breaches.
- `Validation`: Trigger test alerts and confirm on-call receipt and response workflow.

## Log Drains
- `Status`: External drain target not verified.
- `Action`: Configure log drains from Supabase to centralized observability (for example Sentry/DataDog/ELK).
- `Action`: Ensure auth, database, edge function, and API logs are included with retention policy.
- `Action`: Add dashboards for 5xx rates, auth failures, and DB saturation indicators.
- `Validation`: Confirm log delivery completeness and searchable correlation with request IDs.

## Recommended Execution Order
1. Connection pooling
2. Spend caps + alerting
3. Log drains
4. PITR validation drill
5. Read replica rollout
6. Custom domain cutover

## Dashboard-Only Items (Not Code-Implementable)
- PITR enablement, retention policy, and restore drills.
- Spend cap thresholds, recipients, and escalation policy.
- Log drains destination provisioning, retention, and dashboards.
- Supabase custom-domain DNS/TLS issuance.
- Supabase read-replica provisioning itself (code is wired once replica URL exists).
