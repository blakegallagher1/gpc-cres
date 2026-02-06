"""
Gallagher Property Company - Tax Strategist Agent
"""

from __future__ import annotations

import re
from functools import lru_cache, partial
from pathlib import Path
from typing import Any, Dict, List, Optional

from agents import Agent, WebSearchTool
from agents import function_tool as base_function_tool
from pydantic import BaseModel

from config.settings import settings
from prompts.agent_prompts import TAX_STRATEGIST_PROMPT
from tools.external_apis import perplexity

function_tool = partial(base_function_tool, strict_mode=False)


class LookupIRCReferenceInput(BaseModel):
    """Input for IRC library lookups"""

    query: str
    section: Optional[str] = None
    max_results: int = 3


class SearchTaxUpdatesInput(BaseModel):
    """Input for tax update searches"""

    query: str
    recency: str = "week"


@lru_cache(maxsize=4)
def _load_library(path: str) -> Dict[str, Any]:
    library_path = Path(path)
    if not library_path.exists():
        raise FileNotFoundError(path)

    text = library_path.read_text(encoding="utf-8")
    lines = text.splitlines()

    effective_date = None
    for line in lines[:80]:
        if "Effective Date" in line:
            effective_date = line.split(":", 1)[-1].strip().strip("* ")
            break

    return {"lines": lines, "effective_date": effective_date}


def _heading_level(line: str) -> int:
    if not line.startswith("#"):
        return 0
    return len(line) - len(line.lstrip("#"))


def _find_section_range(lines: List[str], section: str) -> Optional[Dict[str, int]]:
    section_lower = section.lower()
    start = None
    level = 0
    for idx, line in enumerate(lines):
        if line.startswith("#") and section_lower in line.lower():
            start = idx
            level = _heading_level(line)
            break

    if start is None:
        return None

    end = len(lines)
    for idx in range(start + 1, len(lines)):
        line = lines[idx]
        if line.startswith("#") and _heading_level(line) <= level:
            end = idx
            break

    return {"start": start, "end": end}


def _build_snippet(
    lines: List[str], start: int, end: int, max_lines: int = 40
) -> Dict[str, Any]:
    snippet_end = min(end, start + max_lines)
    excerpt = "\n".join(lines[start:snippet_end]).strip()
    return {
        "line_range": f"{start + 1}-{snippet_end}",
        "excerpt": excerpt,
        "truncated": snippet_end < end,
    }


def _find_heading(lines: List[str], index: int) -> Optional[str]:
    for idx in range(index, -1, -1):
        if lines[idx].startswith("#"):
            return lines[idx].lstrip("#").strip()
    return None


def _search_keywords(
    lines: List[str], query: str, max_results: int
) -> List[Dict[str, Any]]:
    keywords = [kw for kw in re.findall(r"[A-Za-z0-9]+", query.lower()) if len(kw) > 2]
    if not keywords:
        keywords = [query.lower()]

    results: List[Dict[str, Any]] = []
    seen = set()

    for idx, line in enumerate(lines):
        line_lower = line.lower()
        if not any(keyword in line_lower for keyword in keywords):
            continue

        heading = _find_heading(lines, idx)
        snippet_start = max(idx - 2, 0)
        snippet_end = min(idx + 6, len(lines))
        signature = (heading, snippet_start, snippet_end)
        if signature in seen:
            continue
        seen.add(signature)

        snippet = _build_snippet(lines, snippet_start, snippet_end, max_lines=10)
        results.append(
            {
                "title": heading or "Keyword Match",
                "line_range": snippet["line_range"],
                "excerpt": snippet["excerpt"],
                "truncated": snippet["truncated"],
            }
        )

        if len(results) >= max_results:
            break

    return results


@function_tool
async def lookup_irc_reference(input_data: LookupIRCReferenceInput) -> Dict[str, Any]:
    """
    Search the IRC Calculation Logic Library for the requested section or keywords.
    """
    library_path = settings.tax.library_path

    try:
        library = _load_library(library_path)
    except FileNotFoundError:
        return {
            "error": f"IRC library not found at {library_path}",
            "library_path": library_path,
            "confidence": "low",
        }

    lines: List[str] = library["lines"]
    effective_date = library.get("effective_date")
    results: List[Dict[str, Any]] = []

    if input_data.section:
        section_range = _find_section_range(lines, input_data.section)
        if section_range:
            snippet = _build_snippet(lines, section_range["start"], section_range["end"])
            results.append(
                {
                    "title": lines[section_range["start"]].lstrip("#").strip(),
                    "line_range": snippet["line_range"],
                    "excerpt": snippet["excerpt"],
                    "truncated": snippet["truncated"],
                }
            )

    if not results and input_data.query:
        results = _search_keywords(lines, input_data.query, input_data.max_results)

    return {
        "query": input_data.query,
        "section": input_data.section,
        "library_path": library_path,
        "effective_date": effective_date,
        "results": results,
        "sources": [library_path],
        "confidence": "high" if results else "low",
    }


@function_tool
async def search_tax_updates(input_data: SearchTaxUpdatesInput) -> Dict[str, Any]:
    """
    Search for recent IRC/IRS changes and updates with citations.
    """
    query = input_data.query.strip()
    if not query:
        return {"error": "Query is required", "confidence": "low"}

    allowed_recency = {"hour", "day", "week", "month", "year"}
    if input_data.recency not in allowed_recency:
        return {
            "error": f"Invalid recency '{input_data.recency}'. Use one of: "
            f"{', '.join(sorted(allowed_recency))}.",
            "confidence": "low",
        }

    search_query = (
        f"{query}\n"
        "Focus on recent IRS/IRC changes, revenue procedures, notices, and effective dates. "
        "Provide citations and dates."
    )

    try:
        result = await perplexity.search(
            search_query, search_recency_filter=input_data.recency, return_citations=True
        )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        return {
            "error": "Tax update search failed; consider using web_search for fallback.",
            "detail": str(exc),
            "confidence": "low",
        }

    return {
        "query": query,
        "recency": input_data.recency,
        "updates": result["answer"],
        "sources": result.get("citations", []),
        "confidence": "medium",
    }


# Tax Strategist Agent definition
# Note: Handoffs to other agents will be configured after all agents are defined

tax_strategist_agent = Agent(
    name="Tax Strategist",
    model=settings.openai.standard_model,  # gpt-5.1 for tax reference tasks
    instructions=TAX_STRATEGIST_PROMPT,
    tools=[
        lookup_irc_reference,
        search_tax_updates,
        WebSearchTool(),
    ],
    handoffs=[],
)
