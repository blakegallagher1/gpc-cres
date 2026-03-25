# CUA Worker Deployment

## Prerequisites
- Windows server with Docker Desktop
- Cloudflare Tunnel running
- OPENAI_API_KEY set

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
