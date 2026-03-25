# Codex Cloud Setup Guide for Entitlement OS

**Date:** 2026-03-25
**Purpose:** Migrate from self-hosted gpc-codex-controller (Hetzner VM) to OpenAI's managed Codex Cloud

---

## Prerequisites

- ChatGPT Pro, Plus, Business, or Enterprise plan (you have Pro)
- GitHub account with access to `gallagher-cres` repo
- Your environment variable values (from Vercel dashboard or `.env.local`)

---

## Step 1: Open Codex Cloud Settings

1. Open your browser
2. Go to **https://chatgpt.com/codex**
3. Click **Settings** (gear icon) or go directly to **https://chatgpt.com/codex/settings/environments**

---

## Step 2: Connect Your GitHub Repository

1. Click **Connect GitHub** (or **Add Repository**)
2. Authorize OpenAI to access your GitHub account
3. Select the repository: **gallagher-cres**
4. Choose the default branch: **main**
5. Confirm the connection

---

## Step 3: Create a New Environment

1. Click **New Environment** (or **Create Environment**)
2. Name it: **Entitlement OS Production**
3. Select the repository: **gallagher-cres**

---

## Step 4: Configure the Setup Script

Codex runs this script once when it creates a fresh container. It has internet access during this phase.

Paste this as your **Setup Script**:

```bash
# Install pnpm (required — Codex containers don't have it by default)
corepack enable
corepack prepare pnpm@latest --activate

# Install all workspace dependencies
pnpm install --frozen-lockfile

# Generate Prisma client
pnpm --filter gpc-agent-dashboard exec prisma generate

# Build shared packages (needed by other workspaces)
pnpm --filter @entitlement-os/shared build
pnpm --filter @entitlement-os/openai build
pnpm --filter @gpc/server build
```

> **Note:** Setup scripts run in a separate Bash session from the agent. `export` commands do NOT persist into the agent phase. Use Environment Variables (Step 5) for secrets and config.

---

## Step 5: Add Environment Variables

