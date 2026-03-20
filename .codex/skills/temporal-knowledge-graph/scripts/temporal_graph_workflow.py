#!/usr/bin/env python3
"""
Temporal KG workflow starter adapted for Entitlement OS.

This script mirrors the notebook workflow:
- planner first
- tool definitions for KG-aware retrieval
- function-call loop until final textual response
- temporal-window validation and context enrichment

Targets Entitlement OS tables:
- KGEvent
- TemporalEdge
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

import difflib

try:
    import psycopg
except Exception:
    psycopg = None


PREDICATE_DEFINITIONS = {
    "IS_A": "Denotes a class-or-type relationship between two entities.",
    "HAS_A": "Denotes a part-whole relationship between two entities.",
    "LOCATED_IN": "Specifies geographic or organisational containment/proximity.",
    "HOLDS_ROLE": "Person to position/title relationship.",
    "PRODUCES": "Indicates manufacturing, building, or creation of a product/service/infrastructure.",
    "SELLS": "Marks seller-to-customer commercial relationships.",
    "LAUNCHED": "Captures official launch or start of initiative.",
    "DEVELOPED": "Indicates R&D, innovation origin, or product development.",
    "ADOPTED_BY": "Indicates deployment/implementation by another entity.",
    "INVESTS_IN": "Represents capital/resource flows or ownership investment.",
    "COLLABORATES_WITH": "Captures partnerships and joint venture relationships.",
    "SUPPLIES": "Captures vendor or supplier dependencies.",
    "HAS_REVENUE": "Associates a revenue amount or metric.",
    "INCREASED": "Expresses an upward change in a metric.",
    "DECREASED": "Expresses a downward change in a metric.",
    "RESULTED_IN": "Captures causal relationships.",
    "TARGETS": "Marks strategic objectives or market/customer segments.",
    "PART_OF": "Expresses hierarchical membership or subset relations.",
    "DISCONTINUED": "Marks end-of-life, shutdown, or termination.",
    "SECURED": "Marks acquisition of contracts, assets, rights, or funds.",
}

KNOWN_PREDICATES = {
    "is_a": "IS_A",
    "was": "IS_A",
    "has_a": "HAS_A",
    "located_in": "LOCATED_IN",
    "located": "LOCATED_IN",
    "holds_role": "HOLDS_ROLE",
    "produces": "PRODUCES",
    "sells": "SELLS",
    "launched": "LAUNCHED",
    "developed": "DEVELOPED",
    "adopted_by": "ADOPTED_BY",
    "invests_in": "INVESTS_IN",
    "collaborates_with": "COLLABORATES_WITH",
    "supplies": "SUPPLIES",
    "has_revenue": "HAS_REVENUE",
    "increased": "INCREASED",
    "decreased": "DECREASED",
    "resulted_in": "RESULTED_IN",
    "targets": "TARGETS",
    "part_of": "PART_OF",
    "discontinued": "DISCONTINUED",
    "secured": "SECURED",
    "locatednear": "LOCATED_IN",
    "locatedat": "LOCATED_IN",
}


@dataclass
class KGEvent:
    event_id: str
    subject_id: str
    predicate: str
    object_id: str
    confidence: float
    source_hash: str
    timestamp: datetime
    object_links: list[str] = field(default_factory=list)

    def to_text(self) -> str:
        return (
            f"{self.subject_id} – {self.predicate} – {self.object_id}"
            f"  [timestamp: {self.timestamp.isoformat()}]"
            f"  (confidence: {self.confidence:.2f})"
            f"  source={self.source_hash}"
        )


class TemporalKGStore:
    """Read-only access to Entitlement OS KG data."""

    def __init__(self, fallback_path: Path) -> None:
        self.fallback_path = fallback_path
        self._fallback_loaded = False
        self._fallback_cache: list[KGEvent] = []

    def _parse_datetime(self, raw: str | datetime | None) -> datetime | None:
        if raw is None:
            return None
        if isinstance(raw, datetime):
            return raw

        normalized = str(raw).strip().replace("Z", "+00:00")
        if not normalized:
            return None

        formats = (
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d",
            "%Y/%m/%d",
        )
        for fmt in formats:
            try:
                if fmt == "%Y-%m-%dT%H:%M:%S%z":
                    parsed = datetime.fromisoformat(normalized)
                else:
                    parsed = datetime.strptime(normalized, fmt)
                return parsed.replace(tzinfo=None)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None

    def _load_fallback(self) -> list[KGEvent]:
        if self._fallback_loaded:
            return self._fallback_cache

        self._fallback_loaded = True
        events: list[KGEvent] = []

        if not self.fallback_path.exists():
            self._fallback_cache = events
            return events

        for raw_line in self.fallback_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
                ts = self._parse_datetime(raw.get("timestamp"))
                events.append(
                    KGEvent(
                        event_id=str(raw.get("id", "fallback")),
                        subject_id=str(raw["subject_id"]),
                        predicate=str(raw["predicate"]),
                        object_id=str(raw["object_id"]),
                        confidence=float(raw.get("confidence", 0.5)),
                        source_hash=str(raw.get("source_hash", "fallback")),
                        timestamp=ts or datetime.fromtimestamp(0),
                    )
                )
            except Exception:
                continue

        self._fallback_cache = events
        return events

    async def find_events(
        self,
        entity: str,
        predicate: str,
        start: datetime,
        end: datetime,
        limit: int,
    ) -> list[KGEvent]:
        if not entity:
            return []

        db_url = os.getenv("DATABASE_URL")
        if psycopg and db_url:
            events = await self._query_from_db(db_url, entity, predicate, start, end, limit)
            if events:
                return events

        return self._query_from_fallback(entity, predicate, start, end, limit)

    def _query_from_fallback(
        self,
        entity: str,
        predicate: str,
        start: datetime,
        end: datetime,
        limit: int,
    ) -> list[KGEvent]:
        lowered = entity.lower()
        predicate_upper = predicate.upper()
        events: list[KGEvent] = []

        for event in self._load_fallback():
            if not (start <= event.timestamp <= end):
                continue
            if lowered not in (event.subject_id or "").lower() and lowered not in (event.object_id or "").lower():
                continue
            if predicate_upper not in (event.predicate or "").upper():
                continue
            events.append(event)

        events.sort(key=lambda item: (item.confidence, item.timestamp), reverse=True)
        return events[:limit]

    async def _query_from_db(
        self,
        db_url: str,
        entity: str,
        predicate: str,
        start: datetime,
        end: datetime,
        limit: int,
    ) -> list[KGEvent]:
        entity_token = f"%{entity}%"
        predicate_token = f"%{predicate}%"

        def _query() -> list[KGEvent]:
            query_events = """
                SELECT id, subject_id, predicate, object_id, confidence, source_hash, "timestamp"
                FROM "KGEvent"
                WHERE (subject_id ILIKE %s OR object_id ILIKE %s)
                  AND predicate ILIKE %s
                  AND "timestamp" >= %s
                  AND "timestamp" <= %s
                ORDER BY confidence DESC, "timestamp" DESC
                LIMIT %s
            """
            events: list[KGEvent] = []

            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        query_events,
                        (entity_token, entity_token, predicate_token, start, end, limit),
                    )
                    rows = cursor.fetchall()

                event_ids = [str(row[0]) for row in rows]
                edges_by_event = self._query_edges(db_connection=conn, event_ids=event_ids)

            for row in rows:
                try:
                    events.append(
                        KGEvent(
                            event_id=str(row[0]),
                            subject_id=str(row[1]),
                            predicate=str(row[2]),
                            object_id=str(row[3]),
                            confidence=float(row[4]),
                            source_hash=str(row[5]),
                            timestamp=self._parse_datetime(row[6]) or datetime.fromtimestamp(0),
                            object_links=edges_by_event.get(str(row[0]), []),
                        )
                    )
                except Exception:
                    continue

            return events

        return await asyncio.to_thread(_query)

    def _query_edges(self, db_connection: Any, event_ids: list[str]) -> dict[str, list[str]]:
        if not event_ids:
            return {}

        edges: dict[str, list[str]] = defaultdict(list)
        for event_id in event_ids:
            with db_connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT from_event, to_event, relation
                    FROM "TemporalEdge"
                    WHERE from_event = %s OR to_event = %s
                    """,
                    (event_id, event_id),
                )
                for row in cursor.fetchall():
                    from_event, to_event, relation = row
                    relation = str(relation or "related")
                    from_id = str(from_event)
                    to_id = str(to_event)
                    if from_id == event_id:
                        edges[event_id].append(f"{relation}: {from_id} -> {to_id}")
                    else:
                        edges[event_id].append(f"{relation}: {event_id} <- {from_id}")
        return edges


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--question", required=True, help="Research question to answer.")
    parser.add_argument("--subject", default="", help="Primary subject/entity query anchor.")
    parser.add_argument(
        "--start-date",
        default="2024-01-01T00:00:00",
        help="ISO start date/time (inclusive).",
    )
    parser.add_argument(
        "--end-date",
        default=datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        help="ISO end date/time (inclusive).",
    )
    parser.add_argument(
        "--predicate",
        default="acquired",
        help="Default predicate when factual_qa does not provide one.",
    )
    parser.add_argument("--limit", type=int, default=25, help="Rows per factual_qa call.")
    parser.add_argument(
        "--max-tool-calls",
        type=int,
        default=8,
        help="Maximum tool-call loops before returning partial output.",
    )
    parser.add_argument(
        "--output-dir",
        default=os.getenv(
            "ENTITLEMENT_OS_KG_WORKFLOW_DIR",
            "output/temporal-knowledge-graph",
        ),
        help="Directory for run traces.",
    )
    parser.add_argument(
        "--fallback-data",
        default=os.getenv(
            "ENTITLEMENT_OS_KG_FALLBACK_FILE",
            "output/temporal-knowledge-graph/kgevents.jsonl",
        ),
        help="Optional JSONL fallback data source when DATABASE_URL / psycopg unavailable.",
    )
    return parser.parse_args()


