"""
Data/Tools API Server (Port 8081)
Subdomain: api.gallagherpropco.com

Serves authenticated endpoints for parcel search, screening, and Qdrant operations.
"""

import asyncio
import hashlib
import json
import logging
import secrets
import sys
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional

import asyncpg
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, PointStruct, SearchRequest
from dotenv import load_dotenv
import os

# ============================================================================
# Configuration
# ============================================================================

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
API_KEYS_STR = os.getenv("API_KEYS", "")
API_KEYS = [key.strip() for key in API_KEYS_STR.split(",") if key.strip()]

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env", file=sys.stderr)
    sys.exit(1)

if not API_KEYS:
    print("WARNING: API_KEYS not set in .env - authentication disabled", file=sys.stderr)

# ============================================================================
# JSON Logging
# ============================================================================

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        # Add custom fields if present (set via extra dict in log_request)
        endpoint = getattr(record, "endpoint", None)
        if endpoint is not None:
            log_obj["endpoint"] = endpoint
        method = getattr(record, "method", None)
        if method is not None:
            log_obj["method"] = method
        status = getattr(record, "status", None)
        if status is not None:
            log_obj["status"] = status
        latency_ms = getattr(record, "latency_ms", None)
        if latency_ms is not None:
            log_obj["latency_ms"] = latency_ms
        cache_hit = getattr(record, "cache_hit", None)
        if cache_hit is not None:
            log_obj["cache_hit"] = cache_hit
        result_count = getattr(record, "result_count", None)
        if result_count is not None:
            log_obj["result_count"] = result_count
        return json.dumps(log_obj)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
logger = logging.getLogger("api_server")
logger.addHandler(handler)
logger.setLevel(logging.INFO)

# ============================================================================
# Global State
# ============================================================================

app = FastAPI(title="Data/Tools API", version="1.0.0")
db_pool: Optional[asyncpg.Pool] = None
qdrant_client: Optional[QdrantClient] = None

# In-memory LRU cache (max 1000 entries)
cache: Dict[str, tuple[Any, float]] = {}
CACHE_MAX_ENTRIES = 1000

# ============================================================================
# Request/Response Models
# ============================================================================

class BboxFilters(BaseModel):
    searchText: Optional[str] = None
    parish: Optional[str] = None
    minAcres: Optional[float] = None
    maxAcres: Optional[float] = None

class BboxRequest(BaseModel):
    bbox: Dict[str, float] = Field(..., description="minLat, minLng, maxLat, maxLng")
    filters: Optional[BboxFilters] = None
    limit: int = Field(default=25, ge=1, le=100)

class FloodScreeningRequest(BaseModel):
    parcelId: str
    lat: float
    lng: float

class DocsSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(default=5, ge=1, le=20)
    filter: Optional[Dict[str, Any]] = None

class MemoryWriteRequest(BaseModel):
    conversationId: str
    userId: str
    content: str = Field(..., max_length=10240)  # 10KB max
    metadata: Optional[Dict[str, Any]] = None

# ============================================================================
# Authentication
# ============================================================================

