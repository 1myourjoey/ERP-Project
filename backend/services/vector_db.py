from __future__ import annotations

import os
from pathlib import Path
from typing import Any


class VectorDBService:
    """ChromaDB manager for legal document indexing and retrieval."""

    COLLECTIONS: dict[str, str] = {
        "laws": "법률 (자본시장법, 벤처투자법 등)",
        "regulations": "시행령/시행규칙",
        "guidelines": "금감원 가이드라인, 모범규준",
        "agreements": "조합 규약, 수탁계약",
        "internal": "내부 지침, 운용 매뉴얼",
    }

    def __init__(self, persist_directory: str | None = None):
        try:
            import chromadb
            from chromadb.config import Settings
            from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
        except Exception as exc:
            raise RuntimeError(f"ChromaDB is unavailable: {exc}") from exc

        base_dir = (
            Path(persist_directory)
            if persist_directory
            else Path(__file__).resolve().parents[1] / "chroma_data"
        )
        base_dir.mkdir(parents=True, exist_ok=True)

        self._openai_embedding_cls = OpenAIEmbeddingFunction
        self._embedding_function = self._build_embedding_function()
        self.client = chromadb.PersistentClient(
            path=str(base_dir),
            settings=Settings(anonymized_telemetry=False),
        )
        self._init_collections()

    def _build_embedding_function(self) -> Any | None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            return None
        model_name = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-large")
        return self._openai_embedding_cls(
            api_key=api_key,
            model_name=model_name,
        )

    def _require_embedding(self):
        if self._embedding_function is None:
            raise RuntimeError("OPENAI_API_KEY is required for legal vector indexing/search.")

    def _get_collection(self, name: str):
        if name not in self.COLLECTIONS:
            raise ValueError(f"Unknown collection: {name}")
        return self.client.get_collection(
            name=name,
            embedding_function=self._embedding_function,
        )

    def _init_collections(self):
        for name, desc in self.COLLECTIONS.items():
            self.client.get_or_create_collection(
                name=name,
                metadata={"description": desc},
                embedding_function=self._embedding_function,
            )

    @staticmethod
    def _sanitize_metadata(metadata: dict[str, Any] | None) -> dict[str, str | int | float | bool]:
        if not metadata:
            return {}
        sanitized: dict[str, str | int | float | bool] = {}
        for key, value in metadata.items():
            if value is None:
                continue
            if isinstance(value, (str, int, float, bool)):
                sanitized[str(key)] = value
            else:
                sanitized[str(key)] = str(value)
        return sanitized

    def add_chunks(self, collection_name: str, chunks: list[dict[str, Any]]):
        if not chunks:
            return
        self._require_embedding()
        collection = self._get_collection(collection_name)
        collection.add(
            ids=[str(item["id"]) for item in chunks],
            documents=[str(item["text"]) for item in chunks],
            metadatas=[self._sanitize_metadata(item.get("metadata")) for item in chunks],
        )

    def search(self, collection_name: str, query: str, n_results: int = 5) -> list[dict[str, Any]]:
        self._require_embedding()
        collection = self._get_collection(collection_name)
        result = collection.query(query_texts=[query], n_results=n_results)
        return self._parse_query_result(result)

    def search_all_collections(self, query: str, n_results: int = 3) -> list[dict[str, Any]]:
        all_rows: list[dict[str, Any]] = []
        for name in self.COLLECTIONS:
            for row in self.search(name, query, n_results=n_results):
                row["collection"] = name
                all_rows.append(row)

        def _distance_value(row: dict[str, Any]) -> float:
            value = row.get("distance")
            return float(value) if isinstance(value, (int, float)) else 999999.0

        return sorted(all_rows, key=_distance_value)[: n_results * 2]

    @staticmethod
    def _parse_query_result(result: dict[str, Any]) -> list[dict[str, Any]]:
        ids = result.get("ids") or [[]]
        docs = result.get("documents") or [[]]
        metadatas = result.get("metadatas") or [[]]
        distances = result.get("distances") or [[]]

        rows: list[dict[str, Any]] = []
        for idx, chunk_id in enumerate(ids[0]):
            rows.append(
                {
                    "id": chunk_id,
                    "text": docs[0][idx] if idx < len(docs[0]) else "",
                    "metadata": metadatas[0][idx] if idx < len(metadatas[0]) else {},
                    "distance": distances[0][idx] if idx < len(distances[0]) else None,
                }
            )
        return rows

    @staticmethod
    def _metadata_scope(row: dict[str, Any]) -> str:
        metadata = row.get("metadata") or {}
        scope = metadata.get("scope")
        if isinstance(scope, str) and scope.strip():
            return scope.strip()
        return ""

    @staticmethod
    def _metadata_fund_id(row: dict[str, Any]) -> int | None:
        metadata = row.get("metadata") or {}
        value = metadata.get("fund_id")
        if value in (None, ""):
            return None
        try:
            return int(value)
        except Exception:
            return None

    @staticmethod
    def _metadata_fund_type(row: dict[str, Any]) -> str | None:
        metadata = row.get("metadata") or {}
        value = metadata.get("fund_type_filter")
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @staticmethod
    def _metadata_investment_id(row: dict[str, Any]) -> int | None:
        metadata = row.get("metadata") or {}
        value = metadata.get("investment_id")
        if value in (None, ""):
            return None
        try:
            return int(value)
        except Exception:
            return None

    @staticmethod
    def _source_tier_rank(row: dict[str, Any]) -> int:
        metadata = row.get("metadata") or {}
        source_tier = str(metadata.get("source_tier") or "").strip().lower()
        if source_tier == "law":
            return 0
        if source_tier == "fund_bylaw":
            return 1
        if source_tier == "special_guideline":
            return 2
        if source_tier == "investment_contract":
            return 3
        return 99

    def search_with_scope(
        self,
        query: str,
        fund_id: int | None = None,
        fund_type: str | None = None,
        investment_id: int | None = None,
        n_results: int = 10,
    ) -> list[dict[str, Any]]:
        self._require_embedding()
        all_rows: list[dict[str, Any]] = []

        def add_rows(collection_name: str, rows: list[dict[str, Any]]):
            for row in rows:
                row["collection"] = collection_name
                all_rows.append(row)

        # 1) Global scope across all collections
        for name in self.COLLECTIONS:
            collection = self._get_collection(name)
            rows: list[dict[str, Any]] = []
            try:
                rows = self._parse_query_result(
                    collection.query(
                        query_texts=[query],
                        n_results=n_results,
                        where={"scope": "global"},
                    )
                )
            except Exception:
                rows = []

            if not rows:
                # Legacy fallback: scope metadata may be absent.
                try:
                    legacy_rows = self._parse_query_result(
                        collection.query(query_texts=[query], n_results=n_results)
                    )
                except Exception:
                    legacy_rows = []

                filtered_legacy: list[dict[str, Any]] = []
                for row in legacy_rows:
                    scope = self._metadata_scope(row)
                    if scope not in ("", "global"):
                        continue
                    # Avoid cross-fund leakage for sensitive collections when metadata is incomplete.
                    if name in {"agreements", "internal", "guidelines"}:
                        meta_fund_id = self._metadata_fund_id(row)
                        if fund_id is None or meta_fund_id != fund_id:
                            continue
                    filtered_legacy.append(row)
                rows = filtered_legacy

            add_rows(name, rows)

        # 2) Fund-type scope (guidelines only)
        normalized_fund_type = (fund_type or "").strip() or None
        if normalized_fund_type:
            collection = self._get_collection("guidelines")
            rows = []
            try:
                rows = self._parse_query_result(
                    collection.query(
                        query_texts=[query],
                        n_results=n_results,
                        where={
                            "$and": [
                                {"scope": "fund_type"},
                                {"fund_type_filter": normalized_fund_type},
                            ]
                        },
                    )
                )
            except Exception:
                rows = []

            if not rows:
                try:
                    legacy_rows = self._parse_query_result(
                        collection.query(query_texts=[query], n_results=n_results)
                    )
                except Exception:
                    legacy_rows = []
                rows = [
                    row
                    for row in legacy_rows
                    if self._metadata_scope(row) in ("", "fund_type")
                    and self._metadata_fund_type(row) == normalized_fund_type
                ]

            add_rows("guidelines", rows)

        # 3) Fund scope (agreements/internal/guidelines for fund-specific docs)
        if fund_id is not None:
            for name in ("agreements", "internal", "guidelines"):
                collection = self._get_collection(name)
                rows = []
                try:
                    rows = self._parse_query_result(
                        collection.query(
                            query_texts=[query],
                            n_results=n_results,
                            where={
                                "$and": [
                                    {"scope": "fund"},
                                    {"fund_id": int(fund_id)},
                                ]
                            },
                        )
                    )
                except Exception:
                    rows = []

                if not rows:
                    try:
                        legacy_rows = self._parse_query_result(
                            collection.query(query_texts=[query], n_results=n_results)
                        )
                    except Exception:
                        legacy_rows = []
                    rows = [
                        row
                        for row in legacy_rows
                        if self._metadata_scope(row) in ("", "fund")
                        and self._metadata_fund_id(row) == int(fund_id)
                    ]

                add_rows(name, rows)

        # 4) Investment scope (agreements only)
        if investment_id is not None:
            collection = self._get_collection("agreements")
            rows = []
            try:
                rows = self._parse_query_result(
                    collection.query(
                        query_texts=[query],
                        n_results=n_results,
                        where={
                            "$and": [
                                {"scope": "investment"},
                                {"investment_id": int(investment_id)},
                            ]
                        },
                    )
                )
            except Exception:
                rows = []

            if not rows:
                try:
                    legacy_rows = self._parse_query_result(
                        collection.query(query_texts=[query], n_results=n_results)
                    )
                except Exception:
                    legacy_rows = []
                rows = [
                    row
                    for row in legacy_rows
                    if self._metadata_scope(row) == "investment"
                    and self._metadata_investment_id(row) == int(investment_id)
                ]

            add_rows("agreements", rows)

        # Dedupe by (collection, chunk id), keep best distance first.
        def _distance_value(row: dict[str, Any]) -> float:
            value = row.get("distance")
            return float(value) if isinstance(value, (int, float)) else 999999.0

        deduped: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for row in sorted(all_rows, key=lambda item: (self._source_tier_rank(item), _distance_value(item))):
            key = (str(row.get("collection", "")), str(row.get("id", "")))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(row)

        return deduped[: n_results * 2]

    def count_chunks_for_document(self, collection_name: str, document_id: int) -> int:
        if collection_name not in self.COLLECTIONS:
            return 0
        collection = self._get_collection(collection_name)
        result = collection.get(where={"document_id": int(document_id)})
        ids = result.get("ids") or []
        return len(ids)

    def delete_chunks_by_document(self, collection_name: str, document_id: int) -> int:
        if collection_name not in self.COLLECTIONS:
            return 0
        collection = self._get_collection(collection_name)
        result = collection.get(where={"document_id": int(document_id)})
        ids = result.get("ids") or []
        if ids:
            collection.delete(ids=ids)
        return len(ids)

    def get_stats(self) -> dict[str, dict[str, Any]]:
        stats: dict[str, dict[str, Any]] = {}
        for name in self.COLLECTIONS:
            collection = self._get_collection(name)
            stats[name] = {
                "count": collection.count(),
                "description": self.COLLECTIONS[name],
            }
        return stats