def normalize_date(raw: str) -> datetime:
    normalized = raw.strip().replace("Z", "+00:00")
    if not normalized:
        raise ValueError("Date is required.")

    patterns = ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%Y/%m/%d")
    for fmt in patterns:
        try:
            return datetime.fromisoformat(normalized).replace(tzinfo=None) if fmt == "%Y-%m-%dT%H:%M:%S%z" else datetime.strptime(
                normalized,
                fmt,
            )
        except ValueError:
            continue

    raise ValueError(f"Invalid date format: {raw}")


def normalize_predicate(raw_predicate: str) -> str:
    token = (raw_predicate or "").strip().lower()
    if not token:
        return "RELATED_TO"

    if token in KNOWN_PREDICATES:
        return KNOWN_PREDICATES[token]

    if (upper := token.upper()) in PREDICATE_DEFINITIONS:
        return upper

    matches = difflib.get_close_matches(upper, list(PREDICATE_DEFINITIONS.keys()), n=1, cutoff=0.65)
    return matches[0] if matches else upper


class TemporalGraphRetriever:
    def __init__(self, client: AsyncOpenAI, store: TemporalKGStore, limit: int) -> None:
        self.client = client
        self.store = store
        self.limit = limit
        self.tools = [factual_qa_schema, trend_analysis_schema]
        self.function_map = {
            "factual_qa": self.factual_qa,
            "trend_analysis": self.trend_analysis,
        }

    async def initial_planner(self, user_question: str) -> str:
        prompt = (
            "You are the Entitlement OS knowledge coordinator. "
            "Given a user question, produce a concise research plan for answering it using "
            "time-bounded KG tools.\n\n"
            "Return only the heading 'Research tasks:' and a bullet list, with no fluff.\n\n"
            f"Question: {user_question}"
        )
        response = await self.client.responses.create(
            model="gpt-4.1",
            input=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        return response.output_text if hasattr(response, "output_text") else str(response)

    async def factual_qa(
        self,
        entity: str,
        start_date_range: str,
        end_date_range: str,
        predicate: str,
    ) -> str:
        try:
            start = normalize_date(start_date_range)
            end = normalize_date(end_date_range)
        except ValueError as exc:
            return f"Invalid date format supplied to factual_qa: {exc}"

        if start > end:
            return (
                "You used the `factual_qa` tool incorrectly. "
                "`start_date_range` must be less than or equal to `end_date_range`. "
                f"Provided start={start_date_range}, end={end_date_range}."
            )

        normalized_predicate = normalize_predicate(predicate)
        events = await self.store.find_events(entity, normalized_predicate, start, end, self.limit)

        if not events:
            return (
                f"No KGEvent data found for entity '{entity}', predicate '{normalized_predicate}', "
                f"in the window {start.date()} -> {end.date()}."
            )

        lines = [
            f"Found {len(events)} relationship(s) for entity '{entity}' and predicate '{normalized_predicate}':"
        ]
        for index, event in enumerate(events, start=1):
            lines.append(f"{index}. {event.to_text()}")
            for link in event.object_links:
                lines.append(f"   - context: {link}")

        return "\n".join(lines)

    async def trend_analysis(
        self,
        question: str,
        companies: list[str],
        start_date_range: str,
        end_date_range: str,
        topic_filter: list[str],
    ) -> str:
        try:
            start = normalize_date(start_date_range)
            end = normalize_date(end_date_range)
        except ValueError as exc:
            return f"Invalid date format supplied to trend_analysis: {exc}"

        if start > end:
            return (
                "You used the `trend_analysis` tool incorrectly. "
                "`start_date_range` must be less than or equal to `end_date_range`. "
                f"Provided start={start_date_range}, end={end_date_range}."
            )

        if not companies or not topic_filter:
            return "No companies or predicates provided for trend_analysis."

        async def _fetch(company: str, predicate: str) -> str:
            return await self.factual_qa(
                entity=company,
                start_date_range=start.isoformat(),
                end_date_range=end.isoformat(),
                predicate=predicate,
            )

        tasks = [_fetch(company, predicate) for company in companies for predicate in topic_filter]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        sections: list[str] = []
        pairs = [(company, predicate) for company in companies for predicate in topic_filter]

        for (company, predicate), result in zip(pairs, results, strict=True):
            header = f"=== {company} · {predicate} ==="
            if isinstance(result, Exception):
                sections.append(f"{header}\\n⚠ {type(result).__name__}: {result}")
            else:
                sections.append(f"{header}\\n{result}")

        payload = "\\n\\n".join(sections)
        analysis_prompt = (
            "You are an Entitlement OS analysis assistant. "
            "Summarize only from the supplied KG data. "
            "Do not introduce external assumptions.\\n\\n"
            f"Question: {question}\\n\\n"
            f"Data:\\n{payload}"
        )
        analysis = await self.client.responses.create(
            model="o4-mini",
            input=[{"role": "user", "content": analysis_prompt}],
            reasoning={"effort": "high", "summary": "auto"},
        )
        return analysis.output_text if hasattr(analysis, "output_text") else payload

    async def run(
        self,
        user_question: str,
        subject: str,
        predicate: str,
        start: datetime,
        end: datetime,
        max_tool_calls: int,
    ) -> tuple[str, dict[str, list[Any]]]:
        initial_plan = await self.initial_planner(user_question=user_question)

        retriever_user_prompt = (
            "You are a helpful assistant with access to Entitlement OS KG tools.\\n"
            "Use the tools to answer only from KG data.\\n\\n"
            f"Question: {user_question}\\n\\n"
            f"Subject anchor: {subject or 'unknown'}\\n"
            f"Start date: {start.isoformat()}\\n"
            f"End date: {end.isoformat()}\\n\\n"
            "Research plan from planner:\\n"
            f"{initial_plan}\\n\\n"
            "Follow the plan unless evidence is unavailable."
        )

        input_messages: list[dict[str, Any]] = [{"role": "user", "content": retriever_user_prompt}]
        response = await self.client.responses.create(
            model="gpt-4.1",
            input=input_messages,
            tools=self.tools,
            parallel_tool_calls=False,
        )

        tools_used: dict[str, list[Any]] = {}
        tool_calls = 0

        while getattr(response, "output", None):
            tool_call = response.output[0]
            if getattr(tool_call, "type", None) != "function_call":
                break

            name = getattr(tool_call, "name", "")
            if name not in self.function_map:
                break

            tool_calls += 1
            if tool_calls > max_tool_calls:
                break

            try:
                args = json.loads(getattr(tool_call, "arguments", "{}"))
            except ValueError:
                args = {}

            args.setdefault("start_date_range", start.isoformat())
            args.setdefault("end_date_range", end.isoformat())
            if name == "factual_qa":
                args.setdefault("predicate", predicate)
                args.setdefault("entity", subject)

            tool_response = await self.function_map[name](**args)
            tools_used[name] = [args, tool_response]

            input_messages.append(
                {
                    "type": "function_call",
                    "call_id": getattr(tool_call, "call_id", ""),
                    "name": getattr(tool_call, "name", ""),
                    "arguments": getattr(tool_call, "arguments", "{}"),
                }
            )
            input_messages.append(
                {
                    "type": "function_call_output",
                    "call_id": getattr(tool_call, "call_id", ""),
                    "output": tool_response,
                }
            )

            response = await self.client.responses.create(
                model="gpt-4.1",
                input=input_messages,
                tools=self.tools,
                parallel_tool_calls=False,
            )

        final_output = response.output_text if hasattr(response, "output_text") else str(response)
        return final_output, tools_used


factual_qa_schema = {
    "type": "function",
    "name": "factual_qa",
    "description": "Queries KGEvent for time-bounded facts for an entity/predicate pair.",
    "parameters": {
        "type": "object",
        "properties": {
            "entity": {
                "type": "string",
                "description": "Entity/subject to query (e.g., 'Oakland Mobile Home Park').",
            },
            "start_date_range": {
                "type": "string",
                "format": "date",
                "description": "Start date (inclusive) for temporal filtering.",
            },
            "end_date_range": {
                "type": "string",
                "format": "date",
                "description": "End date (inclusive) for temporal filtering.",
            },
            "predicate": {
                "type": "string",
                "description": "Predicate relation to query (e.g., 'acquired', 'owned', 'located_in').",
            },
        },
        "required": ["entity", "start_date_range", "end_date_range", "predicate"],
        "additionalProperties": False,
    },
}

trend_analysis_schema = {
    "type": "function",
    "name": "trend_analysis",
    "description": "Runs factual_qa across companies and predicates and summarizes trend direction.",
    "parameters": {
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "Question to frame the trend comparison summary.",
            },
            "companies": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Entities/parishes/deals to compare.",
            },
            "start_date_range": {
                "type": "string",
                "format": "date",
                "description": "Start date (inclusive).",
            },
            "end_date_range": {
                "type": "string",
                "format": "date",
                "description": "End date (inclusive).",
            },
            "topic_filter": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Predicate list to query per entity.",
            },
        },
        "required": ["question", "companies", "start_date_range", "end_date_range", "topic_filter"],
        "additionalProperties": False,
    },
}


async def main() -> None:
    args = parse_args()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required.")

    start = normalize_date(args.start_date)
    end = normalize_date(args.end_date)
    if start > end:
        raise ValueError("start-date must be <= end-date.")

    store = TemporalKGStore(fallback_path=Path(args.fallback_data))
    client = AsyncOpenAI(api_key=api_key)
    retriever = TemporalGraphRetriever(client=client, store=store, limit=args.limit)

    answer, tools_used = await retriever.run(
        user_question=args.question,
        subject=args.subject,
        predicate=args.predicate,
        start=start,
        end=end,
        max_tool_calls=args.max_tool_calls,
    )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    run_id = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    output = {
        "question": args.question,
        "subject": args.subject,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "predicate": args.predicate,
        "answer": answer,
        "tools_used": tools_used,
    }
    (output_dir / f"run_{run_id}.json").write_text(
        json.dumps(output, indent=2),
        encoding="utf-8",
    )

    print(answer)


if __name__ == "__main__":
    asyncio.run(main())