def verify_api_key(request: Request) -> str:
    """Verify Bearer token with timing-safe comparison."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")

    api_key = parts[1]
    if not any(secrets.compare_digest(api_key, valid_key) for valid_key in API_KEYS):
        raise HTTPException(status_code=401, detail="Invalid API key")

    return api_key

# ============================================================================
# Caching Utilities
# ============================================================================

def cache_get(key: str, ttl: int) -> Optional[Any]:
    """Get cached value if not expired."""
    if key not in cache:
        return None

    value, timestamp = cache[key]
    age = datetime.now(timezone.utc).timestamp() - timestamp

    if age > ttl:
        del cache[key]
        return None

    return value

def cache_set(key: str, value: Any) -> None:
    """Set cached value with timestamp. LRU eviction if full."""
    if len(cache) >= CACHE_MAX_ENTRIES:
        # Evict oldest entry
        oldest_key = min(cache.keys(), key=lambda k: cache[k][1])
        del cache[oldest_key]

    cache[key] = (value, datetime.now(timezone.utc).timestamp())

def cache_key(endpoint: str, **params) -> str:
    """Generate cache key from endpoint and params."""
    params_str = json.dumps(params, sort_keys=True)
    return hashlib.sha256(f"{endpoint}:{params_str}".encode()).hexdigest()

# ============================================================================
# Startup/Shutdown
# ============================================================================

@app.on_event("startup")
async def startup():
    """Initialize database pool and Qdrant client."""
    global db_pool, qdrant_client

    try:
        db_pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=5,
            max_size=20,
            timeout=60,
            command_timeout=30,
        )
        logger.info("Database pool created")
    except Exception as e:
        logger.error(f"Failed to create database pool: {e}")
        raise

    try:
        qdrant_client = QdrantClient(url=QDRANT_URL, timeout=10)
        logger.info(f"Qdrant client connected to {QDRANT_URL}")
    except Exception as e:
        logger.error(f"Failed to connect to Qdrant: {e}")
        raise

@app.on_event("shutdown")
async def shutdown():
    """Close database pool and Qdrant client."""
    global db_pool, qdrant_client

    if db_pool:
        await db_pool.close()
        logger.info("Database pool closed")

    if qdrant_client:
        qdrant_client.close()
        logger.info("Qdrant client closed")

# ============================================================================
# Health Check (No Auth)
# ============================================================================

@app.get("/health")
async def health_check():
    """System health check. No authentication required."""
    db_status = "unknown"
    qdrant_status = "unknown"

    # Check database
    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            db_status = "connected"
        except Exception:
            db_status = "disconnected"
    else:
        db_status = "not_initialized"

    # Check Qdrant
    if qdrant_client:
        try:
            qdrant_client.get_collections()
            qdrant_status = "up"
        except Exception:
            qdrant_status = "down"
    else:
        qdrant_status = "not_initialized"

    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_status,
        "qdrant": qdrant_status,
    }

# ============================================================================
# Parcel Endpoints (Authenticated)
# ============================================================================

@app.post("/tool/parcel.bbox")
async def parcel_bbox_search(
    req: BboxRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Search parcels within bounding box.
    Cache: 60s
    """
    start_time = datetime.now(timezone.utc)

    # Validate bbox area
    bbox = req.bbox
    lat_range = bbox["maxLat"] - bbox["minLat"]
    lng_range = bbox["maxLng"] - bbox["minLng"]
    area = lat_range * lng_range

    if area > 0.1:  # 0.1 sq degrees (~100 sq km)
        raise HTTPException(
            status_code=400,
            detail="Bbox too large. Max area: 0.1 square degrees"
        )

    # Check cache
    ckey = cache_key("parcel.bbox", bbox=bbox, filters=req.filters, limit=req.limit)
    cached = cache_get(ckey, ttl=60)
    if cached is not None:
        latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        log_request("/tool/parcel.bbox", "POST", 200, latency, True, len(cached))
        return JSONResponse(
            content={"ok": True, "count": len(cached), "cached": True, "data": cached},
            headers={"Cache-Control": "public, max-age=60"}
        )

    # Build query
    sql = """
        SELECT
            id::text,
            parcel_uid,
            site_address,
            owner as owner_name,
            area_sqft / 43560.0 as acreage,
            zone_code as zoning,
            flood_zone,
            latitude as lat,
            longitude as lng,
            parish
        FROM ebr_parcels
        WHERE latitude BETWEEN $1 AND $2
          AND longitude BETWEEN $3 AND $4
    """
    params: List[Any] = [bbox["minLat"], bbox["maxLat"], bbox["minLng"], bbox["maxLng"]]
    param_idx = 5

    # Apply filters
    if req.filters:
        if req.filters.searchText:
            sql += f" AND (site_address ILIKE ${param_idx} OR owner ILIKE ${param_idx})"
            params.append(f"%{req.filters.searchText}%")
            param_idx += 1

        if req.filters.parish:
            sql += f" AND parish = ${param_idx}"
            params.append(req.filters.parish)
            param_idx += 1

        if req.filters.minAcres:
            sql += f" AND area_sqft >= ${param_idx}"
            params.append(req.filters.minAcres * 43560)
            param_idx += 1

        if req.filters.maxAcres:
            sql += f" AND area_sqft <= ${param_idx}"
            params.append(req.filters.maxAcres * 43560)
            param_idx += 1

    sql += f" LIMIT ${param_idx}"
    params.append(req.limit)

    # Execute query
    if db_pool is None:
        raise HTTPException(status_code=503, detail="Database not initialized")
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)

    # Format results
    data = [dict(row) for row in rows]

    # Cache and return
    cache_set(ckey, data)
    latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
    log_request("/tool/parcel.bbox", "POST", 200, latency, False, len(data))

    return JSONResponse(
        content={"ok": True, "count": len(data), "cached": False, "data": data},
        headers={"Cache-Control": "public, max-age=60"}
    )

