"""
FastAPI Tile Server (Port 8080)
Proxies vector tiles from Martin server to Cloudflare Tunnel.
Part of dual-server architecture: tiles.gallagherpropco.com → this server → Martin.
"""
import os
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import Response
import httpx
from dotenv import load_dotenv
import secrets
from datetime import datetime, timezone

load_dotenv()

# =============================================================================
# Configuration
# =============================================================================

MARTIN_URL = os.getenv("MARTIN_URL", "http://localhost:3000")
API_KEYS = set(os.getenv("API_KEYS", "").split(","))  # Comma-separated keys

if not API_KEYS or "" in API_KEYS:
    print("⚠️  WARNING: No API_KEYS set! API is INSECURE!")
    print("⚠️  Set API_KEYS in .env file")

# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="GPC Tile Server",
    description="Vector tile proxy for Martin MVT server (tiles subdomain)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# =============================================================================
# Authentication
# =============================================================================


def verify_api_key(request: Request) -> str:
    """Verify API key from Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Bearer token format
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header format (use: Bearer <key>)",
        )

    api_key = parts[1]

    # Constant-time comparison to prevent timing attacks
    if not any(secrets.compare_digest(api_key, valid_key) for valid_key in API_KEYS):
        raise HTTPException(
            status_code=401,
            detail="Invalid API key",
        )

    return api_key


# =============================================================================
# Health Check
# =============================================================================


@app.get("/health")
async def health_check():
    """Public health check (no auth required)."""
    # Test Martin
    martin_status = "unknown"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{MARTIN_URL}/health")
            martin_status = "up" if resp.status_code == 200 else "down"
    except:
        martin_status = "unreachable"

    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "martin": martin_status,
    }


# =============================================================================
# Tiles Proxy (Martin)
# =============================================================================


@app.get("/tiles/{z}/{x}/{y}.pbf")
async def get_tile(
    z: int,
    x: int,
    y: int,
    api_key: str = Depends(verify_api_key)
):
    """
    Proxy vector tiles from Martin server.
    Requires authentication.
    Cache-Control: 7 days immutable (per SPEC.md).
    """
    # Validate tile coordinates
    if z < 0 or z > 22:
        raise HTTPException(status_code=400, detail="Invalid zoom level")
    if x < 0 or x >= (1 << z):
        raise HTTPException(status_code=400, detail="Invalid tile X coordinate")
    if y < 0 or y >= (1 << z):
        raise HTTPException(status_code=400, detail="Invalid tile Y coordinate")

    # Proxy to Martin
    martin_tile_url = f"{MARTIN_URL}/parcels/{z}/{x}/{y}.pbf"

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(martin_tile_url)

            if resp.status_code == 204:
                # No data for this tile
                return Response(status_code=204)

            if resp.status_code != 200:
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Martin returned {resp.status_code}"
                )

            return Response(
                content=resp.content,
                media_type="application/vnd.mapbox-vector-tile",
                headers={
                    "Cache-Control": "public, max-age=604800, immutable",  # 7 days
                    "Content-Length": str(len(resp.content)),
                },
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=503,
                detail=f"Martin tile server unreachable: {str(e)}"
            )


# =============================================================================
# Run Server
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    print("=" * 70)
    print("🗺️  GPC Tile Server (tiles.gallagherpropco.com)")
    print("=" * 70)
    print(f"📍 Server: http://localhost:8080")
    print(f"📖 Docs:   http://localhost:8080/docs")
    print(f"🗺️  Martin: {MARTIN_URL}")
    print(f"🔑 API Keys: {len(API_KEYS)} configured")
    print("=" * 70)

    uvicorn.run(
        "tile_server:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
        log_level="info",
    )
