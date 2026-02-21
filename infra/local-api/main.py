"""
FastAPI server for local PostgreSQL + Martin tile proxy.
Provides secure API access from Vercel to local 12-core i7 server.
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, Depends, Query
from fastapi.responses import Response
import httpx
import asyncpg
from typing import Optional, AsyncIterator
from dotenv import load_dotenv
import secrets
from datetime import datetime, timezone
import json

load_dotenv()

# =============================================================================
# Configuration
# =============================================================================

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")
MARTIN_URL = os.getenv("MARTIN_URL", "http://localhost:3000")
API_KEYS = set(os.getenv("API_KEYS", "").split(","))  # Comma-separated keys

if not API_KEYS or "" in API_KEYS:
    print("⚠️  WARNING: No API_KEYS set! API is INSECURE!")
    print("⚠️  Set API_KEYS in .env file")

# =============================================================================
# Database Connection Pool
# =============================================================================

db_pool: Optional[asyncpg.Pool] = None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifespan (startup/shutdown)."""
    global db_pool
    # Startup
    db_pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=5,
        max_size=20,
        command_timeout=60,
    )
    print(f"✅ Database pool created: {DATABASE_URL}")

    yield

    # Shutdown
    if db_pool:
        await db_pool.close()
        print("✅ Database pool closed")


async def get_db():
    """Dependency: get database connection from pool."""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")
    async with db_pool.acquire() as conn:
        yield conn


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="GPC Local Property Database API",
    description="Secure API for Vercel to access local PostgreSQL + Martin tiles",
    version="1.0.0",
    docs_url="/docs",  # OpenAPI docs at http://localhost:8080/docs
    redoc_url="/redoc",
    lifespan=lifespan,
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
    db_status = "connected" if db_pool else "disconnected"

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
        "database": db_status,
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
                    "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
                    "Content-Length": str(len(resp.content)),
                },
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=503,
                detail=f"Martin tile server unreachable: {str(e)}"
            )


# =============================================================================
# Parcel Search
# =============================================================================


@app.get("/api/parcels/search")
async def search_parcels(
    q: str = Query(..., description="Search text (address, owner, parcel ID)"),
    parish: Optional[str] = Query(None, description="Filter by parish"),
    limit: int = Query(25, ge=1, le=100, description="Max results"),
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Search parcels by text (address, owner, parcel ID).
    Uses api_search_parcels RPC function.
    """
    rows = await conn.fetch(
        """
        SELECT * FROM api_search_parcels($1::text, $2::text, $3::int)
        """,
        q,
        parish,
        limit,
    )

    return {
        "ok": True,
        "count": len(rows),
        "data": [dict(row) for row in rows],
    }


# =============================================================================
# Get Parcel by ID
# =============================================================================


@app.get("/api/parcels/{parcel_id}")
async def get_parcel(
    parcel_id: str,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Get parcel details by ID (uuid or parcel_uid).
    Uses api_get_parcel RPC function.
    """
    rows = await conn.fetch(
        """
        SELECT * FROM api_get_parcel($1::text)
        """,
        parcel_id,
    )

    if not rows:
        raise HTTPException(status_code=404, detail="Parcel not found")

    return {
        "ok": True,
        "data": dict(rows[0]),
    }


# =============================================================================
# Get Parcel Geometry
# =============================================================================


@app.get("/api/parcels/{parcel_id}/geometry")
async def get_parcel_geometry(
    parcel_id: str,
    detail_level: str = Query("low", regex="^(low|medium|high)$"),
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Get parcel geometry (GeoJSON) with simplified coordinates.
    Uses rpc_get_parcel_geometry RPC function.
    """
    rows = await conn.fetch(
        """
        SELECT * FROM rpc_get_parcel_geometry($1::text, $2::text)
        """,
        parcel_id,
        detail_level,
    )

    if not rows:
        raise HTTPException(status_code=404, detail="Parcel geometry not found")

    row = dict(rows[0])

    # Parse GeoJSON string if needed
    if isinstance(row.get("geom_simplified"), str):
        try:
            row["geom_simplified"] = json.loads(row["geom_simplified"])
        except:
            pass

    return {
        "ok": True,
        "data": row,
    }


# =============================================================================
# Screening Endpoints (for agents)
# =============================================================================


@app.post("/api/screening/flood")
async def screen_flood(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Screen parcel for flood zones.
    Expects: { "parcelId": "...", "lat": 30.45, "lng": -91.18 }
    """
    body = await request.json()
    parcel_id = body.get("parcelId")
    lat = body.get("lat")
    lng = body.get("lng")

    if not parcel_id or lat is None or lng is None:
        raise HTTPException(
            status_code=400,
            detail="Missing required fields: parcelId, lat, lng"
        )

    # TODO: Implement api_screen_flood RPC or custom query
    # For now, return mock data
    return {
        "ok": True,
        "data": {
            "parcelId": parcel_id,
            "floodZone": "X",  # Minimal risk
            "floodRisk": "low",
            "firmPanel": "22033C0305E",
            "effectiveDate": "2024-01-01",
        }
    }


@app.post("/api/screening/full")
async def screen_full(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Full parcel screening (flood, soils, wetlands, EPA, traffic, LDEQ).
    Expects: { "parcelId": "..." }
    """
    body = await request.json()
    parcel_id = body.get("parcelId")

    if not parcel_id:
        raise HTTPException(status_code=400, detail="Missing parcelId")

    # TODO: Implement api_screen_full RPC
    # For now, return mock data
    return {
        "ok": True,
        "data": {
            "parcelId": parcel_id,
            "flood": {"zone": "X", "risk": "low"},
            "soils": {"rating": 3, "suitability": "good"},
            "wetlands": {"present": False},
            "epa": {"superfundSites": 0, "distance": None},
            "traffic": {"aadt": 12500},
            "ldeq": {"sites": 0},
            "overallScore": 85,
        }
    }




# =============================================================================
# Stats Endpoint
# =============================================================================


@app.get("/api/stats")
async def get_stats(
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Get database statistics (parcel counts, geometry coverage, etc.)."""
    row = await conn.fetchrow(
        """
        SELECT
            COUNT(*) AS total_parcels,
            COUNT(geom) AS parcels_with_geom,
            ROUND(100.0 * COUNT(geom) / COUNT(*), 2) AS geom_coverage_pct,
            COUNT(DISTINCT COALESCE(owner, 'Unknown')) AS unique_owners,
            SUM(area_sqft) / 43560.0 AS total_acres
        FROM ebr_parcels
        """
    )

    return {
        "ok": True,
        "data": dict(row),
    }


# =============================================================================
# Run Server
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    print("=" * 70)
    print("🚀 GPC Local Property Database API")
    print("=" * 70)
    print(f"📍 Server: http://localhost:8080")
    print(f"📖 Docs:   http://localhost:8080/docs")
    print(f"🗄️  Database: {DATABASE_URL}")
    print(f"🗺️  Martin: {MARTIN_URL}")
    print(f"🔑 API Keys: {len(API_KEYS)} configured")
    print("=" * 70)

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=True,  # Auto-reload on code changes
        log_level="info",
    )
