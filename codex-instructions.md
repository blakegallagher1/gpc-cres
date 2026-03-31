# Codex Instructions

## Infrastructure Access — Tailscale First

When accessing the GPC Windows server (for DB, deployments, Docker, or shell commands), always SSH via Tailscale: `ssh bg "command"`. Never use Cloudflare tunnels (`cloudflared access tcp`), `ssh.gallagherpropco.com`, or CF Access service tokens.

PostgreSQL on the Windows server does not use SSL.

Cloudflare is for DNS/CDN/Workers only — not for tunneling to the server.
