# Cloudflare Tunnel Setup Guide

> **For the two-tunnel setup (api + tiles), see [../cloudflared/README.md](../cloudflared/README.md).**

## Overview

This guide walks through setting up a Cloudflare Tunnel to securely expose your local FastAPI server to Vercel without opening firewall ports or exposing your home IP address.

**Architecture:**
```
Vercel → Cloudflare Edge → Cloudflare Tunnel (cloudflared) → Local API Server :8000 → PostgreSQL/Martin
```

**Benefits:**
- No port forwarding required
- No dynamic DNS needed
- TLS encryption built-in
- DDoS protection via Cloudflare
- Free for personal use

---

## Prerequisites

- Cloudflare account (free tier works)
- Domain managed by Cloudflare DNS (e.g., `gallagherpropco.com`)
- Local API server running (`python main.py` on port 8080)
- PostgreSQL and Martin running locally

---

## Step 1: Install Cloudflared

### macOS (Homebrew):
```bash
brew install cloudflare/cloudflare/cloudflared
```

### Linux (Debian/Ubuntu):
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### Verify installation:
```bash
cloudflared --version
```

---

## Step 2: Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This will open a browser window asking you to select your domain. Choose `gallagherpropco.com` (or your domain).

After authentication, a certificate will be saved to `~/.cloudflared/cert.pem`.

---

## Step 3: Create a Tunnel

```bash
# Create a named tunnel
cloudflared tunnel create gpc-local-api

# This generates:
# - Tunnel ID (UUID)
# - Tunnel credentials file: ~/.cloudflared/<UUID>.json
```

**Save the Tunnel ID** — you'll need it in the config file.

---

## Step 4: Create Tunnel Configuration File

Create `~/.cloudflared/config.yml`:

```yaml
# Cloudflare Tunnel Configuration for GPC Local API
tunnel: YOUR_TUNNEL_ID_HERE
credentials-file: /Users/YOUR_USERNAME/.cloudflared/YOUR_TUNNEL_ID_HERE.json

ingress:
  # Route api.gallagherpropco.com to local FastAPI server
  - hostname: api.gallagherpropco.com
    service: http://localhost:8080
    originRequest:
      # Don't verify local SSL (we're using HTTP locally)
      noTLSVerify: true
      # Keep connections alive
      connectTimeout: 30s
      # HTTP/2 for better performance
      http2Origin: false

  # Catch-all rule (required by cloudflared)
  - service: http_status:404
```

**Replace:**
- `YOUR_TUNNEL_ID_HERE` with your actual Tunnel ID from Step 3
- `YOUR_USERNAME` with your macOS username
- `api.gallagherpropco.com` with your desired subdomain

---

## Step 5: Configure DNS

Point your subdomain to the tunnel:

```bash
cloudflared tunnel route dns gpc-local-api api.gallagherpropco.com
```

This creates a CNAME record in Cloudflare DNS:
```
api.gallagherpropco.com → <tunnel-id>.cfargotunnel.com
```

**Verify in Cloudflare Dashboard:**
1. Go to Cloudflare Dashboard → DNS
2. You should see: `api | CNAME | <tunnel-id>.cfargotunnel.com`

---

## Step 6: Start the Tunnel

### Test run (foreground):
```bash
cloudflared tunnel run gpc-local-api
```

You should see:
```
Registered tunnel connection
```

### Test the connection:
```bash
# From another terminal
curl https://api.gallagherpropco.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-20T...",
  "database": "connected",
  "martin": "up"
}
```

---

## Step 7: Run as a Service (Production)

### macOS (launchd):

Create `~/Library/LaunchAgents/com.cloudflare.tunnel.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cloudflare.tunnel</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/cloudflared</string>
        <string>tunnel</string>
        <string>run</string>
        <string>gpc-local-api</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/cloudflared.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/cloudflared-error.log</string>
</dict>
</plist>
```

Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.cloudflare.tunnel.plist
```

Check status:
```bash
launchctl list | grep cloudflare
```

Stop the service:
```bash
launchctl unload ~/Library/LaunchAgents/com.cloudflare.tunnel.plist
```

### Linux (systemd):

Install as a service:
```bash
sudo cloudflared service install
```

Start the service:
```bash
sudo systemctl start cloudflared
sudo systemctl enable cloudflared  # Auto-start on boot
```

Check status:
```bash
sudo systemctl status cloudflared
```

View logs:
```bash
sudo journalctl -u cloudflared -f
```

---

## Step 8: Configure Vercel Environment Variables

In your Vercel project settings:

1. Go to **Settings → Environment Variables**

2. Add these variables for **Production** and **Preview**:

```bash
# Local API base URL (via Cloudflare Tunnel)
LOCAL_API_URL=https://api.gallagherpropco.com

