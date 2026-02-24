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
from admin_router import router as admin_router, set_db_pool as set_admin_db_pool
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
        set_admin_db_pool(db_pool)
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


app.include_router(admin_router, prefix="/admin")


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
                       zoning_type, existing_land_use, future_land_use,
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
                       zoning_type as zoning, existing_land_use, future_land_use,
                       NULL::text as flood_zone,
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
# Screening Helpers
# =============================================================================


async def resolve_parcel(conn: asyncpg.Connection, parcel_id: str):
    """Resolve a text parcel_id (e.g. '001-5096-7') to (uuid, geom) from ebr_parcels."""
    row = await conn.fetchrow(
        """
        SELECT id, geom
        FROM ebr_parcels
        WHERE parcel_id = $1
           OR lower(parcel_id) = lower($1)
           OR replace(parcel_id, '-', '') = replace($1, '-', '')
        LIMIT 1
        """,
        parcel_id,
    )
    return row


# =============================================================================
# Screening Endpoints (for agents)
# =============================================================================


@app.post("/api/screening/zoning")
async def screen_zoning(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Screen parcel for zoning classification. Expects: { "parcelId": "001-5096-7" }"""
    body = await request.json()
    parcel_id = body.get("parcelId")
    if not parcel_id:
        raise HTTPException(status_code=400, detail="Missing parcelId")

    row = await conn.fetchrow(
        """
        SELECT parcel_id, address, owner, area_sqft,
               zoning_type, existing_land_use, future_land_use
        FROM ebr_parcels
        WHERE parcel_id = $1
           OR lower(parcel_id) = lower($1)
           OR replace(parcel_id, '-', '') = replace($1, '-', '')
        LIMIT 1
        """,
        parcel_id,
    )
    if not row:
        return {"ok": False, "error": f"Parcel '{parcel_id}' not found"}

    return {
        "ok": True,
        "data": {
            "parcelId": row["parcel_id"],
            "address": row["address"],
            "zoningType": row["zoning_type"],
            "existingLandUse": row["existing_land_use"],
            "futureLandUse": row["future_land_use"],
        },
    }


@app.post("/api/screening/flood")
async def screen_flood(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Screen parcel for FEMA flood zones. Expects: { "parcelId": "001-5096-7" }"""
    body = await request.json()
    parcel_id = body.get("parcelId")
    if not parcel_id:
        raise HTTPException(status_code=400, detail="Missing parcelId")

    parcel = await resolve_parcel(conn, parcel_id)
    if not parcel:
        return {"ok": False, "error": f"Parcel '{parcel_id}' not found"}

    # SFHA zones: A, AE, AH, AO, AR, V, VE (Special Flood Hazard Areas)
    SFHA_PREFIXES = ("A", "V")

    rows = await conn.fetch(
        """
        SELECT
            f.zone,
            f.bfe,
            f.panel_id,
            f.effective_date,
            ROUND(
                (ST_Area(ST_Intersection(f.geom, $1::geometry)) /
                 NULLIF(ST_Area($1::geometry), 0) * 100)::numeric, 2
            ) AS overlap_pct
        FROM fema_flood f
        WHERE ST_Intersects(f.geom, $1::geometry)
        ORDER BY overlap_pct DESC
        """,
        parcel["geom"],
    )

    zones = [
        {
            "floodZone": r["zone"],
            "bfe": float(r["bfe"]) if r["bfe"] else None,
            "inSfha": (r["zone"] or "").startswith(SFHA_PREFIXES),
            "panelId": r["panel_id"],
            "effectiveDate": r["effective_date"].isoformat() if r["effective_date"] else None,
            "overlapPct": float(r["overlap_pct"]) if r["overlap_pct"] else 0,
        }
        for r in rows
    ]
    in_sfha = any(z["inSfha"] for z in zones)

    return {
        "ok": True,
        "data": {
            "parcelId": parcel_id,
            "inSfha": in_sfha,
            "zoneCount": len(zones),
            "zones": zones,
        },
    }


@app.post("/api/screening/soils")
async def screen_soils(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Screen parcel for USDA soil conditions. Expects: { "parcelId": "001-5096-7" }"""
    body = await request.json()
    parcel_id = body.get("parcelId")
    if not parcel_id:
        raise HTTPException(status_code=400, detail="Missing parcelId")

    parcel = await resolve_parcel(conn, parcel_id)
    if not parcel:
        return {"ok": False, "error": f"Parcel '{parcel_id}' not found"}

    rows = await conn.fetch(
        """
        SELECT
            s.mapunit_key,
            s.drainage_class,
            s.hydric_rating,
            s.shrink_swell,
            ROUND(
                (ST_Area(ST_Intersection(s.geom, $1::geometry)) /
                 NULLIF(ST_Area($1::geometry), 0) * 100)::numeric, 2
            ) AS overlap_pct
        FROM soils s
        WHERE ST_Intersects(s.geom, $1::geometry)
        ORDER BY overlap_pct DESC
        """,
        parcel["geom"],
    )

    units = [
        {
            "mapunitKey": r["mapunit_key"],
            "drainageClass": r["drainage_class"],
            "hydricRating": r["hydric_rating"],
            "shrinkSwell": r["shrink_swell"],
            "overlapPct": float(r["overlap_pct"]) if r["overlap_pct"] else 0,
        }
        for r in rows
    ]
    has_hydric = any(
        u["hydricRating"] and u["hydricRating"].lower() in ("yes", "all hydric")
        for u in units
    )

    return {
        "ok": True,
        "data": {
            "parcelId": parcel_id,
            "hasHydric": has_hydric,
            "unitCount": len(units),
            "soilUnits": units,
        },
    }


@app.post("/api/screening/wetlands")
async def screen_wetlands(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Screen parcel for NWI wetlands. Expects: { "parcelId": "001-5096-7" }"""
    body = await request.json()
    parcel_id = body.get("parcelId")
    if not parcel_id:
        raise HTTPException(status_code=400, detail="Missing parcelId")

    parcel = await resolve_parcel(conn, parcel_id)
    if not parcel:
        return {"ok": False, "error": f"Parcel '{parcel_id}' not found"}

    rows = await conn.fetch(
        """
        SELECT
            w.wetland_type,
            ROUND(
                (ST_Area(ST_Intersection(w.geom, $1::geometry)) /
                 NULLIF(ST_Area($1::geometry), 0) * 100)::numeric, 2
            ) AS overlap_pct
        FROM wetlands w
        WHERE ST_Intersects(w.geom, $1::geometry)
        ORDER BY overlap_pct DESC
        """,
        parcel["geom"],
    )

    areas = [
        {
            "wetlandType": r["wetland_type"],
            "overlapPct": float(r["overlap_pct"]) if r["overlap_pct"] else 0,
        }
        for r in rows
    ]
    has_wetlands = len(areas) > 0

    return {
        "ok": True,
        "data": {
            "parcelId": parcel_id,
            "hasWetlands": has_wetlands,
            "areaCount": len(areas),
            "wetlandAreas": areas,
        },
    }


@app.post("/api/screening/epa")
async def screen_epa(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Screen parcel for nearby EPA-regulated facilities. Expects: { "parcelId": "...", "radiusMiles": 1.0 }"""
    body = await request.json()
    parcel_id = body.get("parcelId")
    if not parcel_id:
        raise HTTPException(status_code=400, detail="Missing parcelId")

    radius_miles = float(body.get("radiusMiles", 1.0))
    radius_meters = radius_miles * 1609.34

    parcel = await resolve_parcel(conn, parcel_id)
    if not parcel:
        return {"ok": False, "error": f"Parcel '{parcel_id}' not found"}

    rows = await conn.fetch(
        """
        SELECT
            e.registry_id,
            e.name,
            e.city,
            e.zip,
            e.status,
            e.violations_last_3yr,
            e.penalties_last_3yr,
            ROUND(
                (ST_Distance(
                    e.geom::geography,
                    ST_Centroid($1::geometry)::geography
                ) / 1609.34)::numeric, 2
            ) AS distance_miles
        FROM epa_facilities e
        WHERE ST_DWithin(
            e.geom::geography,
            ST_Centroid($1::geometry)::geography,
            $2
        )
        ORDER BY distance_miles ASC
        """,
        parcel["geom"],
        radius_meters,
    )

    facilities = [
        {
            "registryId": r["registry_id"],
            "name": r["name"],
            "city": r["city"],
            "zip": r["zip"],
            "status": r["status"],
            "violationsLast3yr": r["violations_last_3yr"],
            "penaltiesLast3yr": float(r["penalties_last_3yr"]) if r["penalties_last_3yr"] else None,
            "distanceMiles": float(r["distance_miles"]) if r["distance_miles"] else None,
        }
        for r in rows
    ]

    return {
        "ok": True,
        "data": {
            "parcelId": parcel_id,
            "radiusMiles": radius_miles,
            "facilityCount": len(facilities),
            "facilities": facilities,
        },
    }


@app.post("/api/screening/traffic")
async def screen_traffic(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Screen parcel for nearby traffic counts. Expects: { "parcelId": "...", "radiusMiles": 0.5 }"""
    body = await request.json()
    parcel_id = body.get("parcelId")
    if not parcel_id:
        raise HTTPException(status_code=400, detail="Missing parcelId")

    radius_miles = float(body.get("radiusMiles", 0.5))
    radius_meters = radius_miles * 1609.34

    parcel = await resolve_parcel(conn, parcel_id)
    if not parcel:
        return {"ok": False, "error": f"Parcel '{parcel_id}' not found"}

    # Check if traffic_counts table exists
    table_exists = await conn.fetchval(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'traffic_counts')"
    )
    if not table_exists:
        return {
            "ok": True,
            "data": {
                "parcelId": parcel_id,
                "available": False,
                "message": "Traffic counts table not yet loaded in the database.",
            },
        }

    rows = await conn.fetch(
        """
        SELECT
            t.route_name,
            t.aadt,
            t.year,
            ROUND(
                (ST_Distance(
                    t.geom::geography,
                    ST_Centroid($1::geometry)::geography
                ) / 1609.34)::numeric, 2
            ) AS distance_miles
        FROM traffic_counts t
        WHERE ST_DWithin(
            t.geom::geography,
            ST_Centroid($1::geometry)::geography,
            $2
        )
        ORDER BY distance_miles ASC
        """,
        parcel["geom"],
        radius_meters,
    )

    counts = [
        {
            "route": r["route_name"],
            "aadt": r["aadt"],
            "year": r["year"],
            "distanceMiles": float(r["distance_miles"]) if r["distance_miles"] else None,
        }
        for r in rows
    ]

    return {
        "ok": True,
        "data": {
            "parcelId": parcel_id,
            "radiusMiles": radius_miles,
            "available": True,
            "countStations": len(counts),
            "trafficCounts": counts,
        },
    }


@app.post("/api/screening/ldeq")
async def screen_ldeq(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Screen parcel for nearby LDEQ permits. Expects: { "parcelId": "...", "radiusMiles": 1.0 }"""
    body = await request.json()
    parcel_id = body.get("parcelId")
    if not parcel_id:
        raise HTTPException(status_code=400, detail="Missing parcelId")

    radius_miles = float(body.get("radiusMiles", 1.0))
    radius_meters = radius_miles * 1609.34

    parcel = await resolve_parcel(conn, parcel_id)
    if not parcel:
        return {"ok": False, "error": f"Parcel '{parcel_id}' not found"}

    # Check if ldeq_permits table exists
    table_exists = await conn.fetchval(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ldeq_permits')"
    )
    if not table_exists:
        return {
            "ok": True,
            "data": {
                "parcelId": parcel_id,
                "available": False,
                "message": "LDEQ permits table not yet loaded in the database.",
            },
        }

    rows = await conn.fetch(
        """
        SELECT
            l.ai_number,
            l.facility_name,
            l.permit_type,
            l.status,
            ROUND(
                (ST_Distance(
                    l.geom::geography,
                    ST_Centroid($1::geometry)::geography
                ) / 1609.34)::numeric, 2
            ) AS distance_miles
        FROM ldeq_permits l
        WHERE ST_DWithin(
            l.geom::geography,
            ST_Centroid($1::geometry)::geography,
            $2
        )
        ORDER BY distance_miles ASC
        """,
        parcel["geom"],
        radius_meters,
    )

    permits = [
        {
            "aiNumber": r["ai_number"],
            "facilityName": r["facility_name"],
            "permitType": r["permit_type"],
            "status": r["status"],
            "distanceMiles": float(r["distance_miles"]) if r["distance_miles"] else None,
        }
        for r in rows
    ]

    return {
        "ok": True,
        "data": {
            "parcelId": parcel_id,
            "radiusMiles": radius_miles,
            "available": True,
            "permitCount": len(permits),
            "permits": permits,
        },
    }


@app.post("/api/screening/full")
async def screen_full(
    request: Request,
    api_key: str = Depends(verify_api_key),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Full parcel screening (flood, soils, wetlands, EPA, traffic, LDEQ).
    Expects: { "parcelId": "001-5096-7" }
    """
    body = await request.json()
    parcel_id = body.get("parcelId")
    if not parcel_id:
        raise HTTPException(status_code=400, detail="Missing parcelId")

    parcel = await resolve_parcel(conn, parcel_id)
    if not parcel:
        return {"ok": False, "error": f"Parcel '{parcel_id}' not found"}

    geom = parcel["geom"]

    # --- Zoning (column lookup, no spatial query) ---
    try:
        zoning_row = await conn.fetchrow(
            """
            SELECT zoning_type, existing_land_use, future_land_use
            FROM ebr_parcels
            WHERE parcel_id = $1
               OR lower(parcel_id) = lower($1)
               OR replace(parcel_id, '-', '') = replace($1, '-', '')
            LIMIT 1
            """,
            parcel_id,
        )
        zoning_result = {
            "zoningType": zoning_row["zoning_type"] if zoning_row else None,
            "existingLandUse": zoning_row["existing_land_use"] if zoning_row else None,
            "futureLandUse": zoning_row["future_land_use"] if zoning_row else None,
        }
    except Exception as e:
        zoning_result = {"error": str(e)}

    # --- Flood ---
    try:
        flood_rows = await conn.fetch(
            """
            SELECT zone, bfe, panel_id, effective_date,
                   ROUND((ST_Area(ST_Intersection(geom, $1::geometry)) /
                          NULLIF(ST_Area($1::geometry), 0) * 100)::numeric, 2) AS overlap_pct
            FROM fema_flood WHERE ST_Intersects(geom, $1::geometry)
            ORDER BY overlap_pct DESC
            """, geom,
        )
        flood_zones = [{"floodZone": r["zone"], "inSfha": (r["zone"] or "").startswith(("A", "V")),
                        "bfe": r["bfe"], "panelId": r["panel_id"],
                        "overlapPct": float(r["overlap_pct"] or 0)} for r in flood_rows]
        flood_result = {"inSfha": any(z["inSfha"] for z in flood_zones), "zoneCount": len(flood_zones), "zones": flood_zones}
    except Exception as e:
        flood_result = {"error": str(e)}

    # --- Soils ---
    try:
        soils_rows = await conn.fetch(
            """
            SELECT mapunit_key, drainage_class, hydric_rating, shrink_swell,
                   ROUND((ST_Area(ST_Intersection(geom, $1::geometry)) /
                          NULLIF(ST_Area($1::geometry), 0) * 100)::numeric, 2) AS overlap_pct
            FROM soils WHERE ST_Intersects(geom, $1::geometry)
            ORDER BY overlap_pct DESC
            """, geom,
        )
        soil_units = [{"mapunitKey": r["mapunit_key"], "drainageClass": r["drainage_class"],
                       "hydricRating": r["hydric_rating"], "shrinkSwell": r["shrink_swell"],
                       "overlapPct": float(r["overlap_pct"] or 0)} for r in soils_rows]
        soils_result = {"hasHydric": any(u["hydricRating"] and u["hydricRating"].lower() in ("yes", "all hydric") for u in soil_units),
                        "unitCount": len(soil_units), "soilUnits": soil_units}
    except Exception as e:
        soils_result = {"error": str(e)}

    # --- Wetlands ---
    try:
        wet_rows = await conn.fetch(
            """
            SELECT wetland_type,
                   ROUND((ST_Area(ST_Intersection(geom, $1::geometry)) /
                          NULLIF(ST_Area($1::geometry), 0) * 100)::numeric, 2) AS overlap_pct
            FROM wetlands WHERE ST_Intersects(geom, $1::geometry)
            ORDER BY overlap_pct DESC
            """, geom,
        )
        wet_areas = [{"wetlandType": r["wetland_type"],
                      "overlapPct": float(r["overlap_pct"] or 0)} for r in wet_rows]
        wetlands_result = {"hasWetlands": len(wet_areas) > 0, "areaCount": len(wet_areas), "wetlandAreas": wet_areas}
    except Exception as e:
        wetlands_result = {"error": str(e)}

    # --- EPA (1 mile) ---
    try:
        epa_rows = await conn.fetch(
            """
            SELECT registry_id, name, city, zip, status, violations_last_3yr, penalties_last_3yr,
                   ROUND((ST_Distance(e.geom::geography, ST_Centroid($1::geometry)::geography) / 1609.34)::numeric, 2) AS distance_miles
            FROM epa_facilities e
            WHERE ST_DWithin(e.geom::geography, ST_Centroid($1::geometry)::geography, $2)
            ORDER BY distance_miles ASC
            """, geom, 1609.34,
        )
        epa_facs = [{"registryId": r["registry_id"], "name": r["name"], "city": r["city"],
                     "status": r["status"], "violations": r["violations_last_3yr"],
                     "penalties": r["penalties_last_3yr"],
                     "distanceMiles": float(r["distance_miles"] or 0)} for r in epa_rows]
        epa_result = {"facilityCount": len(epa_facs), "facilities": epa_facs}
    except Exception as e:
        epa_result = {"error": str(e)}

    # --- Traffic (0.5 mile) ---
    try:
        has_traffic = await conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'traffic_counts')"
        )
        if has_traffic:
            traf_rows = await conn.fetch(
                """
                SELECT route_name, aadt, year,
                       ROUND((ST_Distance(geom::geography, ST_Centroid($1::geometry)::geography) / 1609.34)::numeric, 2) AS distance_miles
                FROM traffic_counts
                WHERE ST_DWithin(geom::geography, ST_Centroid($1::geometry)::geography, $2)
                ORDER BY distance_miles ASC
                """, geom, 804.67,
            )
            traffic_result = {"available": True, "countStations": len(traf_rows),
                              "trafficCounts": [{"route": r["route_name"], "aadt": r["aadt"],
                                                 "distanceMiles": float(r["distance_miles"] or 0)} for r in traf_rows]}
        else:
            traffic_result = {"available": False, "message": "Traffic counts table not yet loaded."}
    except Exception as e:
        traffic_result = {"error": str(e)}

    # --- LDEQ (1 mile) ---
    try:
        has_ldeq = await conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ldeq_permits')"
        )
        if has_ldeq:
            ldeq_rows = await conn.fetch(
                """
                SELECT ai_number, facility_name, permit_type, status,
                       ROUND((ST_Distance(geom::geography, ST_Centroid($1::geometry)::geography) / 1609.34)::numeric, 2) AS distance_miles
                FROM ldeq_permits
                WHERE ST_DWithin(geom::geography, ST_Centroid($1::geometry)::geography, $2)
                ORDER BY distance_miles ASC
                """, geom, 1609.34,
            )
            ldeq_result = {"available": True, "permitCount": len(ldeq_rows),
                           "permits": [{"aiNumber": r["ai_number"], "facilityName": r["facility_name"],
                                        "distanceMiles": float(r["distance_miles"] or 0)} for r in ldeq_rows]}
        else:
            ldeq_result = {"available": False, "message": "LDEQ permits table not yet loaded."}
    except Exception as e:
        ldeq_result = {"error": str(e)}

    return {
        "ok": True,
        "data": {
            "parcelId": parcel_id,
            "zoning": zoning_result,
            "flood": flood_result,
            "soils": soils_result,
            "wetlands": wetlands_result,
            "epa": epa_result,
            "traffic": traffic_result,
            "ldeq": ldeq_result,
        },
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
