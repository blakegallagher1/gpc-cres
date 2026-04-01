# Cloudflare Tunnel Setup (Legacy Reference)

This document is for **legacy historical reference only**.

> **CRITICAL (2026-04-01):** NEVER run cloudflared for `gpc-hp-tunnel` on your Mac or any
> dev machine. The production tunnel must have exactly ONE connector (on the Windows server).
> A second connector causes Cloudflare to load-balance traffic between machines, routing
> production requests to a stale dev gateway and causing intermittent 404s.

The authoritative setup is documented in [`docs/CLOUDFLARE.md`](../../docs/CLOUDFLARE.md) and should be treated as current truth:
- Single tunnel: `gpc-hp-tunnel`
- `api.gallagherpropco.com` and `tiles.gallagherpropco.com` over one Cloudflare tunnel
- Current API/tiles port and proxy assumptions as noted in that document

Use this file only when you need archived command examples for historical context.

Legacy layout shown below assumes separate tunnel configs (`gpc-api`, `gpc-tiles`) and should not be used for active deployment.

1. **api.gallagherpropco.com** → localhost:8000 (FastAPI)
2. **tiles.gallagherpropco.com** → localhost:3000 (Martin)

**Postgres (5432) is NEVER exposed.**

---

## Create API Tunnel

```bash
cloudflared tunnel create gpc-api
cloudflared tunnel route dns gpc-api api.gallagherpropco.com
```

## Create Tiles Tunnel

```bash
cloudflared tunnel create gpc-tiles
cloudflared tunnel route dns gpc-tiles tiles.gallagherpropco.com
```

---

## Run Tunnels

```bash
cloudflared tunnel run --config ~/.cloudflared/config-api.yml gpc-api
cloudflared tunnel run --config ~/.cloudflared/config-tiles.yml gpc-tiles
```

Copy the templates from `infra/cloudflared/*.template.yml` to `~/.cloudflared/`, rename to `config-api.yml` and `config-tiles.yml`, and replace `<API_TUNNEL_ID>` / `<TILES_TUNNEL_ID>` with the UUIDs from `cloudflared tunnel create`.

---

## Install as Services (Mac)

```bash
sudo cloudflared service install
```

---

## Security Model

| Component | Exposure |
|-----------|----------|
| Postgres 5432 | Via Cloudflare tunnel, gated by Cloudflare Access (email auth) |
| FastAPI 8000 | Only via Cloudflare tunnel |
| Martin 3000 | Only via Cloudflare tunnel |

See [`docs/CLOUDFLARE.md`](../../docs/CLOUDFLARE.md) for the current authoritative setup including remote DB access.
