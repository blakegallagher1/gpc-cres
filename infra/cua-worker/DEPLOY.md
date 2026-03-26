# CUA Worker Deployment

## Prerequisites
- Windows server with Docker Desktop
- Cloudflare Tunnel running
- OPENAI_API_KEY set
- First-party production login secrets available at runtime if the worker must access authenticated `gallagherpropco.com` routes

## Build & Deploy

### Option A: Standalone (quick test)
```bash
cd infra/cua-worker
npm install && npm run build
docker compose up -d
```

### Option B: Add to main docker-compose
Add the `cua-worker` service from `docker-compose.yml` to the server's main compose file at `C:\gpc-cres-backend\docker-compose.yml`.

### Cloudflare Tunnel Route
Add to the cloudflared config:
```yaml
- hostname: cua.gallagherpropco.com
  service: http://gpc-cua-worker:3001
```

Or if using Cloudflare dashboard (remotely managed tunnel), add:
- Subdomain: `cua`
- Domain: `gallagherpropco.com`
- Service: `http://localhost:3001`

### Verify
```bash
curl https://cua.gallagherpropco.com/health
# Expected: {"status":"ok","browser":"ready"}
```

## Environment Variables
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| OPENAI_API_KEY | Yes | - | OpenAI API key for GPT-5.4 |
| API_KEY | Yes | - | Bearer token for auth (same as GATEWAY_API_KEY) |
| PORT | No | 3001 | Server port |
| BROWSER_MODE | No | headless | headless or headed |
| DEFAULT_MODEL | No | gpt-5.4 | Default CUA model |
| MAX_TURNS | No | 24 | Max turns per task |
| SCREENSHOT_DIR | No | /tmp/cua-data/screenshots | Screenshot storage path |
| GPC_PROD_SITE_ALLOWED_HOSTS | No | `gallagherpropco.com,www.gallagherpropco.com` | Exact first-party hosts allowed to receive the production-site auth bootstrap |
| GPC_PROD_SITE_LOGIN_PATH | No | `/login` | Credential login route on the production app |
| GPC_PROD_SITE_EMAIL | No | - | Runtime-only email used for first-party login bootstrap. Do not commit the value. |
| GPC_PROD_SITE_PASSWORD | No | - | Runtime-only password used for first-party login bootstrap. Do not commit the value. |
| GPC_PROD_SITE_BOOTSTRAP_TIMEOUT_MS | No | `30000` | Timeout for the first-party login bootstrap flow |

## First-Party Auth Bootstrap

When the task URL is on an allowlisted host from `GPC_PROD_SITE_ALLOWED_HOSTS`, the worker now signs into the production app before the first screenshot is sent to the model.

- Credentials are read only from runtime environment variables.
- The login form is filled by Playwright inside the worker so the model never needs the raw password in its prompt.
- Keep the host list narrow. Do not add unrelated subdomains unless they truly need the same authenticated session.
