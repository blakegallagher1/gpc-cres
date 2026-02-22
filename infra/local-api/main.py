"""
FastAPI server for local PostgreSQL + Martin tile proxy.
Provides secure API access from Vercel to local backend.
Runs on port 8000. Postgres (5432) is never exposed to the internet.
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, Depends, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
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
APPLICATION_DATABASE_URL = os.getenv("APPLICATION_DATABASE_URL") or DATABASE_URL
MARTIN_URL = os.getenv("MARTIN_URL", "http://localhost:3000")
API_KEYS = set(
    k.strip()
    for k in (os.getenv("API_KEYS") or os.getenv("GATEWAY_API_KEY") or "").split(",")
    if k.strip()
)
ALLOWED_ORIGINS = [
    o.strip() for o in (os.getenv("ALLOWED_ORIGINS") or "").split(",") if o.strip()
]

if not API_KEYS:
    print("⚠️  WARNING: No API_KEYS set! API is INSECURE!")
    print("⚠️  Set API_KEYS in .env file")

# =============================================================================
# Database Connection Pools
# =============================================================================

db_pool: Optional[asyncpg.Pool] = None
app_db_pool: Optional[asyncpg.Pool] = None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifespan (startup/shutdown)."""
    global db_pool, app_db_pool
    # Property DB (parcels, Martin-related)
    if DATABASE_URL:
        db_pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=60,
        )
        print(f"✅ Property DB pool created")
    # Application DB (deals, orgs) - for /deals endpoint
    if APPLICATION_DATABASE_URL:
        app_db_pool = await asyncpg.create_pool(
            APPLICATION_DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=60,
        )
        print(f"✅ Application DB pool created")

    yield

    if db_pool:
        await db_pool.close()
    if app_db_pool:
        await app_db_pool.close()
    print("✅ Database pools closed")


async def get_db():
    """Dependency: get property DB connection."""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")
    async with db_pool.acquire() as conn:
        yield conn


async def get_app_db():
    """Dependency: get application DB connection (deals, orgs)."""
    if not app_db_pool:
        raise HTTPException(status_code=503, detail="Application database not available")
    async with app_db_pool.acquire() as conn:
        yield conn


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="GPC Local Property Database API",
    description="Secure API for Vercel to access local PostgreSQL + Martin tiles",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS: default deny if ALLOWED_ORIGINS unset
if ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to JSON responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


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
    db_status = "connected" if (db_pool or app_db_pool) else "disconnected"
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_status,
    }


# =============================================================================
# Deals (Application DB)
# =============================================================================


