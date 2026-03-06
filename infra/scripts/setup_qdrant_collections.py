"""
One-time Qdrant collection bootstrap for AgentOS v2.

Creates six collections with dense + sparse vectors and payload indexes:
  1. episodic_memory  — agent episode retrieval
  2. skill_triggers   — procedural skill matching
  3. domain_docs      — domain document retrieval
  4. tool_specs       — tool specification search
  5. institutional_knowledge — org-scoped semantic knowledge retrieval
  6. property_intelligence   — parcel similarity and property finding recall

Dense vector:  1536 dimensions (text-embedding-3-large with dimensions=1536)
Sparse vector: hashed lexical vector for BM25-style hybrid retrieval fusion
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field

from qdrant_client import QdrantClient
from qdrant_client.http import models


@dataclass
class CollectionSpec:
    name: str
    keyword_indexes: list[str] = field(default_factory=list)
    float_indexes: list[str] = field(default_factory=list)
    integer_indexes: list[str] = field(default_factory=list)


COLLECTIONS: list[CollectionSpec] = [
    CollectionSpec(
        name="episodic_memory",
        keyword_indexes=["agentId", "outcome", "taskType", "orgId"],
        integer_indexes=["createdAt"],
    ),
    CollectionSpec(
        name="skill_triggers",
        keyword_indexes=["orgId"],
        float_indexes=["successRate", "evaluatorAvgScore"],
    ),
    CollectionSpec(
        name="domain_docs",
        keyword_indexes=["sourceType", "tags", "orgId"],
    ),
    CollectionSpec(
        name="tool_specs",
        keyword_indexes=["riskLevel", "orgId"],
    ),
    CollectionSpec(
        name="institutional_knowledge",
        keyword_indexes=[
            "orgId",
            "contentType",
            "sourceType",
            "agentName",
            "sourceId",
            "tags",
        ],
    ),
    CollectionSpec(
        name="property_intelligence",
        keyword_indexes=[
            "orgId",
            "sourceType",
            "findingType",
            "stateCode",
            "county",
            "parish",
            "city",
            "zipCode",
        ],
    ),
]

DENSE_DIM = 1536
DENSE_DISTANCE = models.Distance.COSINE


def build_client() -> QdrantClient:
    url = os.getenv("QDRANT_URL", "http://localhost:6333").strip()
    api_key = os.getenv("QDRANT_API_KEY", "").strip() or None
    return QdrantClient(url=url, api_key=api_key, timeout=30)


def collection_exists(client: QdrantClient, name: str) -> bool:
    collections = client.get_collections().collections
    return any(entry.name == name for entry in collections)


def create_collection(client: QdrantClient, spec: CollectionSpec) -> None:
    client.create_collection(
        collection_name=spec.name,
        vectors_config={
            "dense": models.VectorParams(
                size=DENSE_DIM,
                distance=DENSE_DISTANCE,
            ),
        },
        sparse_vectors_config={
            "bm25": models.SparseVectorParams(
                index=models.SparseIndexParams(on_disk=False),
            ),
        },
    )

    for field_name in spec.keyword_indexes:
        client.create_payload_index(
            collection_name=spec.name,
            field_name=field_name,
            field_schema=models.PayloadSchemaType.KEYWORD,
        )

    for field_name in spec.float_indexes:
        client.create_payload_index(
            collection_name=spec.name,
            field_name=field_name,
            field_schema=models.PayloadSchemaType.FLOAT,
        )

    for field_name in spec.integer_indexes:
        client.create_payload_index(
            collection_name=spec.name,
            field_name=field_name,
            field_schema=models.PayloadSchemaType.INTEGER,
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Setup Qdrant AgentOS v2 collections"
    )
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Delete and recreate collections that already exist",
    )
    parser.add_argument(
        "--collections",
        nargs="*",
        default=None,
        help="Only create specific collections (space-separated names)",
    )
    args = parser.parse_args()

    target_names = set(args.collections) if args.collections else None
    client = build_client()

    for spec in COLLECTIONS:
        if target_names and spec.name not in target_names:
            continue

        if collection_exists(client, spec.name):
            if not args.recreate:
                print(f"[qdrant-setup] Collection '{spec.name}' exists — skipping.")
                continue
            client.delete_collection(spec.name)
            print(f"[qdrant-setup] Deleted existing collection '{spec.name}'.")

        create_collection(client, spec)
        kw_count = len(spec.keyword_indexes)
        fl_count = len(spec.float_indexes)
        int_count = len(spec.integer_indexes)
        idx_total = kw_count + fl_count + int_count
        print(
            f"[qdrant-setup] Created '{spec.name}' "
            f"(dense={DENSE_DIM}d + bm25 sparse, {idx_total} payload indexes)."
        )

    print("[qdrant-setup] Done.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"[qdrant-setup] Failed: {exc}", file=sys.stderr)
        raise
