from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from models.attachment import Attachment
from models.document_template import DocumentTemplate
from models.fund import Fund, LP
from services.docx_replacement_engine import DocxReplacementEngine
from services.document_numbering import DocumentNumberingService
from services.variable_resolver import VariableResolver

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "generated_templates"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class GeneratedTemplateDocument:
    id: int
    filename: str
    document_number: str
    fund_id: int
    template_id: int
    lp_id: int | None
    investment_id: int | None
    created_at: str | None


class BulkDocumentGenerator:
    """Generates one or many LP-targeted documents from a DOCX template."""

    ENTITY_PREFIX = "generated_template_document"

    def __init__(self) -> None:
        self.engine = DocxReplacementEngine()
        self.resolver = VariableResolver()
        self.numbering = DocumentNumberingService()

    def generate_one(
        self,
        db: Session,
        fund_id: int,
        template_id: int,
        lp_id: int | None = None,
        investment_id: int | None = None,
        extra_vars: dict[str, str] | None = None,
        created_by: int | None = None,
        commit: bool = True,
    ) -> Attachment:
        fund = db.get(Fund, fund_id)
        if not fund:
            raise LookupError("Fund not found")

        template = db.get(DocumentTemplate, template_id)
        if not template:
            raise LookupError("Template not found")

        if lp_id is not None:
            lp = db.get(LP, lp_id)
            if not lp or lp.fund_id != fund_id:
                raise LookupError("LP not found for the selected fund")

        template_bytes = self._load_template_bytes(template)

        variables = self.resolver.resolve_all(
            db=db,
            fund_id=fund_id,
            lp_id=lp_id,
            investment_id=investment_id,
            extra_vars=extra_vars,
        )
        document_type = template.category or template.name or "문서"
        document_number = self.numbering.next_number(db, fund_id=fund_id, document_type=document_type)
        variables.setdefault("문서번호", document_number)
        variables.setdefault("document_number", document_number)

        replaced = self.engine.replace(template_bytes, variables)

        lp_name = variables.get("LP_명칭") or variables.get("lp_name") or "single"
        visible_name = self._safe_filename(f"{document_number}_{lp_name}.docx")
        stored_name = f"{uuid4().hex}.docx"
        stored_path = UPLOAD_DIR / stored_name
        stored_path.write_bytes(replaced)

        attachment = Attachment(
            filename=stored_name,
            original_filename=visible_name,
            file_path=str(stored_path),
            file_size=len(replaced),
            mime_type=DOCX_MIME,
            entity_type=self._build_entity_type(
                fund_id=fund_id,
                template_id=template_id,
                lp_id=lp_id,
                investment_id=investment_id,
            ),
            entity_id=lp_id or investment_id or fund_id,
            uploaded_by=created_by,
        )
        db.add(attachment)

        try:
            if commit:
                db.commit()
                db.refresh(attachment)
            else:
                db.flush()
        except Exception:
            db.rollback()
            stored_path.unlink(missing_ok=True)
            raise

        return attachment

    def preview_one(
        self,
        db: Session,
        fund_id: int,
        template_id: int,
        lp_id: int | None = None,
        investment_id: int | None = None,
        extra_vars: dict[str, str] | None = None,
    ) -> bytes:
        fund = db.get(Fund, fund_id)
        if not fund:
            raise LookupError("Fund not found")

        template = db.get(DocumentTemplate, template_id)
        if not template:
            raise LookupError("Template not found")

        if lp_id is not None:
            lp = db.get(LP, lp_id)
            if not lp or lp.fund_id != fund_id:
                raise LookupError("LP not found for the selected fund")

        template_bytes = self._load_template_bytes(template)
        variables = self.resolver.resolve_all(
            db=db,
            fund_id=fund_id,
            lp_id=lp_id,
            investment_id=investment_id,
            extra_vars=extra_vars,
        )
        preview_number = variables.get("문서번호") or variables.get("document_number") or "PREVIEW"
        variables.setdefault("문서번호", preview_number)
        variables.setdefault("document_number", preview_number)
        return self.engine.replace(template_bytes, variables)

    def generate_for_all_lps(
        self,
        db: Session,
        fund_id: int,
        template_id: int,
        extra_vars: dict[str, str] | None = None,
        created_by: int | None = None,
    ) -> list[Attachment]:
        lps = db.query(LP).filter(LP.fund_id == fund_id).order_by(LP.id.asc()).all()
        if not lps:
            raise LookupError("No LP found for the selected fund")

        created: list[Attachment] = []
        created_files: list[Path] = []

        try:
            for lp in lps:
                doc = self.generate_one(
                    db=db,
                    fund_id=fund_id,
                    template_id=template_id,
                    lp_id=lp.id,
                    extra_vars=extra_vars,
                    created_by=created_by,
                    commit=False,
                )
                created.append(doc)
                created_files.append(Path(doc.file_path))

            db.commit()
            for doc in created:
                db.refresh(doc)
            return created
        except Exception:
            db.rollback()
            for path in created_files:
                path.unlink(missing_ok=True)
            raise

    def list_generated(
        self,
        db: Session,
        fund_id: int | None = None,
        template_id: int | None = None,
        limit: int = 300,
    ) -> list[dict[str, Any]]:
        safe_limit = max(1, min(int(limit or 300), 1000))
        query = db.query(Attachment).filter(Attachment.entity_type.like(f"{self.ENTITY_PREFIX}:%"))

        if fund_id is not None:
            query = query.filter(Attachment.entity_type.like(f"{self.ENTITY_PREFIX}:fund:{fund_id}:template:%"))

        if template_id is not None:
            query = query.filter(Attachment.entity_type.like(f"%:template:{template_id}:lp:%"))

        rows = query.order_by(Attachment.id.desc()).limit(safe_limit).all()
        return [self._to_item(row) for row in rows]

    def get_generated_attachment(self, db: Session, document_id: int) -> Attachment | None:
        row = db.get(Attachment, document_id)
        if not row:
            return None
        if not (row.entity_type or "").startswith(f"{self.ENTITY_PREFIX}:"):
            return None
        return row

    def extract_template_markers(self, db: Session, template_id: int) -> list[str]:
        template = db.get(DocumentTemplate, template_id)
        if not template:
            raise LookupError("Template not found")
        template_bytes = self._load_template_bytes(template)
        return self.engine.extract_markers(template_bytes)

    def _load_template_bytes(self, template: DocumentTemplate) -> bytes:
        template_path = Path(template.file_path or "")
        if not template_path.is_absolute():
            template_path = Path(__file__).resolve().parents[2] / template_path
        if not template.file_path or not template_path.exists() or not template_path.is_file():
            raise FileNotFoundError(f"Template file not found: {template.file_path}")
        return template_path.read_bytes()

    @staticmethod
    def _safe_filename(value: str) -> str:
        sanitized = re.sub(r'[\\/:*?"<>|]+', "_", value).strip()
        return sanitized or "generated.docx"

    def _build_entity_type(
        self,
        fund_id: int,
        template_id: int,
        lp_id: int | None,
        investment_id: int | None,
    ) -> str:
        return (
            f"{self.ENTITY_PREFIX}:fund:{fund_id}:template:{template_id}:"
            f"lp:{lp_id or 0}:investment:{investment_id or 0}"
        )

    def _to_item(self, row: Attachment) -> dict[str, Any]:
        meta = self._parse_entity_type(row.entity_type or "")
        document_number = ""
        if row.original_filename:
            parts = row.original_filename.split("_", 1)
            document_number = parts[0] if parts else ""

        return {
            "id": row.id,
            "filename": row.original_filename,
            "document_number": document_number,
            "fund_id": meta.get("fund_id"),
            "template_id": meta.get("template_id"),
            "lp_id": meta.get("lp_id"),
            "investment_id": meta.get("investment_id"),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "download_url": f"/api/documents/generated/{row.id}/download",
        }

    def _parse_entity_type(self, entity_type: str) -> dict[str, int | None]:
        parts = entity_type.split(":")
        values: dict[str, int | None] = {
            "fund_id": None,
            "template_id": None,
            "lp_id": None,
            "investment_id": None,
        }
        if len(parts) < 10:
            return values

        def parse_int(index: int) -> int | None:
            if index >= len(parts):
                return None
            try:
                value = int(parts[index])
            except ValueError:
                return None
            return value if value > 0 else None

        values["fund_id"] = parse_int(3)
        values["template_id"] = parse_int(5)
        values["lp_id"] = parse_int(7)
        values["investment_id"] = parse_int(9)
        return values

