# Supabase Pro Optimization Checklist

Last updated: 2026-02-19

## Read Replicas
- `Status`: Not verified in code; appears pending.
- `Action`: Enable read replicas for read-heavy workloads in Supabase dashboard.
- `Action`: Route read-only analytics/listing queries to replica connection string where applicable.
- `Action`: Add an app-level toggle/env to selectively use replica reads for non-critical freshness paths.
- `Validation`: Compare p95 latency and primary CPU before/after rollout.

## Connection Pooling
- `Status`: Not explicitly enforced in app config.
- `Action`: Ensure production DB URLs use Supavisor/pooled connection strings for app and workers.
- `Action`: Keep long-lived pooled clients; avoid per-request client construction.
- `Action`: Verify Prisma pool sizing and timeout settings align with Supabase limits.
- `Validation`: Confirm reduced connection churn and no pool exhaustion during peak traffic.

## Custom Domains
- `Status`: Not verified from repository code.
- `Action`: Configure custom domain for Supabase Auth redirects and API endpoints where required.
- `Action`: Update allowed redirect URLs and CORS origins to custom domain values.
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