@app.get("/deals")
async def get_deals(
    org_id: str = Query(..., description="Org UUID for tenant isolation"),
    status: Optional[str] = Query(None),
    sku: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_app_db),
):
    """
    List deals for an org. Requires Bearer token.
    Returns: { "deals": [ { id, name, sku, status, createdAt, updatedAt, notes, jurisdiction, triageTier, triageScore } ] }
    """
    conditions = ["d.org_id = $1"]
    params: list = [org_id]
    idx = 2

    if status:
        conditions.append(f"d.status = ${idx}")
        params.append(status)
        idx += 1
    if sku:
        conditions.append(f"d.sku::text = ${idx}")
        params.append(sku)
        idx += 1
    if search:
        conditions.append(f"d.name ILIKE ${idx}")
        params.append(f"%{search}%")
        idx += 1

    where_clause = " AND ".join(conditions)
    params.append(limit)
    limit_param = idx

    rows = await conn.fetch(
        f"""
        SELECT
            d.id,
            d.name,
            d.sku::text AS sku,
            d.status::text AS status,
            d.created_at,
            d.updated_at,
            d.notes,
            j.id AS jurisdiction_id,
            j.name AS jurisdiction_name,
            (
                SELECT r.output_json
                FROM runs r
                WHERE r.deal_id = d.id AND r.run_type = 'TRIAGE'
                ORDER BY r.started_at DESC
                LIMIT 1
            ) AS triage_output
        FROM deals d
        LEFT JOIN jurisdictions j ON d.jurisdiction_id = j.id
        WHERE {where_clause}
        ORDER BY d.created_at DESC
        LIMIT ${limit_param}
        """,
        *params,
    )

    deals = []
    for row in rows:
        triage_tier = None
        triage_score = None
        if row["triage_output"] and isinstance(row["triage_output"], dict):
            out = row["triage_output"]
            triage_tier = out.get("tier") or (
                out.get("triage", {}).get("decision") if isinstance(out.get("triage"), dict) else None
            )
            triage_score = out.get("triageScore") or out.get("confidence")
            if triage_score is None and isinstance(out.get("triage"), dict):
                triage_score = out["triage"].get("confidence")

        deals.append({
            "id": str(row["id"]),
            "name": row["name"],
            "sku": row["sku"],
            "status": row["status"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
            "notes": row["notes"],
            "jurisdiction": (
                {"id": str(row["jurisdiction_id"]), "name": row["jurisdiction_name"]}
                if row["jurisdiction_id"] else None
            ),
            "triageTier": triage_tier,
            "triageScore": float(triage_score) if triage_score is not None else None,
        })

    return {"deals": deals}


@app.post("/deals")
async def create_deal(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_app_db),
):
    """
    Create a deal. Requires Bearer token.
    Body: { name, sku, jurisdictionId, notes?, targetCloseDate?, parcelAddress?, apn? }
    Headers: X-Org-Id, X-User-Id (for tenant isolation)
    """
    org_id = request.headers.get("X-Org-Id")
    created_by = request.headers.get("X-User-Id")
    if not org_id or not created_by:
        raise HTTPException(status_code=400, detail="X-Org-Id and X-User-Id headers required")

    body = await request.json()
    name = body.get("name")
    sku = body.get("sku")
    jurisdiction_id = body.get("jurisdictionId")
    if not name or not sku or not jurisdiction_id:
        raise HTTPException(status_code=400, detail="name, sku, and jurisdictionId required")

    valid_skus = ("SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING")
    if sku not in valid_skus:
        raise HTTPException(status_code=400, detail=f"Invalid sku. Must be one of: {', '.join(valid_skus)}")

    notes = body.get("notes")
    target_close_date = body.get("targetCloseDate")
    parcel_address = body.get("parcelAddress")
    apn = body.get("apn")

    row = await conn.fetchrow(
        """
        INSERT INTO deals (org_id, name, sku, jurisdiction_id, status, notes, target_close_date, created_by, created_at, updated_at)
        VALUES ($1, $2, $3::sku_type, $4, 'INTAKE', $5, $6::date, $7, NOW(), NOW())
        RETURNING id, name, sku, status, created_at, updated_at
        """,
        org_id,
        name,
        sku,
        jurisdiction_id,
        notes,
        target_close_date if target_close_date else None,
        created_by,
    )

    deal_id = str(row["id"])

    if parcel_address:
        await conn.execute(
            """
            INSERT INTO parcels (org_id, deal_id, address, apn, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            """,
            org_id,
            deal_id,
            parcel_address,
            apn,
        )

    jurisdiction_row = await conn.fetchrow(
        "SELECT id, name FROM jurisdictions WHERE id = $1", jurisdiction_id
    )
    jurisdiction = (
        {"id": str(jurisdiction_row["id"]), "name": jurisdiction_row["name"]}
        if jurisdiction_row else None
    )

    return {
        "deal": {
            "id": deal_id,
            "name": row["name"],
            "sku": row["sku"],
            "status": row["status"],
            "createdAt": row["created_at"].isoformat(),
            "updatedAt": row["updated_at"].isoformat(),
            "jurisdiction": jurisdiction,
        }
    }


@app.patch("/deals")
async def patch_deals(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_app_db),
):
    """
    Bulk actions on deals. Requires Bearer token.
    Body: { action: "delete"|"update-status", ids: string[], status?: string }
    Headers: X-Org-Id (for tenant isolation)
    """
    org_id = request.headers.get("X-Org-Id")
    if not org_id:
        raise HTTPException(status_code=400, detail="X-Org-Id header required")

    body = await request.json()
    action = body.get("action")
    ids = body.get("ids")
    if not action or not isinstance(ids, list) or len(ids) == 0:
        raise HTTPException(status_code=400, detail="action and ids (non-empty array) required")

    ids = list(set(str(i) for i in ids))

    if action == "delete":
        result = await conn.execute(
            "DELETE FROM deals WHERE org_id = $1 AND id = ANY($2::uuid[])",
            org_id,
            ids,
        )
        count = int(result.split()[-1]) if result else 0
        return {"action": "delete", "updated": count, "skipped": len(ids) - count, "ids": ids}

    if action == "update-status":
        status = body.get("status")
        if not status:
            raise HTTPException(status_code=400, detail="status required for update-status")
        valid = ("INTAKE", "TRIAGE_DONE", "PREAPP", "CONCEPT", "NEIGHBORS", "SUBMITTED", "HEARING", "APPROVED", "EXIT_MARKETED", "EXITED", "KILLED")
        if status not in valid:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
        result = await conn.execute(
            """
            UPDATE deals SET status = $1::deal_status, updated_at = NOW()
            WHERE org_id = $2 AND id = ANY($3::uuid[])
            """,
            status,
            org_id,
            ids,
        )
        count = int(result.split()[-1]) if result else 0
        return {"action": "update-status", "status": status, "updated": count, "skipped": len(ids) - count, "ids": ids}

    raise HTTPException(status_code=400, detail="action must be delete or update-status")


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
# Agent Tool Endpoints (/tools/parcel.* — used by propertyDbTools)
# =============================================================================


