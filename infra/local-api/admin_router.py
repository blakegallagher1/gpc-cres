"""
Admin API router for programmatic server management.

Provides container management, deploy, DB schema/query, and health
endpoints — all secured by a separate ADMIN_API_KEY bearer token.

Requires: docker>=7.0.0, python-multipart>=0.0.9
Docker socket must be mounted into the container.
"""

import os
import re
import time
import traceback
from typing import Any

import asyncpg
import docker
from docker.errors import NotFound as ContainerNotFound, DockerException
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "").strip()
_bearer_scheme = HTTPBearer()

MAX_ADMIN_SQL_LENGTH = 4_000
MAX_ADMIN_SQL_PARAMS = 25
MAX_ADMIN_SQL_ROWS = 500
ADMIN_SQL_TIMEOUT_SECONDS = 10
ADMIN_SQL_ALLOWED_TABLES = frozenset(
    table.strip().lower()
    for table in os.getenv(
        "ADMIN_SQL_ALLOWED_TABLES",
        "deploys,health_checks,parcels,screening,sync_status",
    ).split(",")
    if table.strip()
)
ADMIN_SQL_MUTATION_RE = re.compile(
    r"\b(alter|analyze|call|copy|create|delete|drop|execute|grant|insert|listen|lock|merge|notify|refresh|reset|revoke|set|truncate|unlisten|update|vacuum)\b",
    re.IGNORECASE,
)
ADMIN_SQL_TABLE_RE = re.compile(
    r'\b(?:from|join)\s+(?:only\s+)?(?:(?:"?([A-Za-z_][\w]*)"?\.)?)"?([A-Za-z_][\w]*)"?',
    re.IGNORECASE,
)


