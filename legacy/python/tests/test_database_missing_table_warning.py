import logging

import pytest
from postgrest.exceptions import APIError

import tools.database as database_module
from tools.database import DatabaseManager


class _FakeQuery:
    def __init__(self, error: Exception):
        self._error = error

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        raise self._error


class _FakeClient:
    def __init__(self, error: Exception):
        self._error = error

    def table(self, _name: str):
        return _FakeQuery(self._error)


@pytest.mark.asyncio
async def test_list_ingestion_jobs_warns_once_on_missing_table(caplog):
    database_module._MISSING_TABLE_WARNED.clear()
    error = APIError(
        {
            "message": "Could not find the table 'public.ingestion_jobs' in the schema cache",
            "code": "PGRST205",
            "hint": None,
            "details": None,
        }
    )
    db = DatabaseManager()
    db.client = _FakeClient(error)  # type: ignore[assignment]

    caplog.set_level(logging.WARNING, logger=database_module.__name__)

    assert await db.list_ingestion_jobs(["queued"]) == []
    assert await db.list_ingestion_jobs(["queued"]) == []

    missing_table_warnings = [
        record
        for record in caplog.records
        if record.levelno == logging.WARNING and "Supabase table" in record.getMessage()
    ]
    assert len(missing_table_warnings) == 1
    assert "ingestion_jobs" in missing_table_warnings[0].getMessage()
    assert "PGRST205" in missing_table_warnings[0].getMessage()

