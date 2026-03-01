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

    def count_chunks_for_document(self, collection_name: str, document_id: int) -> int:
        if collection_name not in self.COLLECTIONS:
            return 0
        collection = self._get_collection(collection_name)
        result = collection.get(where={"document_id": int(document_id)})
        ids = result.get("ids") or []
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