async def require_admin(
    creds: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> str:
    if not ADMIN_API_KEY:
        raise HTTPException(status_code=503, detail="ADMIN_API_KEY not configured")
    if creds.credentials != ADMIN_API_KEY:
        raise HTTPException(status_code=403)
    return creds.credentials


# ---------------------------------------------------------------------------
# Docker client (lazy singleton)
# ---------------------------------------------------------------------------

_docker_client: docker.DockerClient | None = None


def _docker() -> docker.DockerClient:
    global _docker_client
    if _docker_client is None:
        _docker_client = docker.from_env()
    return _docker_client


# ---------------------------------------------------------------------------
# DB pool accessor — set by main.py at startup
# ---------------------------------------------------------------------------

_db_pool: asyncpg.Pool | None = None


def set_db_pool(pool: asyncpg.Pool | None) -> None:
    global _db_pool
    _db_pool = pool


async def _get_conn():
    if not _db_pool:
        raise HTTPException(status_code=503, detail="Database not available")
    async with _db_pool.acquire() as conn:
        yield conn


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(tags=["admin"], dependencies=[Depends(require_admin)])


# ---- Health ---------------------------------------------------------------

@router.get("/health")
async def admin_health():
    # Containers
    try:
        containers = []
        for c in _docker().containers.list(all=True):
            containers.append({
                "name": c.name,
                "status": c.status,
                "started": (c.attrs.get("State", {}).get("StartedAt") or ""),
            })
    except DockerException as exc:
        containers = [{"error": str(exc)}]

    # DB ping
    db_ok = False
    db_latency_ms: float | None = None
    if _db_pool:
        try:
            t0 = time.monotonic()
            async with _db_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            db_latency_ms = round((time.monotonic() - t0) * 1000, 1)
            db_ok = True
        except Exception:
            pass

    # Ignore stopped legacy containers (e.g. local-postgis after DB consolidation)
    IGNORED_CONTAINERS = {"local-postgis"}
    overall = db_ok and all(
        c.get("status") == "running"
        for c in containers
        if "error" not in c and c.get("name") not in IGNORED_CONTAINERS
    )
    return {
        "ok": overall,
        "containers": containers,
        "db": {"ok": db_ok, "latency_ms": db_latency_ms},
    }


# ---- Containers -----------------------------------------------------------

def _find_container(name: str):
    try:
        return _docker().containers.get(name)
    except ContainerNotFound:
        raise HTTPException(status_code=404, detail=f"Container '{name}' not found")
    except DockerException as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/containers")
async def list_containers():
    try:
        return [
            {
                "name": c.name,
                "status": c.status,
                "image": str(c.image.tags[0]) if c.image.tags else str(c.image.id[:12]),
                "started": c.attrs.get("State", {}).get("StartedAt", ""),
            }
            for c in _docker().containers.list(all=True)
        ]
    except DockerException as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/containers/{name}/restart")
async def restart_container(name: str):
    c = _find_container(name)
    try:
        c.restart(timeout=30)
        return {"ok": True, "container": name}
    except DockerException as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/containers/{name}/stop")
async def stop_container(name: str):
    c = _find_container(name)
    try:
        c.stop(timeout=30)
        return {"ok": True, "container": name}
    except DockerException as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/containers/{name}/start")
async def start_container(name: str):
    c = _find_container(name)
    try:
        c.start()
        return {"ok": True, "container": name}
    except DockerException as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/containers/{name}/logs")
async def container_logs(name: str, lines: int = Query(default=50, ge=1, le=5000)):
    c = _find_container(name)
    try:
        logs = c.logs(tail=lines, timestamps=True).decode("utf-8", errors="replace")
        return {"logs": logs}
    except DockerException as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Deploy ---------------------------------------------------------------

@router.post("/deploy/gateway")
async def deploy_gateway(file: UploadFile = File(...)):
    try:
        content = await file.read()
        target = os.path.join(os.path.dirname(__file__), "main.py")
        with open(target, "wb") as f:
            f.write(content)
        # Restart self
        c = _find_container("fastapi-gateway")
        c.restart(timeout=30)
        return {"ok": True, "deployed": "infra/local-api/main.py", "bytes": len(content)}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[admin/deploy/gateway] Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/deploy/reload")
async def deploy_reload():
    try:
        c = _find_container("fastapi-gateway")
        c.restart(timeout=30)
        return {"ok": True, "container": "fastapi-gateway"}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[admin/deploy/reload] Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Database: Schema -----------------------------------------------------

@router.get("/db/schema")
async def db_schema(conn=Depends(_get_conn)):
    try:
        rows = await conn.fetch("""
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        """)
        tables: dict[str, list[dict[str, str]]] = {}
        for r in rows:
            tables.setdefault(r["table_name"], []).append({
                "column": r["column_name"],
                "type": r["data_type"],
            })
        return {"tables": tables}
    except Exception:
        print(f"[admin/db/schema] Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="DB error")


# ---- Database: Tables List ------------------------------------------------

@router.get("/db/tables")
async def db_tables(conn=Depends(_get_conn)):
    try:
        rows = await conn.fetch("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)
        return {"tables": [r["table_name"] for r in rows]}
    except Exception:
        print(f"[admin/db/tables] Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="DB error")


# ---- Database: Read-Only Query --------------------------------------------


def _validate_admin_sql(sql: str, params: Any) -> list[Any]:
    if len(sql) > MAX_ADMIN_SQL_LENGTH:
        raise HTTPException(status_code=400, detail="Query is too long")
    if ";" in sql or "--" in sql or "/*" in sql:
        raise HTTPException(status_code=400, detail="Query comments and statement separators are not permitted")
    if not sql.upper().startswith("SELECT"):
        raise HTTPException(status_code=400, detail="Only SELECT queries are permitted")
    if ADMIN_SQL_MUTATION_RE.search(sql):
        raise HTTPException(status_code=400, detail="Query contains a blocked SQL keyword")
    if not isinstance(params, list):
        raise HTTPException(status_code=400, detail="'params' must be an array")
    if len(params) > MAX_ADMIN_SQL_PARAMS:
        raise HTTPException(status_code=400, detail="Too many query parameters")

    referenced_sources = ADMIN_SQL_TABLE_RE.findall(sql)
    blocked_schemas = sorted(
        {schema for schema, _table in referenced_sources if schema and schema.lower() != "public"}
    )
    if blocked_schemas:
        raise HTTPException(
            status_code=400,
            detail=f"Schema is not allowed for admin SQL: {', '.join(blocked_schemas)}",
        )
    referenced_tables = {table.lower() for _schema, table in referenced_sources}
    if referenced_tables and "*" not in ADMIN_SQL_ALLOWED_TABLES:
        blocked = sorted(referenced_tables - ADMIN_SQL_ALLOWED_TABLES)
        if blocked:
            raise HTTPException(
                status_code=400,
                detail=f"Table is not allowed for admin SQL: {', '.join(blocked)}",
            )

    return params


def _admin_sql_limit(value: Any) -> int:
    if isinstance(value, int):
        return min(max(value, 1), MAX_ADMIN_SQL_ROWS)
    return MAX_ADMIN_SQL_ROWS

@router.post("/db/query")
async def db_query(body: dict[str, Any], conn=Depends(_get_conn)):
    sql = (body.get("sql") or "").strip()
    params = body.get("params") or []
    limit = _admin_sql_limit(body.get("limit"))

    if not sql:
        raise HTTPException(status_code=400, detail="Missing 'sql' field")

    params = _validate_admin_sql(sql, params)

    print(f"[admin/db/query] {sql}")

    try:
        limited_sql = f"SELECT * FROM ({sql}) AS admin_query LIMIT {limit}"
        async with conn.transaction(readonly=True):
            await conn.execute(
                f"SET LOCAL statement_timeout = {ADMIN_SQL_TIMEOUT_SECONDS * 1000}"
            )
            rows = await conn.fetch(
                limited_sql,
                *params,
                timeout=ADMIN_SQL_TIMEOUT_SECONDS,
            )
        result = [dict(r) for r in rows]
        # Convert non-serializable types
        for row in result:
            for k, v in row.items():
                if hasattr(v, "isoformat"):
                    row[k] = v.isoformat()
                elif isinstance(v, (bytes, bytearray, memoryview)):
                    row[k] = "<binary>"
                elif not isinstance(v, (str, int, float, bool, type(None), list, dict)):
                    row[k] = str(v)
        return {"rows": result, "count": len(result)}
    except asyncpg.PostgresError as exc:
        print(f"[admin/db/query] DB error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="DB error")
    except Exception:
        print(f"[admin/db/query] Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="DB error")


# ---- Environment ----------------------------------------------------------

SAFE_ENV_KEYS = {
    "ENVIRONMENT", "LOG_LEVEL", "GATEWAY_HOST", "GATEWAY_PORT",
    "MARTIN_URL", "QDRANT_URL", "DATABASE_URL_PUBLIC",
}


@router.get("/env")
async def admin_env():
    return {
        "env": {k: os.getenv(k, "") for k in SAFE_ENV_KEYS if os.getenv(k)},
    }