@app.get("/tool/parcel.get")
async def parcel_get(
    id: str,
    api_key: str = Depends(verify_api_key)
):
    """
    Get single parcel by ID.
    Cache: 300s
    """
    start_time = datetime.now(timezone.utc)

    # Check cache
    ckey = cache_key("parcel.get", id=id)
    cached = cache_get(ckey, ttl=300)
    if cached is not None:
        latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        log_request("/tool/parcel.get", "GET", 200, latency, True, 1)
        return JSONResponse(
            content={"ok": True, "data": cached},
            headers={"Cache-Control": "public, max-age=300"}
        )

    # Query database
    sql = """
        SELECT
            id::text,
            parcel_uid,
            site_address,
            owner as owner_name,
            area_sqft / 43560.0 as acreage,
            assessed_value,
            sale_date,
            sale_price,
            zone_code as zoning,
            flood_zone,
            latitude as lat,
            longitude as lng,
            parish
        FROM ebr_parcels
        WHERE id::text = $1
    """

    if db_pool is None:
        raise HTTPException(status_code=503, detail="Database not initialized")
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(sql, id)

    if not row:
        raise HTTPException(status_code=404, detail="Parcel not found")

    data = dict(row)

    # Cache and return
    cache_set(ckey, data)
    latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
    log_request("/tool/parcel.get", "GET", 200, latency, False, 1)

    return JSONResponse(
        content={"ok": True, "data": data},
        headers={"Cache-Control": "public, max-age=300"}
    )

@app.get("/tool/parcel.geometry")
async def parcel_geometry(
    id: str,
    detail: str = "low",
    api_key: str = Depends(verify_api_key)
):
    """
    Get parcel boundary GeoJSON.
    Detail levels: low (~10 points), medium (~50 points), high (~200 points)
    Cache: 3600s
    """
    start_time = datetime.now(timezone.utc)

    if detail not in ["low", "medium", "high"]:
        raise HTTPException(status_code=400, detail="Detail must be 'low', 'medium', or 'high'")

    # Check cache
    ckey = cache_key("parcel.geometry", id=id, detail=detail)
    cached = cache_get(ckey, ttl=3600)
    if cached is not None:
        latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        log_request("/tool/parcel.geometry", "GET", 200, latency, True, 1)
        return JSONResponse(
            content={"ok": True, "data": cached},
            headers={"Cache-Control": "public, max-age=3600, immutable"}
        )

    # Determine simplification tolerance
    tolerance_map = {
        "low": 0.0001,     # ~10 points
        "medium": 0.00005,  # ~50 points
        "high": 0.00001,    # ~200 points
    }
    tolerance = tolerance_map[detail]

    # Query with PostGIS simplification
    sql = """
        SELECT
            parcel_uid,
            ST_AsGeoJSON(ST_Simplify(geom, $2))::json as geom_simplified
        FROM ebr_parcels
        WHERE id::text = $1
    """

    if db_pool is None:
        raise HTTPException(status_code=503, detail="Database not initialized")
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(sql, id, tolerance)

    if not row:
        raise HTTPException(status_code=404, detail="Parcel not found")

    data = {
        "parcel_uid": row["parcel_uid"],
        "geom_simplified": row["geom_simplified"]
    }

    # Cache and return
    cache_set(ckey, data)
    latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
    log_request("/tool/parcel.geometry", "GET", 200, latency, False, 1)

    return JSONResponse(
        content={"ok": True, "data": data},
        headers={"Cache-Control": "public, max-age=3600, immutable"}
    )

# ============================================================================
# Screening Endpoints (Authenticated)
# ============================================================================

