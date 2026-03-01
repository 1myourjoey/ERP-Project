from __future__ import annotations

import re
from io import BytesIO
from typing import Any

from services.vector_db import VectorDBService


class DocumentIngestionService:
    """Extract text, apply legal-aware chunking, and index into ChromaDB."""

    def __init__(self):
        self.vector_db = VectorDBService()

    def ingest(
        self,
        file_bytes: bytes,
        filename: str,
        collection_name: str,
        document_id: int,
        metadata: dict[str, Any] | None = None,
    ) -> int:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext == "pdf":
            text = self._extract_pdf(file_bytes)
        elif ext == "docx":
            text = self._extract_docx(file_bytes)
        else:
            raise ValueError(f"Unsupported format: {ext or 'unknown'}")

        normalized_text = self._normalize_text(text)
        if not normalized_text:
            raise ValueError("No extractable text found in uploaded file.")

        base_metadata = dict(metadata or {})
        base_metadata.setdefault("scope", "global")
        base_metadata.setdefault("fund_id", "")
        base_metadata.setdefault("fund_type_filter", "")

        chunks = self._legal_chunking(
            text=normalized_text,
            document_id=document_id,
            metadata=base_metadata,
        )
        if not chunks:
            raise ValueError("No indexable text chunks were generated.")

        self.vector_db.add_chunks(collection_name, chunks)
        return len(chunks)

    @staticmethod
    def _extract_pdf(file_bytes: bytes) -> str:
        try:
            import pdfplumber
        except Exception as exc:
            raise RuntimeError("pdfplumber is required for PDF ingestion.") from exc
        with pdfplumber.open(BytesIO(file_bytes)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        return "\n\n".join(pages)

    @staticmethod
    def _extract_docx(file_bytes: bytes) -> str:
        try:
            from docx import Document
        except Exception as exc:
            raise RuntimeError("python-docx is required for DOCX ingestion.") from exc
        doc = Document(BytesIO(file_bytes))
        parts: list[str] = []

        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                parts.append(paragraph.text.strip())

        for table in doc.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if cells:
                    parts.append(" | ".join(cells))

        return "\n".join(parts)

    @staticmethod
    def _normalize_text(text: str) -> str:
        lines = [line.rstrip() for line in text.splitlines()]
        compact = "\n".join(lines)
        compact = re.sub(r"\n{3,}", "\n\n", compact)
        return compact.strip()

    def _legal_chunking(
        self,
        text: str,
        document_id: int,
        metadata: dict[str, Any],
    ) -> list[dict[str, Any]]:
        article_pattern = re.compile(r"(?m)^\s*제\s*\d+\s*조(?:\s*의\s*\d+)?")
        if article_pattern.search(text):
            article_chunks = self._chunk_by_articles(text, document_id, metadata)
            if article_chunks:
                return article_chunks
        return self._chunk_by_sliding_window(
            text=text,
            doc_id=document_id,
            metadata=metadata,
            chunk_size=1000,
            overlap=200,
        )

    def _chunk_by_articles(
        self,
        text: str,
        doc_id: int,
        metadata: dict[str, Any],
    ) -> list[dict[str, Any]]:
        heading_pattern = re.compile(
            r"(?m)^\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?(?:\s*[（(][^）)]*[）)])?)\s*"
        )
        matches = list(heading_pattern.finditer(text))
        if not matches:
            return []

        chunks: list[dict[str, Any]] = []
        for index, match in enumerate(matches):
            start = match.start()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            block = text[start:end].strip()
            if len(block) < 100:
                continue

            article = match.group(1).strip()

            # Sub-chunk long articles to keep within optimal embedding size
            if len(block) > 2000:
                sub_chunks = self._chunk_by_sliding_window(
                    text=block,
                    doc_id=doc_id,
                    metadata={**metadata, "article": article},
                    chunk_size=1000,
                    overlap=200,
                )
                for sc_idx, sc in enumerate(sub_chunks):
                    sc["id"] = f"doc{doc_id}_art_{len(chunks)}"
                    sc["metadata"]["chunk_index"] = len(chunks)
                    sc["metadata"]["article"] = article
                    sc["metadata"]["sub_chunk"] = sc_idx
                    chunks.append(sc)
            else:
                chunks.append(
                    {
                        "id": f"doc{doc_id}_art_{len(chunks)}",
                        "text": block,
                        "metadata": {
                            **metadata,
                            "document_id": doc_id,
                            "article": article,
                            "chunk_index": len(chunks),
                        },
                    }
                )
        return chunks

    @staticmethod
    def _find_sentence_boundary(text: str, pos: int, search_range: int = 100) -> int:
        """Find the nearest sentence boundary (period, newline) near *pos*."""
        if pos >= len(text):
            return len(text)
        # Search backward from pos within search_range
        search_start = max(0, pos - search_range)
        segment = text[search_start:pos]
        for delim in (". ", ".\n", "\n\n", "\n"):
            idx = segment.rfind(delim)
            if idx != -1:
                return search_start + idx + len(delim)
        return pos

    def _chunk_by_sliding_window(
        self,
        text: str,
        doc_id: int,
        metadata: dict[str, Any],
        chunk_size: int,
        overlap: int,
    ) -> list[dict[str, Any]]:
        if chunk_size <= overlap:
            raise ValueError("chunk_size must be greater than overlap")

        chunks: list[dict[str, Any]] = []
        start = 0
        step = chunk_size - overlap
        while start < len(text):
            raw_end = min(start + chunk_size, len(text))
            # Snap to sentence boundary unless we are at the end
            end = self._find_sentence_boundary(text, raw_end) if raw_end < len(text) else raw_end
            chunk_text = text[start:end].strip()
            if len(chunk_text) > 100:
                chunks.append(
                    {
                        "id": f"doc{doc_id}_sw_{len(chunks)}",
                        "text": chunk_text,
                        "metadata": {
                            **metadata,
                            "document_id": doc_id,
                            "chunk_index": len(chunks),
                        },
                    }
                )
            start += step
        return chunks
