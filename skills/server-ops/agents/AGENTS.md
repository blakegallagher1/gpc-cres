# Server Access Quick Reference

Read this file before any server operation. Use it as the first-pass connection and recovery guide. For deeper procedures, then read [SKILL.md](/Users/gallagherpropertycompany/Documents/gallagher-cres/skills/server-ops/SKILL.md).

## Connection Decision Tree

Need server access?
  -> `ping -c 1 100.67.140.126`
    -> Success? Use Tailscale IP for everything
    -> Fail? Try `curl https://api.gallagherpropco.com/health`
      -> Success? Use Cloudflare URLs
      -> Fail? Server is down. Wait 90s for watchdog. If still down, need physical access

## Primary Path: Tailscale

Tailscale is the primary connection path. The Windows PC Tailscale IP is `100.67.140.126`. Use it for all operator and agent access whenever it responds.

| Service | Use this |
| --- | --- |
| SSH | `ssh cres_admin@100.67.140.126` |
| Admin API | `http://100.67.140.126:8000/admin` |
| Gateway | `http://100.67.140.126:8000` |
| Database | `psql -h 100.67.140.126 -p 54323 -U postgres -d entitlement_os` |
| Tiles | `http://100.67.140.126:3000` |
| CUA Worker | `http://100.67.140.126:3001` |
| Qdrant | `http://100.67.140.126:6333` |

Use direct Tailscale SSH, not `ssh.gallagherpropco.com`. Direct WireGuard is the reliable path.

## Fallback Path: Cloudflare

Cloudflare is fallback only. Use `api.gallagherpropco.com` or `ssh.gallagherpropco.com` only when Tailscale is unreachable.

- Cloudflare SSH has known websocket drops.
- Cloudflare SSH sessions can die around the 8-hour mark.
- If Tailscale works, do not route through Cloudflare.

## Preflight

Run this before any server work:

```bash
ping -c 1 100.67.140.126
curl -s http://100.67.140.126:8000/health
```

- If `ping` fails, treat Tailscale as down.
- If `ping` succeeds but `/health` fails, treat the gateway as down.
- Fall back to Cloudflare only after Tailscale fails.

## Watchdog And Recovery

`GPC-Watchdog` runs every 60 seconds on the Windows PC. It auto-restarts:

- `sshd`
- Tailscale service
- Docker Desktop
- Docker containers: `fastapi-gateway`, `martin-tile-server`, `entitlement-os-postgres`, `cloudflared-tunnel`, `gpc-cua-worker`, `qdrant`, `codex-server`

If a service is down, wait 90 seconds before manual intervention. It will often self-recover.

## Docker Compose

- Compose file: `C:\gpc-cres-backend\docker-compose.yml`
- Container names: `fastapi-gateway`, `martin-tile-server`, `entitlement-os-postgres`, `cloudflared-tunnel`, `gpc-cua-worker`, `qdrant`, `codex-server`

## Auth

- Admin API requires `Authorization: Bearer $ADMIN_API_KEY`
- Gateway API requires `Authorization: Bearer $LOCAL_API_KEY`
- The same bearer tokens work over Tailscale and Cloudflare

## Hard Rules

- Never use `127.0.0.1` when connecting remotely.
- Never use `localhost` when connecting from your Mac or the Codex VM.
- Localhost only works from the Windows PC itself.
- For remote access, always use `100.67.140.126`.
