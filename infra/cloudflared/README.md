# Cloudflare Tunnel Setup

This repo uses TWO Cloudflare tunnels:

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
| Postgres 5432 | Never exposed |
| FastAPI 8000 | Only via Cloudflare tunnel |
| Martin 3000 | Only via Cloudflare tunnel |
| Ingress | Only ports 8000 and 3000 |

FastAPI connects to Postgres via localhost only.