@app.post("/tools/parcel.lookup")
async def tools_parcel_lookup(
    request: Request,
    api_key: str = Depends(verify_api_key),
):
    """Lookup parcel by ID. Used by get_parcel_details agent tool."""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Property database not configured")
    body = await request.json()
    parcel_id = body.get("parcel_id")
    if not parcel_id:
        raise HTTPException(status_code=400, detail="parcel_id required")
    async with db_pool.acquire() as conn:
        try:
            rows = await conn.fetch("SELECT * FROM api_get_parcel($1::text)", parcel_id)
        except asyncpg.UndefinedFunctionError:
            rows = await conn.fetch(
                """
                SELECT id, parcel_id as parcel_uid, address as situs_address,
                       owner as owner_name,
                       COALESCE(area_sqft, 0) / 43560.0 as acreage,
                       ST_Y(ST_Centroid(geom)) as lat, ST_X(ST_Centroid(geom)) as lng,
                       ST_AsGeoJSON(geom)::text as geom_simplified,
                       ARRAY[ST_XMin(geom), ST_YMin(geom), ST_XMax(geom), ST_YMax(geom)] as bbox
                FROM ebr_parcels
                WHERE id::text = $1 OR parcel_id = $1
                   OR lower(parcel_id) = lower($1)
                   OR replace(parcel_id, '-', '') = replace($1, '-', '')
                LIMIT 1
                """,
                parcel_id,
            )
    if not rows:
        return {"ok": False, "error": "Parcel not found", "data": None}
    return {"ok": True, "data": dict(rows[0])}


@app.post("/tools/parcel.bbox")
async def tools_parcel_bbox(
    request: Request,
    api_key: str = Depends(verify_api_key),
):
    """Search parcels in bounding box. Used by search_parcels agent tool."""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Property database not configured")
    body = await request.json()
    west = body.get("west")
    south = body.get("south")
    east = body.get("east")
    north = body.get("north")
    if None in (west, south, east, north):
        raise HTTPException(status_code=400, detail="west, south, east, north required")
    limit = min(int(body.get("limit", 25)), 100)
    parish = body.get("parish")
    async with db_pool.acquire() as conn:
        try:
            rows = await conn.fetch(
                """
                SELECT id::text, parcel_id as parcel_uid, address as site_address,
                       owner as owner_name,
                       COALESCE(area_sqft, 0) / 43560.0 as acreage,
                       NULL::text as zoning, NULL::text as flood_zone,
                       NULL::text as parish,
                       ST_Y(ST_Centroid(geom)) as lat, ST_X(ST_Centroid(geom)) as lng
                FROM ebr_parcels
                WHERE geom IS NOT NULL
                  AND ST_Y(ST_Centroid(geom)) BETWEEN $1 AND $2
                  AND ST_X(ST_Centroid(geom)) BETWEEN $3 AND $4
                LIMIT $5
                """,
                south, north, west, east, limit,
            )
        except Exception:
            return {"ok": True, "parcels": [], "count": 0, "data": []}
    data = [dict(r) for r in rows]
    return {"ok": True, "parcels": data, "count": len(data), "data": data}


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

    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")

    print("=" * 70)
    print("🚀 GPC Local Property Database API")
    print("=" * 70)
    print(f"📍 Server: http://localhost:{port}")
    print(f"📖 Docs:   http://localhost:{port}/docs")
    print(f"🗄️  Property DB: configured")
    print(f"🗄️  Application DB: configured" if APPLICATION_DATABASE_URL else "🗄️  Application DB: (using property DB)")
    print(f"🗺️  Martin: {MARTIN_URL}")
    print(f"🔑 API Keys: {len(API_KEYS)} configured")
    print("=" * 70)

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info",
    )