# API key for authentication (generate with: openssl rand -hex 32)
LOCAL_API_KEY=your-secret-api-key-here
```

3. Redeploy your Vercel app to pick up the new env vars

---

## Step 9: Update Next.js API Routes

Modify `apps/web/app/api/map/tiles/[z]/[x]/[y]/route.ts` to proxy to the local API:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { z: string; x: string; y: string } }
) {
  const { z, x, y } = params;

  const localApiUrl = process.env.LOCAL_API_URL;
  const localApiKey = process.env.LOCAL_API_KEY;

  if (!localApiUrl || !localApiKey) {
    return NextResponse.json(
      { error: "Local API not configured" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(
      `${localApiUrl}/tiles/${z}/${x}/${y}.pbf`,
      {
        headers: {
          Authorization: `Bearer ${localApiKey}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 204) {
        // No data for this tile
        return new NextResponse(null, { status: 204 });
      }
      throw new Error(`Local API returned ${response.status}`);
    }

    const data = await response.arrayBuffer();

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    });
  } catch (error) {
    console.error("Tile proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tile from local API" },
      { status: 503 }
    );
  }
}
```

---

## Step 10: Testing

### 1. Test health endpoint:
```bash
curl https://api.gallagherpropco.com/health
```

### 2. Test authenticated tile endpoint:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.gallagherpropco.com/tiles/14/3623/6449.pbf \
  --output test.pbf

# Check file size (should be >0 if data exists)
ls -lh test.pbf
```

### 3. Test parcel search:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.gallagherpropco.com/api/parcels/search?q=Main%20St&limit=5"
```

### 4. Test from Vercel:
Deploy your Next.js app and check:
```
https://gallagherpropco.com/api/map/tiles/14/3623/6449
```

---

## Troubleshooting

### Tunnel won't connect:
```bash
# Check cloudflared status
cloudflared tunnel info gpc-local-api

# View tunnel logs
tail -f /tmp/cloudflared.log  # macOS
sudo journalctl -u cloudflared -f  # Linux
```

### 502 Bad Gateway:
- Local API server is not running
- Check: `lsof -i :8080` to verify server is listening
- Start FastAPI: `cd infra/local-api && python main.py`

### 401 Unauthorized:
- API key mismatch
- Check `.env` in `infra/local-api/` has correct `API_KEYS`
- Check Vercel env var `LOCAL_API_KEY` matches

### DNS not resolving:
- Wait 1-2 minutes for DNS propagation
- Check: `dig api.gallagherpropco.com` should show CNAME record
- Clear DNS cache: `sudo dscacheutil -flushcache` (macOS)

### Tiles return 204 everywhere:
- PostgreSQL not running or data missing
- Check: `psql postgresql://postgres:Nola0528!@localhost:5432/cres_db -c "SELECT COUNT(*) FROM ebr_parcels WHERE geom IS NOT NULL;"`

---

## Security Notes

1. **API Keys:**
   - Use strong random keys: `openssl rand -hex 32`
   - Rotate keys periodically
   - Don't commit keys to git

2. **CORS:**
   - FastAPI config restricts origins to `ALLOWED_ORIGINS`
   - Update `.env` if adding new Vercel domains

3. **Rate Limiting:**
   - Consider adding rate limiting to FastAPI (e.g., `slowapi`)
   - Cloudflare provides basic DDoS protection

4. **Monitoring:**
   - Check Cloudflare Analytics for traffic
   - Monitor FastAPI logs for errors
   - Set up alerts for tunnel disconnections

---

## Alternative: ngrok (Quick Testing)

If you just want to test quickly without setting up Cloudflare:

```bash
# Install ngrok
brew install ngrok

# Start tunnel
ngrok http 8080

# Use the generated URL (e.g., https://abc123.ngrok.io)
# Set LOCAL_API_URL=https://abc123.ngrok.io in Vercel

# Note: ngrok URLs change on restart (free tier)
```

**Cloudflare Tunnel is recommended for production** because URLs are stable and free.

---

## Maintenance

### Update tunnel config:
```bash
# Edit config
vim ~/.cloudflared/config.yml

# Restart tunnel
launchctl unload ~/Library/LaunchAgents/com.cloudflare.tunnel.plist
launchctl load ~/Library/LaunchAgents/com.cloudflare.tunnel.plist
```

### View tunnel list:
```bash
cloudflared tunnel list
```

### Delete a tunnel:
```bash
cloudflared tunnel delete gpc-local-api
```

---

## Next Steps

Once the tunnel is working:

1. Monitor performance and latency
2. Set up logging/alerting for tunnel disconnections
3. Consider adding request caching at the Cloudflare edge
4. Document API endpoints for your agents
5. Add more custom endpoints to `main.py` as needed

---

## Support

- Cloudflare Tunnel Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- FastAPI Deployment: https://fastapi.tiangolo.com/deployment/
- Issues? Check logs in `/tmp/cloudflared.log` or FastAPI terminal output