@app.post("/tool/screening.flood")
async def screening_flood(
    req: FloodScreeningRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Screen parcel for flood risk.
    Cache: 3600s
    """
    start_time = datetime.now(timezone.utc)

    # Check cache
    ckey = cache_key("screening.flood", parcelId=req.parcelId, lat=req.lat, lng=req.lng)
    cached = cache_get(ckey, ttl=3600)
    if cached is not None:
        latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        log_request("/tool/screening.flood", "POST", 200, latency, True, 1)
        return JSONResponse(
            content={"ok": True, "data": cached},
            headers={"Cache-Control": "public, max-age=3600"}
        )

    # Query flood zone data
    # NOTE: This assumes a flood_zones table exists with PostGIS geometry
    # Adjust table/column names as needed for your schema
    sql = """
        SELECT
            flood_zone,
            firm_panel,
            effective_date
        FROM flood_zones
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
        LIMIT 1
    """

    if db_pool is None:
        raise HTTPException(status_code=503, detail="Database not initialized")
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(sql, req.lng, req.lat)

    if row:
        flood_zone = row["flood_zone"]
        firm_panel = row["firm_panel"]
        effective_date = row["effective_date"].isoformat() if row["effective_date"] else None
    else:
        # Default to minimal risk if no data found
        flood_zone = "X"
        firm_panel = None
        effective_date = None

    # Map flood zone to risk level
    risk_map = {
        "A": "high",
        "AE": "high",
        "AH": "high",
        "AO": "high",
        "V": "high",
        "VE": "high",
        "X": "low",
        "B": "moderate",
        "C": "low",
    }
    flood_risk = risk_map.get(flood_zone, "unknown")

    data = {
        "parcelId": req.parcelId,
        "floodZone": flood_zone,
        "floodRisk": flood_risk,
        "firmPanel": firm_panel,
        "effectiveDate": effective_date,
    }

    # Cache and return
    cache_set(ckey, data)
    latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
    log_request("/tool/screening.flood", "POST", 200, latency, False, 1)

    return JSONResponse(
        content={"ok": True, "data": data},
        headers={"Cache-Control": "public, max-age=3600"}
    )

# ============================================================================
# Qdrant Endpoints (Authenticated)
# ============================================================================

@app.post("/tool/docs.search")
async def docs_search(
    req: DocsSearchRequest,
    _api_key: str = Depends(verify_api_key)
):
    """
    Search project documentation using Qdrant vector search.
    Max results: 20
    Cache: 300s
    """
    start_time = datetime.now(timezone.utc)

    # Check cache
    ckey = cache_key("docs.search", query=req.query, limit=req.limit, filter=req.filter)
    cached = cache_get(ckey, ttl=300)
    if cached is not None:
        latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        log_request("/tool/docs.search", "POST", 200, latency, True, len(cached))
        return JSONResponse(
            content={"ok": True, "count": len(cached), "data": cached},
            headers={"Cache-Control": "public, max-age=300"}
        )

    # TODO: Implement actual Qdrant search
    # For now, return stub data
    # In production, you would:
    # 1. Embed req.query using an embedding model
    # 2. Call qdrant_client.search() with the embedding
    # 3. Apply req.filter if provided
    # 4. Return top req.limit results

    data = []

    # Cache and return
    cache_set(ckey, data)
    latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
    log_request("/tool/docs.search", "POST", 200, latency, False, len(data))

    return JSONResponse(
        content={"ok": True, "count": len(data), "data": data},
        headers={"Cache-Control": "public, max-age=300"}
    )

@app.get("/tool/docs.fetch")
async def docs_fetch(
    id: str,
    _api_key: str = Depends(verify_api_key)
):
    """
    Fetch full document by ID from Qdrant.
    Cache: 3600s
    """
    start_time = datetime.now(timezone.utc)

    # Check cache
    ckey = cache_key("docs.fetch", id=id)
    cached = cache_get(ckey, ttl=3600)
    if cached is not None:
        latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        log_request("/tool/docs.fetch", "GET", 200, latency, True, 1)
        return JSONResponse(
            content={"ok": True, "data": cached},
            headers={"Cache-Control": "public, max-age=3600"}
        )

    # TODO: Implement actual Qdrant fetch
    # For now, return 404
    raise HTTPException(status_code=404, detail="Document not found")

@app.post("/tool/memory.write")
async def memory_write(
    req: MemoryWriteRequest,
    _api_key: str = Depends(verify_api_key)
):
    """
    Store conversation memory in Qdrant.
    Max payload: 10KB
    No cache
    """
    start_time = datetime.now(timezone.utc)

    # Validate payload size
    payload_size = len(req.content.encode('utf-8'))
    if payload_size > 10240:  # 10KB
        raise HTTPException(
            status_code=413,
            detail=f"Payload too large: {payload_size} bytes (max 10KB)"
        )

    # TODO: Implement actual Qdrant write
    # For now, return stub success
    # In production, you would:
    # 1. Embed req.content using an embedding model
    # 2. Create a PointStruct with the embedding + metadata
    # 3. Call qdrant_client.upsert() to store

    memory_id = f"memory-{datetime.now(timezone.utc).timestamp()}"

    latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
    log_request("/tool/memory.write", "POST", 200, latency, False, 1)

    return JSONResponse(
        content={"ok": True, "id": memory_id, "indexed": True},
        headers={"Cache-Control": "no-cache"}
    )

# ============================================================================
# Logging Helper
# ============================================================================

def log_request(endpoint: str, method: str, status: int, latency_ms: float, cache_hit: bool, result_count: int = 0):
    """Log request with structured fields."""
    extra = {
        "endpoint": endpoint,
        "method": method,
        "status": status,
        "latency_ms": round(latency_ms, 2),
        "cache_hit": cache_hit,
        "result_count": result_count,
    }
    logger.info(f"{method} {endpoint} → {status}", extra=extra)

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081, log_level="info")