Add each of these in the Environment Variables section. Get the values from your Vercel dashboard (https://vercel.com → Entitlement OS → Settings → Environment Variables) or your local `apps/web/.env.local`.

### Required — Core Infrastructure

| Variable | Where to find the value |
|----------|------------------------|
| `DATABASE_URL` | Vercel env vars (the one with port 6543) |
| `DIRECT_DATABASE_URL` | Vercel env vars (the one with port 5432) |
| `AUTH_SECRET` | Vercel env vars |
| `AUTH_URL` | Set to: `https://gallagherpropco.com` |
| `OPENAI_API_KEY` | Vercel env vars |
| `NODE_ENV` | Set to: `production` |

### Required — API Gateway & Property Data

| Variable | Where to find the value |
|----------|------------------------|
| `LOCAL_API_URL` | Set to: `https://api.gallagherpropco.com` |
| `LOCAL_API_KEY` | Vercel env vars |
| `GATEWAY_PROXY_URL` | Set to: `https://gateway.gallagherpropco.com` |
| `GATEWAY_PROXY_TOKEN` | Vercel env vars |
| `CF_ACCESS_CLIENT_ID` | Vercel env vars |
| `CF_ACCESS_CLIENT_SECRET` | Vercel env vars |

### Required — Auth (Google OAuth)

| Variable | Where to find the value |
|----------|------------------------|
| `AUTH_GOOGLE_ID` | Vercel env vars |
| `AUTH_GOOGLE_SECRET` | Vercel env vars |
| `ALLOWED_LOGIN_EMAILS` | Vercel env vars |

### Required — Cron & Automation

| Variable | Where to find the value |
|----------|------------------------|
| `CRON_SECRET` | Vercel env vars |

### Required — File Storage (Backblaze B2)

| Variable | Where to find the value |
|----------|------------------------|
| `B2_APPLICATION_KEY_ID` | Vercel env vars |
| `B2_APPLICATION_KEY` | Vercel env vars |
| `B2_SECRET_ACCESS_KEY` | Vercel env vars |
| `B2_S3_ENDPOINT_URL` | Set to: `https://s3.us-west-004.backblazeb2.com` |
| `B2_BUCKET_NAME` | Vercel env vars |
| `B2_REGION` | Set to: `us-west-004` |

### Required — Observability (Sentry)

| Variable | Where to find the value |
|----------|------------------------|
| `SENTRY_DSN` | Vercel env vars |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel env vars |
| `SENTRY_AUTH_TOKEN` | Vercel env vars |
| `SENTRY_ORG` | Set to: `gpc-ul` |
| `SENTRY_PROJECT` | Set to: `entitlement-os-web` |

### Optional — Agent Enhancements

| Variable | Where to find the value |
|----------|------------------------|
| `QDRANT_URL` | Set to: `https://qdrant.gallagherpropco.com` |
| `GOOGLE_MAPS_API_KEY` | Vercel env vars |
| `PERPLEXITY_API_KEY` | Vercel env vars (if set) |
| `NEPTUNE_FLOOD_API_KEY` | Vercel env vars (if set) |
| `NEPTUNE_FLOOD_BASE_URL` | Vercel env vars (if set) |
| `SOCRATA_BASE_URL` | Set to: `https://data.brla.gov/resource` |
| `SOCRATA_EBR_PERMITS_DATASET_ID` | Set to: `7fq7-8j7r` |

### Optional — Plugin Tokens (for Operations Agent)

| Variable | Where to find the value |
|----------|------------------------|
| `GITHUB_PLUGIN_TOKEN` | Vercel env vars (if set) |
| `VERCEL_PLUGIN_TOKEN` | Vercel env vars (if set) |
| `CLOUDFLARE_PLUGIN_TOKEN` | Vercel env vars (if set) |

> **Mark sensitive values as Secrets** — Codex encrypts secrets and only exposes them during setup. For variables the agent needs at runtime (like `OPENAI_API_KEY`, `DATABASE_URL`), add them as regular Environment Variables, not Secrets.

---

## Step 6: Enable Internet Access

1. In the environment settings, find **Internet Access**
2. Toggle it to **On**
3. Under **Domain Allowlist**, select **None** (start from empty list — you'll add exactly what you need)
4. Under **HTTP Methods**, select **All methods** (your gateway needs POST for SQL queries)

---

## Step 7: Add Domain Allowlist

Add each domain below one at a time. These are the exact domains your app communicates with.

### Your Infrastructure (REQUIRED)

```
gallagherpropco.com
api.gallagherpropco.com
gateway.gallagherpropco.com
agents.gallagherpropco.com
tiles.gallagherpropco.com
qdrant.gallagherpropco.com
db.gallagherpropco.com
```

### OpenAI (REQUIRED — agent tools call the API)

```
api.openai.com
```

### Google Maps (REQUIRED — geocoding & distance tools)

```
maps.googleapis.com
```

### Sentry (REQUIRED — error tracking)

```
sentry.io
*.sentry.io
```

### File Storage (REQUIRED — evidence uploads, artifacts)

```
s3.us-west-004.backblazeb2.com
```

### Government Data (REQUIRED — building permits lookup)

```
data.brla.gov
```

### Geocoding Fallback

```
nominatim.openstreetmap.org
```

### Optional — Research Agent

```
api.perplexity.ai
```

### Optional — Plugin APIs (Operations Agent)

```
api.github.com
api.vercel.com
api.cloudflare.com
```

### Package Registries (for any runtime installs)

```
registry.npmjs.org
```

### Full Allowlist (copy-paste ready)

```
gallagherpropco.com
api.gallagherpropco.com
gateway.gallagherpropco.com
agents.gallagherpropco.com
tiles.gallagherpropco.com
qdrant.gallagherpropco.com
db.gallagherpropco.com
api.openai.com
maps.googleapis.com
sentry.io
s3.us-west-004.backblazeb2.com
data.brla.gov
nominatim.openstreetmap.org
api.perplexity.ai
api.github.com
api.vercel.com
api.cloudflare.com
registry.npmjs.org
```

---

## Step 8: Save and Test

1. Click **Save** on the environment
2. Go back to **https://chatgpt.com/codex**
3. Select your **Entitlement OS Production** environment
4. Select the **main** branch
5. Give it a simple test task:

```
Run `pnpm typecheck` and `pnpm test` and report the results.
Do not make any changes.
```

6. Watch it spin up a container, install dependencies, and run the commands
7. If it passes — you're live

---

## Step 9: Decommission the Hetzner Box (after testing)

Only do this AFTER you've confirmed Codex Cloud works for a few days.

1. SSH into Hetzner: `ssh controller@5.161.99.123`
2. Stop the controller: `sudo systemctl stop gpc-codex-controller`
3. Back up any important data
4. Cancel the Hetzner VM in their dashboard
5. Remove the Cloudflare DNS record for `codex-controller.gallagherpropco.com`
6. Remove the Cloudflare Tunnel route for the controller

---

## What Codex Cloud Replaces

| Old (Hetzner) | New (Codex Cloud) |
|---|---|
| Hetzner VM at 5.161.99.123 | OpenAI managed cloud |
| `gpc-codex-controller` codebase | Not needed |
| Cloudflare Tunnel for codex-controller | Not needed |
| OAuth 2.1 MCP auth flow | Native ChatGPT integration |
| `codex login --chatgpt` token refresh | Not needed |
| 5-layer git workaround | Not needed |
| `~/.codex/config.toml` + `AGENTS.md` | Not needed |
| Manual `systemctl restart` | Not needed |

---

## Quick Reference: Giving Codex Tasks

**From ChatGPT web (https://chatgpt.com/codex):**
- Type your task in plain English
- Select branch (usually `main`)
- Codex opens a PR when done

**From your terminal:**
```bash
codex cloud "add a loading spinner to the deals page"
codex cloud "fix the 500 error on /api/parcels when query is empty"
codex cloud "update all npm dependencies to latest"
```

**Check status:**
```bash
codex cloud          # interactive picker — browse active/finished tasks
```
