"""
Gallagher Property Company - Tax Strategist Agent Tests
"""

import json
from pathlib import Path

import pytest
from agents.tool_context import ToolContext

from config.settings import settings
from gpc_agents import tax_strategist
from gpc_agents.tax_strategist import LookupIRCReferenceInput, lookup_irc_reference


@pytest.fixture()
def temp_library(tmp_path: Path) -> Path:
    content = """# IRC Calculation Logic Library 2026
Effective Date: January 1, 2026

## Overview
This library summarizes IRC sections relevant to commercial real estate.

# Section 1031 - Like-Kind Exchanges
Like-kind exchanges allow deferral of gain under certain conditions.
Key requirement: replacement property identification within 45 days.

# Section 167 - Depreciation
Depreciation allows recovery of property costs over time.
Use applicable recovery periods for real estate assets.
"""
    path = tmp_path / "irc_library.md"
    path.write_text(content, encoding="utf-8")
    return path


@pytest.fixture()
def set_library_path(temp_library: Path):
    original_path = settings.tax.library_path
    settings.tax.library_path = str(temp_library)
    tax_strategist._load_library.cache_clear()
    yield
    settings.tax.library_path = original_path
    tax_strategist._load_library.cache_clear()


async def invoke_tool(tool, input_data):
    payload = {"input_data": input_data}
    tool_args = json.dumps(payload)
    ctx = ToolContext(
        context=None,
        tool_name=tool.name,
        tool_call_id="test_call",
        tool_arguments=tool_args,
    )
    return await tool.on_invoke_tool(ctx, tool_args)


@pytest.mark.asyncio
async def test_lookup_irc_reference_by_section(set_library_path):
    input_data = LookupIRCReferenceInput(
        query="like-kind exchange", section="1031", max_results=1
    )
    result = await invoke_tool(lookup_irc_reference, input_data.model_dump())
    assert result["results"]
    assert "1031" in result["results"][0]["title"]


@pytest.mark.asyncio
async def test_lookup_irc_reference_keyword_search(set_library_path):
    input_data = LookupIRCReferenceInput(query="depreciation", max_results=1)
    result = await invoke_tool(lookup_irc_reference, input_data.model_dump())
    assert result["results"]
    assert "depreciation" in result["results"][0]["excerpt"].lower()


@pytest.mark.asyncio
async def test_lookup_irc_reference_missing_library(tmp_path: Path):
    original_path = settings.tax.library_path
    missing_path = tmp_path / "missing_library.md"
    settings.tax.library_path = str(missing_path)
    tax_strategist._load_library.cache_clear()

    input_data = LookupIRCReferenceInput(query="1031")
    result = await invoke_tool(lookup_irc_reference, input_data.model_dump())

    settings.tax.library_path = original_path
    tax_strategist._load_library.cache_clear()

    assert "error" in result
    assert str(missing_path) in result["error"]
