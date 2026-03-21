# Seller Intake Contract (`POST /api/seller-submissions`)

Status: Active
Owner: Web platform
Last reviewed: 2026-03-21

## Purpose

Public homepage intake endpoint for prospective sellers to submit a property lead for review.

## Endpoint

- **Method:** `POST`
- **Path:** `/api/seller-submissions`
- **Auth:** Public (no session required)
- **Rate limit:** 5 requests / 60 seconds per client IP

## Request body

```json
{
  "name": "string (required)",
  "email": "valid email (required)",
  "propertyAddress": "string (required)",
  "details": "string (optional)",
  "company": "string (optional honeypot; must be empty)"
}
```

## Response contract

- `200 { "ok": true }` for accepted submissions.
- `400 { "error": "Invalid JSON" }` for malformed JSON.
- `400 { "error": "Invalid payload", "issues": ... }` for schema validation failures.
- `400 { "error": "Rejected" }` when honeypot `company` is populated.
- `429 { "error": "Too many requests" }` when rate limited.

## Observability and analytics

### Server-side route events

- `seller_submission_received`
- `seller_submission_rejected` (`reasonCode: honeypot`)
- `seller_submission_rate_limited` (`reasonCode: rate_limited`)

### Client-side submission events

- `seller_submission_started`
- `seller_submission_succeeded`
- `seller_submission_failed` (`reasonCode: request_failed | network_error`)

PII must not be included in telemetry metadata for failed submissions.
