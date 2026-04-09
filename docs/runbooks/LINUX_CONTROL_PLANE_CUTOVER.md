# Linux Control Plane Cutover

Last reviewed: 2026-04-09

## Purpose

Cut over the public control plane from the Windows host to the Linux control-plane host while keeping:

- property data on Windows
- knowledge base dependencies on Windows

## Preconditions

1. Linux host is provisioned
2. Docker is installed and running
3. Tailscale is installed and joined to the same tailnet as the Windows host
4. `infra/linux-control-plane/.env` is populated with Windows-backed dependency URLs
5. Shadow verification passes locally on the Linux host

## Host Preparation

On the Linux host:

```bash
mkdir -p /opt/gpc-control-plane
cd /opt/gpc-control-plane
```

Copy:

- `infra/linux-control-plane/`
- `infra/local-api/`
- `infra/cua-worker/`
- `scripts/control-plane/`

## Tailscale Join

```bash
tailscale up --authkey=<TAILSCALE_AUTHKEY>
tailscale status
```

Verify Windows reachability:

```bash
ping -c 1 100.67.140.126
curl -fsS http://100.67.140.126:8000/health
```

## Shadow Deploy

```bash
cd /opt/gpc-control-plane/infra/linux-control-plane
cp .env.example .env
docker compose --env-file .env up -d --build
```

Run:

```bash
/opt/gpc-control-plane/scripts/control-plane/preflight-linux.sh
/opt/gpc-control-plane/scripts/control-plane/verify-cutover.sh
```

## Public Cutover

1. Update Cloudflare origin/route target for `api.gallagherpropco.com`
2. Update Cloudflare origin/route target for `cua.gallagherpropco.com`
3. Re-run:

```bash
curl -fsS https://api.gallagherpropco.com/health
curl -fsS https://cua.gallagherpropco.com/cua/health
```

4. Verify authenticated:

- admin route
- screening route
- auth callback path
- browser task

## Rollback

1. Restore Cloudflare origin targets to the Windows host route
2. Stop the Linux stack:

```bash
cd /opt/gpc-control-plane/infra/linux-control-plane
docker compose down
```

3. Re-run health verification against the restored Windows public path

## Known Remaining Manual Inputs

- Tailscale auth key for the Linux host
- production env values for `infra/linux-control-plane/.env`
- Cloudflare origin updates
