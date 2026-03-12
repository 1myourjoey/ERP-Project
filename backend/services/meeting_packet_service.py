from __future__ import annotations

import json
import zipfile
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from models.attachment import Attachment
from models.biz_report import BizReport
from models.compliance import ComplianceDocument, ComplianceReviewRun
from models.fund import Fund
from models.meeting_packet import AssemblyAgendaItem, MeetingPacketDocument, MeetingPacketRun
from models.phase3 import Assembly, Distribution
from models.regular_report import RegularReport
from models.valuation import Valuation
from schemas.meeting_packet import (
    MeetingPacketAgendaItemInput,
    MeetingPacketAgendaItemResponse,
    MeetingPacketDocumentItem,
    MeetingPacketDocumentOrderInput,
    MeetingPacketDraftResponse,
    MeetingPacketGenerateResponse,
    MeetingPacketGenerationSlot,
    MeetingPacketPrepareRequest,
    MeetingPacketSlotBindingInput,
    MeetingPacketUpdateRequest,
)
from services.generated_attachment_service import (
    cleanup_generated_attachment,
    sanitize_generated_filename,
    store_generated_attachment,
)
from services.meeting_packet_docx_service import DOCX_MIME, MeetingPacketDocxService
from services.meeting_packet_narrative_service import MeetingPacketNarrativeService
from services.meeting_packet_rpa import (
    LAYOUT_RECOMMENDATIONS,
    PACKET_LABELS,
    PACKET_REQUIRED_SLOTS,
    SLOT_LABELS,
    MeetingPacketRPAService,
    is_nongmotae_packet_type,
    normalize_packet_type,
)

ZIP_MIME = "application/zip"
AUTO_GENERATED_SLOTS = {
    "official_notice",
    "agenda_explanation",
    "written_resolution",
    "proxy_vote_notice",
    "minutes",
    "business_report",
}


class MeetingPacketService:
    def __init__(self) -> None:
        self._rpa = MeetingPacketRPAService()
        self._narrative = MeetingPacketNarrativeService()
        self._docx = MeetingPacketDocxService()

    def prepare_draft(
        self,
        *,
        db: Session,
        request: MeetingPacketPrepareRequest,
        user_id: int | None = None,
    ) -> MeetingPacketDraftResponse:
        fund = db.get(Fund, request.fund_id)
        if not fund:
            raise ValueError("fund not found")
        normalized_packet_type = normalize_packet_type(request.packet_type)
        assembly = self._resolve_assembly(db=db, fund=fund, request=request)
        run = self._resolve_run(
            db=db,
            assembly=assembly,
            packet_type=normalized_packet_type,
            report_year=request.report_year,
            include_bylaw_amendment=request.include_bylaw_amendment,
            user_id=user_id,
        )
        plan = self._rpa.build_generation_plan(
            db=db,
            fund_id=fund.id,
            packet_type=normalized_packet_type,
            meeting_date=request.meeting_date,
            meeting_time=request.meeting_time,
            meeting_method=request.meeting_method,
            report_year=request.report_year,
            include_bylaw_amendment=request.include_bylaw_amendment,
        )
        self._ensure_default_agendas(db=db, assembly=assembly, plan=plan, fund=fund)
        self._sync_run_documents(db=db, run=run, slots=plan.slots)
        self._ensure_document_sort_orders(run=run, slots=plan.slots)
        db.commit()
        db.refresh(run)
        return self._serialize_draft(db=db, run=run, plan=plan)

    def update_draft(
        self,
        *,
        db: Session,
        run_id: int,
        request: MeetingPacketUpdateRequest,
    ) -> MeetingPacketDraftResponse:
        run = db.get(MeetingPacketRun, run_id)
        if not run:
            raise ValueError("meeting packet run not found")
        assembly = db.get(Assembly, run.assembly_id)
        fund = db.get(Fund, run.fund_id)
        if not assembly or not fund:
            raise ValueError("meeting packet data is inconsistent")
        self._normalize_run_packet_type(run=run, assembly=assembly)

        payload = request.model_dump(exclude_unset=True)
        if "meeting_date" in payload and payload["meeting_date"] is not None:
            assembly.date = payload["meeting_date"]
        for field in ("meeting_time", "meeting_method", "location", "chair_name", "document_number"):
            if field in payload:
                setattr(assembly, field, payload.get(field))
        if "report_year" in payload:
            run.report_year = payload.get("report_year")
        if "include_bylaw_amendment" in payload and payload["include_bylaw_amendment"] is not None:
            value = bool(payload["include_bylaw_amendment"])
            assembly.include_bylaw_amendment = value
            run.include_bylaw_amendment = value
        if request.agenda_items is not None:
            self._replace_agenda_items(assembly, request.agenda_items)
        if request.external_bindings is not None:
            self._apply_external_bindings(db=db, run=run, bindings=request.external_bindings)

        plan = self._rpa.build_generation_plan(
            db=db,
            fund_id=fund.id,
            packet_type=normalize_packet_type(run.packet_type),
            meeting_date=assembly.date,
            meeting_time=assembly.meeting_time,
            meeting_method=assembly.meeting_method,
            report_year=run.report_year,
            include_bylaw_amendment=bool(assembly.include_bylaw_amendment),
        )
        self._sync_run_documents(db=db, run=run, slots=plan.slots)
        self._ensure_document_sort_orders(run=run, slots=plan.slots)
        if request.document_orders is not None:
            self._apply_document_orders(run=run, slots=plan.slots, document_orders=request.document_orders)
        db.commit()
        db.refresh(run)
        return self._serialize_draft(db=db, run=run, plan=plan)

    def get_draft(self, *, db: Session, run_id: int) -> MeetingPacketDraftResponse:
        run = db.get(MeetingPacketRun, run_id)
        if not run:
            raise ValueError("meeting packet run not found")
        assembly = db.get(Assembly, run.assembly_id)
        if not assembly:
            raise ValueError("assembly not found")
        self._normalize_run_packet_type(run=run, assembly=assembly)
        plan = self._rpa.build_generation_plan(
            db=db,
            fund_id=run.fund_id,
            packet_type=normalize_packet_type(run.packet_type),
            meeting_date=assembly.date,
            meeting_time=assembly.meeting_time,
            meeting_method=assembly.meeting_method,
            report_year=run.report_year,
            include_bylaw_amendment=bool(run.include_bylaw_amendment),
        )
        self._sync_run_documents(db=db, run=run, slots=plan.slots)
        self._ensure_document_sort_orders(run=run, slots=plan.slots)
        db.commit()
        db.refresh(run)
        return self._serialize_draft(db=db, run=run, plan=plan)

    def generate(
        self,
        *,
        db: Session,
        run_id: int,
        selected_slots: list[str] | None = None,
        user_id: int | None = None,
    ) -> MeetingPacketGenerateResponse:
        run = db.get(MeetingPacketRun, run_id)
        if not run:
            raise ValueError("meeting packet run not found")
        assembly = db.get(Assembly, run.assembly_id)
        fund = db.get(Fund, run.fund_id)
        if not assembly or not fund:
            raise ValueError("meeting packet data is inconsistent")
        self._normalize_run_packet_type(run=run, assembly=assembly)

        plan = self._rpa.build_generation_plan(
            db=db,
            fund_id=fund.id,
            packet_type=normalize_packet_type(run.packet_type),
            meeting_date=assembly.date,
            meeting_time=assembly.meeting_time,
            meeting_method=assembly.meeting_method,
            report_year=run.report_year,
            include_bylaw_amendment=bool(run.include_bylaw_amendment),
        )
        self._sync_run_documents(db=db, run=run, slots=plan.slots)
        self._ensure_document_sort_orders(run=run, slots=plan.slots)
        target_slots = [row.slot for row in self._sorted_documents(run) if row.slot in AUTO_GENERATED_SLOTS]
        if selected_slots:
            target_slots = [slot for slot in target_slots if slot in set(selected_slots)]
        created_attachments: list[Attachment] = []
        try:
            for slot in target_slots:
                doc_row = self._ensure_document_row(run=run, slot=slot)
                payload = self._build_doc_payload(db=db, run=run, assembly=assembly, fund=fund, slot=slot)
                if payload is None:
                    continue
                file_bytes = self._docx.render(payload)
                filename = self._build_slot_filename(fund.name, slot, assembly.date)
                attachment = store_generated_attachment(
                    db=db,
                    payload=file_bytes,
                    original_filename=filename,
                    mime_type=DOCX_MIME,
                    entity_type=f"meeting_packet:{slot}",
                    entity_id=run.id,
                    uploaded_by=user_id,
                    commit=False,
                )
                created_attachments.append(attachment)
                doc_row.attachment = attachment
                doc_row.external_document_id = None
                doc_row.source_mode = "generated"
                doc_row.status = "ready"
                doc_row.layout_mode = LAYOUT_RECOMMENDATIONS.get(slot)
                doc_row.generation_payload_json = json.dumps(payload, ensure_ascii=False)

            missing_slots = self._missing_required_slots(db=db, run=run, plan=plan)
            zip_attachment = self._build_zip(db=db, run=run, fund=fund, missing_slots=missing_slots, user_id=user_id)
            created_attachments.append(zip_attachment)
            run.zip_attachment = zip_attachment
            run.warnings_json = json.dumps(plan.warnings, ensure_ascii=False)
            run.missing_slots_json = json.dumps(missing_slots, ensure_ascii=False)
            run.status = "complete" if not missing_slots else "partial"
            db.commit()
        except Exception as exc:
            db.rollback()
            for attachment in created_attachments:
                cleanup_generated_attachment(attachment)
            if isinstance(exc, RuntimeError):
                raise
            raise RuntimeError("총회 패키지 생성에 실패했습니다.") from exc
        db.refresh(run)
        return MeetingPacketGenerateResponse(
            run_id=run.id,
            status=run.status,
            warnings=list(plan.warnings),
            missing_slots=missing_slots,
            documents=[self._serialize_document(db=db, row=row) for row in self._sorted_documents(run)],
            zip_attachment_id=run.zip_attachment_id,
            zip_download_url=f"/api/documents/{run.zip_attachment_id}/download" if run.zip_attachment_id else None,
        )

    def _resolve_assembly(self, *, db: Session, fund: Fund, request: MeetingPacketPrepareRequest) -> Assembly:
        normalized_packet_type = normalize_packet_type(request.packet_type)
        assembly = db.get(Assembly, request.assembly_id) if request.assembly_id else None
        if assembly is None:
            assembly = Assembly(
                fund_id=fund.id,
                type="regular" if "gp_shareholders" not in normalized_packet_type else "shareholders",
                date=request.meeting_date,
            )
            db.add(assembly)
        assembly.date = request.meeting_date
        assembly.meeting_time = request.meeting_time
        assembly.meeting_method = request.meeting_method or ("서면결의" if "gp_shareholders" not in normalized_packet_type else "대면총회")
        assembly.location = request.location or fund.gp or "확인 필요"
        assembly.chair_name = request.chair_name or fund.gp or fund.fund_manager or "확인 필요"
        assembly.document_number = request.document_number
        assembly.packet_type = normalized_packet_type
        assembly.include_bylaw_amendment = bool(request.include_bylaw_amendment)
        db.flush()
        return assembly

    def _resolve_run(
        self,
        *,
        db: Session,
        assembly: Assembly,
        packet_type: str,
        report_year: int | None,
        include_bylaw_amendment: bool,
        user_id: int | None,
    ) -> MeetingPacketRun:
        run = (
            db.query(MeetingPacketRun)
            .filter(MeetingPacketRun.assembly_id == assembly.id, MeetingPacketRun.packet_type == packet_type)
            .order_by(MeetingPacketRun.id.desc())
            .first()
        )
        if run is None:
            run = MeetingPacketRun(
                assembly_id=assembly.id,
                fund_id=assembly.fund_id,
                packet_type=packet_type,
                report_year=report_year,
                include_bylaw_amendment=include_bylaw_amendment,
                status="draft",
                created_by=user_id,
            )
            db.add(run)
            db.flush()
        else:
            run.report_year = report_year
            run.include_bylaw_amendment = include_bylaw_amendment
        return run

    def _normalize_run_packet_type(self, *, run: MeetingPacketRun, assembly: Assembly | None = None) -> None:
        normalized_packet_type = normalize_packet_type(run.packet_type)
        if normalized_packet_type and run.packet_type != normalized_packet_type:
            run.packet_type = normalized_packet_type
        if assembly and assembly.packet_type and assembly.packet_type != normalized_packet_type:
            assembly.packet_type = normalized_packet_type

    def _ensure_default_agendas(self, *, db: Session, assembly: Assembly, plan, fund: Fund) -> None:
        if list(assembly.agenda_items or []):
            return
        latest_biz_report = self._latest_biz_report(db, fund.id)
        items: list[MeetingPacketAgendaItemInput] = []
        for index, title in enumerate(plan.agenda_preview):
            kind = self._agenda_kind_from_title(title)
            description = self._fallback_agenda_description(
                db=db,
                fund=fund,
                agenda_kind=kind,
                title=title,
                latest_biz_report=latest_biz_report,
            )
            description = self._narrative.polish(
                db=db,
                kind=f"agenda:{kind}",
                fallback_text=description,
                context={"fund_name": fund.name, "agenda_title": title},
            )
            items.append(
                MeetingPacketAgendaItemInput(
                    sort_order=index,
                    kind=kind,
                    title=title,
                    short_title=self._short_title(title),
                    description=description,
                    requires_vote=True,
                    source_type="recommended",
                    source_ref=f"packet:{plan.packet_type}",
                    resolution_text=self._resolution_text(title),
                    vote_result="원안 가결",
                )
            )
        self._replace_agenda_items(assembly, items)

    def _replace_agenda_items(self, assembly: Assembly, items: list[MeetingPacketAgendaItemInput]) -> None:
        assembly.agenda_items.clear()
        cleaned_titles: list[str] = []
        for index, item in enumerate(items):
            title = item.title.strip()
            if not title:
                continue
            cleaned_titles.append(title)
            assembly.agenda_items.append(
                AssemblyAgendaItem(
                    sort_order=int(item.sort_order if item.sort_order is not None else index),
                    kind=item.kind,
                    title=title,
                    short_title=(item.short_title or self._short_title(title)).strip(),
                    description=item.description,
                    requires_vote=bool(item.requires_vote),
                    source_type=item.source_type,
                    source_ref=item.source_ref,
                    resolution_text=item.resolution_text,
                    vote_result=item.vote_result,
                )
            )
        assembly.agenda = "\n".join(cleaned_titles)

    def _apply_external_bindings(
        self,
        *,
        db: Session,
        run: MeetingPacketRun,
        bindings: list[MeetingPacketSlotBindingInput],
    ) -> None:
        for binding in bindings:
            row = self._ensure_document_row(run=run, slot=binding.slot)
            row.attachment_id = binding.attachment_id
            row.external_document_id = binding.external_document_id
            if binding.external_document_id or binding.attachment_id:
                row.source_mode = "external"
                row.status = "ready"
            else:
                row.source_mode = "missing"
                row.status = "missing"

    def _sync_run_documents(self, *, db: Session, run: MeetingPacketRun, slots: list[MeetingPacketGenerationSlot]) -> None:
        required_slots = {slot.slot for slot in slots}
        existing = {row.slot: row for row in list(run.documents or [])}
        for index, slot in enumerate(slots):
            row = existing.get(slot.slot)
            if row is None:
                row = MeetingPacketDocument(
                    run_id=run.id,
                    slot=slot.slot,
                    sort_order=index,
                    source_mode="generated" if slot.slot in AUTO_GENERATED_SLOTS else "missing",
                    status="draft" if slot.slot in AUTO_GENERATED_SLOTS else ("missing" if slot.generation_mode == "external_receive" else "pending"),
                    layout_mode=slot.recommended_layout,
                )
                db.add(row)
                db.flush()
                existing[slot.slot] = row
            else:
                row.layout_mode = slot.recommended_layout
                if row.source_mode != "external" and slot.slot in AUTO_GENERATED_SLOTS and row.status == "draft":
                    row.source_mode = "generated"
            if slot.generation_mode == "external_receive" and not row.external_document_id and not row.attachment_id:
                row.source_mode = "missing"
                row.status = "missing"
        for slot, row in existing.items():
            if slot not in required_slots and row.id:
                db.delete(row)

    def _ensure_document_row(self, *, run: MeetingPacketRun, slot: str) -> MeetingPacketDocument:
        for row in list(run.documents or []):
            if row.slot == slot:
                return row
        row = MeetingPacketDocument(
            run_id=run.id,
            slot=slot,
            sort_order=len(list(run.documents or [])),
            source_mode="generated",
            status="draft",
        )
        run.documents.append(row)
        return row

    def _sorted_documents(self, run: MeetingPacketRun) -> list[MeetingPacketDocument]:
        return sorted(
            list(run.documents or []),
            key=lambda row: (int(row.sort_order or 0), row.id or 0, row.slot),
        )

    def _ensure_document_sort_orders(self, *, run: MeetingPacketRun, slots: list[MeetingPacketGenerationSlot]) -> None:
        rows = list(run.documents or [])
        if not rows:
            return
        current_orders = [int(row.sort_order or 0) for row in rows]
        if len(set(current_orders)) == len(rows) and not all(order == 0 for order in current_orders):
            return

        rows_by_slot = {row.slot: row for row in rows}
        assigned_slots: set[str] = set()
        next_order = 0
        for slot in slots:
            row = rows_by_slot.get(slot.slot)
            if row is None:
                continue
            row.sort_order = next_order
            assigned_slots.add(row.slot)
            next_order += 1
        for row in sorted(rows, key=lambda item: (item.id or 0, item.slot)):
            if row.slot in assigned_slots:
                continue
            row.sort_order = next_order
            next_order += 1

    def _apply_document_orders(
        self,
        *,
        run: MeetingPacketRun,
        slots: list[MeetingPacketGenerationSlot],
        document_orders: list[MeetingPacketDocumentOrderInput],
    ) -> None:
        rows_by_slot = {row.slot: row for row in list(run.documents or [])}
        ordered_slots = [
            item.slot
            for item in sorted(document_orders, key=lambda item: (item.sort_order, item.slot))
            if item.slot in rows_by_slot
        ]
        ordered_slots.extend(
            slot.slot
            for slot in slots
            if slot.slot in rows_by_slot and slot.slot not in ordered_slots
        )
        ordered_slots.extend(
            row.slot for row in self._sorted_documents(run) if row.slot not in ordered_slots
        )
        for index, slot_name in enumerate(ordered_slots):
            rows_by_slot[slot_name].sort_order = index

    def _serialize_draft(self, *, db: Session, run: MeetingPacketRun, plan) -> MeetingPacketDraftResponse:
        assembly = db.get(Assembly, run.assembly_id)
        fund = db.get(Fund, run.fund_id)
        if not assembly or not fund:
            raise ValueError("meeting packet data is inconsistent")
        return MeetingPacketDraftResponse(
            run_id=run.id,
            assembly_id=assembly.id,
            fund_id=fund.id,
            fund_name=fund.name,
            packet_type=run.packet_type,  # type: ignore[arg-type]
            packet_label=PACKET_LABELS.get(run.packet_type, run.packet_type),
            status=run.status,
            meeting_date=assembly.date.isoformat(),
            meeting_time=assembly.meeting_time,
            meeting_method=assembly.meeting_method,
            location=assembly.location,
            chair_name=assembly.chair_name,
            document_number=assembly.document_number,
            report_year=run.report_year,
            include_bylaw_amendment=bool(run.include_bylaw_amendment),
            packet_reasoning=list(plan.packet_reasoning),
            warnings=list(plan.warnings),
            recipients_preview=list(plan.recipients_preview),
            slots=plan.slots,
            agenda_items=[
                MeetingPacketAgendaItemResponse(
                    id=item.id,
                    sort_order=item.sort_order,
                    kind=item.kind,
                    title=item.title,
                    short_title=item.short_title,
                    description=item.description,
                    requires_vote=bool(item.requires_vote),
                    source_type=item.source_type,
                    source_ref=item.source_ref,
                    resolution_text=item.resolution_text,
                    vote_result=item.vote_result,
                )
                for item in list(assembly.agenda_items or [])
            ],
            documents=[self._serialize_document(db=db, row=row) for row in self._sorted_documents(run)],
            zip_attachment_id=run.zip_attachment_id,
            zip_download_url=f"/api/documents/{run.zip_attachment_id}/download" if run.zip_attachment_id else None,
        )

    def _serialize_document(self, *, db: Session, row: MeetingPacketDocument) -> MeetingPacketDocumentItem:
        attachment = row.attachment or (db.get(Attachment, row.attachment_id) if row.attachment_id else None)
        external = row.external_document or (
            db.get(ComplianceDocument, row.external_document_id) if row.external_document_id else None
        )
        attachment_id = row.attachment_id or (attachment.id if attachment else None)
        external_document_id = row.external_document_id or (external.id if external else None)
        return MeetingPacketDocumentItem(
            id=row.id,
            slot=row.slot,
            slot_label=SLOT_LABELS.get(row.slot, row.slot),
            sort_order=int(row.sort_order or 0),
            status=row.status,
            source_mode=row.source_mode,
            layout_mode=row.layout_mode,
            attachment_id=attachment_id,
            filename=attachment.original_filename if attachment else None,
            download_url=f"/api/documents/{attachment.id}/download" if attachment else None,
            external_document_id=external_document_id,
            external_document_name=external.title if external else None,
        )

    def _build_doc_payload(
        self,
        *,
        db: Session,
        run: MeetingPacketRun,
        assembly: Assembly,
        fund: Fund,
        slot: str,
    ) -> dict[str, Any] | None:
        agendas = list(assembly.agenda_items or [])
        latest_biz_report = self._latest_biz_report(db, fund.id) if slot == "agenda_explanation" else None
        meeting = {
            "date_iso": assembly.date.isoformat(),
            "date_label": self._format_date_label(assembly.date),
            "time": assembly.meeting_time or "",
            "method": assembly.meeting_method or "",
            "location": assembly.location or "",
            "chair_name": assembly.chair_name or "",
        }
        if slot == "official_notice":
            return {
                "kind": slot,
                "fund_name": fund.name,
                "sender_name": fund.gp or fund.name,
                "document_date": self._format_doc_date(date.today()),
                "document_number": assembly.document_number or "",
                "subject": self._subject_text(fund=fund, packet_type=run.packet_type),
                "recipients": self._recipients(fund=fund, packet_type=run.packet_type),
                "greeting": "귀 원(사)의 무궁한 발전을 기원합니다.",
                "legal_basis": self._legal_basis(fund=fund, packet_type=run.packet_type),
                "meeting": meeting,
                "report_items": self._report_items(run.packet_type),
                "agendas": [{"title": item.title, "short_title": item.short_title} for item in agendas],
                "attachments": [{"label": label} for label in self._attachment_labels(run=run, include_bylaw_amendment=bool(run.include_bylaw_amendment))],
                "signoff_date": self._format_date_label(assembly.date),
                "signoff_name": self._sender_signature(fund=fund, packet_type=run.packet_type),
            }
        if slot == "agenda_explanation":
            return {
                "kind": slot,
                "fund_name": fund.name,
                "title": f"{fund.name} 의안설명서",
                "meeting": meeting,
                "report_items": self._report_items(run.packet_type),
                "agendas": [
                    {
                        "title": item.title,
                        "description": item.description or self._fallback_agenda_description(
                            db=db,
                            fund=fund,
                            agenda_kind=item.kind,
                            title=item.title,
                            latest_biz_report=latest_biz_report,
                        ),
                    }
                    for item in agendas
                ],
                "financial_summary": self._financial_summary(
                    db=db,
                    fund=fund,
                    latest_biz_report=latest_biz_report,
                ),
            }
        if slot in {"written_resolution", "proxy_vote_notice"}:
            return {
                "kind": slot,
                "fund_name": fund.name,
                "meeting": meeting,
                "recipient_label": fund.name,
                "introduction": self._vote_intro(fund=fund, assembly=assembly, slot=slot),
                "agendas": [{"title": item.title, "short_title": item.short_title} for item in agendas],
                "vote_note": "* 찬성 또는 반대 항목에 표시해 주시기 바랍니다.",
                "signoff_date": self._format_date_label(assembly.date),
                "seat_label": "약정좌수" if run.packet_type != "gp_shareholders_meeting" else "출자좌수",
                "name_label": "조합원명" if run.packet_type != "gp_shareholders_meeting" else "사원명",
                "id_label": "사업자등록번호" if run.packet_type != "gp_shareholders_meeting" else "생년월일",
            }
        if slot == "minutes":
            return {
                "kind": slot,
                "fund_name": fund.name,
                "title": f"{fund.name} 총회 의사록",
                "opening_text": self._minutes_opening(fund=fund, assembly=assembly, packet_type=run.packet_type),
                "attendance_summary": self._attendance_summary(fund=fund, packet_type=run.packet_type),
                "agendas": [
                    {
                        "title": item.title,
                        "description": item.description,
                        "resolution_text": item.resolution_text or self._resolution_text(item.title),
                        "vote_result": item.vote_result or "원안 가결",
                    }
                    for item in agendas
                ],
                "closing_text": "위 의사의 경과와 결과를 명확히 하기 위하여 본 의사록 초안을 작성함.",
                "signoff_date": self._format_date_label(assembly.date),
                "signoff_name": self._sender_signature(fund=fund, packet_type=run.packet_type),
            }
        if slot == "business_report":
            return self._business_report_payload(db=db, fund=fund, assembly=assembly, packet_type=run.packet_type)
        return None

    def _business_report_payload(self, *, db: Session, fund: Fund, assembly: Assembly, packet_type: str) -> dict[str, Any]:
        latest_biz_report = self._latest_biz_report(db, fund.id)
        latest_regular_report = (
            db.query(RegularReport)
            .filter(RegularReport.fund_id == fund.id)
            .order_by(RegularReport.created_at.desc(), RegularReport.id.desc())
            .first()
        )
        latest_reviews = (
            db.query(ComplianceReviewRun)
            .filter(ComplianceReviewRun.fund_id == fund.id)
            .order_by(ComplianceReviewRun.created_at.desc(), ComplianceReviewRun.id.desc())
            .limit(3)
            .all()
        )
        valuations = (
            db.query(Valuation)
            .filter(Valuation.fund_id == fund.id)
            .order_by(Valuation.as_of_date.desc(), Valuation.id.desc())
            .limit(5)
            .all()
        )
        latest_distribution = (
            db.query(Distribution)
            .filter(Distribution.fund_id == fund.id)
            .order_by(Distribution.dist_date.desc(), Distribution.id.desc())
            .first()
        )
        compliance_text = " / ".join(
            f"{row.scenario}: {row.result} ({(row.summary or '').strip()[:60]})"
            for row in latest_reviews
        ) or "최근 준법 점검 결과 없음"
        overview_text = latest_biz_report.market_overview if latest_biz_report and latest_biz_report.market_overview else "조합 운용 현황을 요약했습니다."
        overview_text = self._narrative.polish(
            db=db,
            kind="business_report.overview",
            fallback_text=overview_text,
            context={"fund_name": fund.name, "packet_type": packet_type},
        )
        sections = [
            {
                "title": "Ⅰ. 조합운용현황",
                "paragraphs": [
                    overview_text,
                    f"최근 등록 기준 투자 건수는 {self._investment_count_text(db, fund.id)}입니다.",
                ],
                "table": {
                    "headers": ["항목", "값"],
                    "widths": [2800, 6560],
                    "rows": [
                        ["총 약정액", self._fmt_money(fund.commitment_total)],
                        ["GP 약정액", self._fmt_money(fund.gp_commitment)],
                        ["만기일", self._fmt_date(fund.maturity_date)],
                        ["수탁사", fund.trustee or "-"],
                    ],
                },
            },
            {
                "title": "Ⅱ. 조합자산현황",
                "paragraphs": [
                    latest_biz_report.portfolio_summary if latest_biz_report and latest_biz_report.portfolio_summary else "포트폴리오와 자산 현황을 정리했습니다.",
                ],
                "table": {
                    "headers": ["평가기준일", "투자ID", "평가금액"],
                    "widths": [2200, 2600, 4560],
                    "rows": [
                        [self._fmt_date(row.as_of_date), str(row.investment_id or "-"), self._fmt_money(getattr(row, "total_fair_value", None) or getattr(row, "value", None))]
                        for row in valuations
                    ] or [["-", "-", "-"]],
                },
            },
            {
                "title": "Ⅲ. 기타 점검사항" if is_nongmotae_packet_type(packet_type) else "Ⅳ. 기타 점검사항",
                "paragraphs": [
                    latest_biz_report.key_issues if latest_biz_report and latest_biz_report.key_issues else "추가납입, 분배, 준법 현황을 점검했습니다.",
                    f"준법 검토 요약: {compliance_text}",
                    f"최근 정기보고 상태: {latest_regular_report.status if latest_regular_report else '기록 없음'}",
                    f"최근 분배일: {self._fmt_date(latest_distribution.dist_date) if latest_distribution else '없음'}",
                ],
            },
        ]
        return {
            "kind": "business_report",
            "fund_name": fund.name,
            "title": f"{fund.name} 영업보고서",
            "subtitle": f"{self._format_date_label(assembly.date)} 기준 보고자료",
            "sections": sections,
        }

    def _build_zip(
        self,
        *,
        db: Session,
        run: MeetingPacketRun,
        fund: Fund,
        missing_slots: list[str],
        user_id: int | None,
    ) -> Attachment:
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            if missing_slots:
                checklist = "누락 슬롯\n" + "\n".join(f"- {SLOT_LABELS.get(slot, slot)}" for slot in missing_slots)
                archive.writestr("00_누락체크리스트.md", checklist)
            archive.writestr(
                "00_manifest.json",
                json.dumps(
                    {
                        "run_id": run.id,
                        "fund_id": fund.id,
                        "fund_name": fund.name,
                        "packet_type": run.packet_type,
                        "status": "complete" if not missing_slots else "partial",
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            )
            sort_index = 1
            for row in self._sorted_documents(run):
                file_path = self._resolve_document_path(db=db, row=row)
                if not file_path:
                    continue
                archive.write(file_path, arcname=self._zip_arcname(row, file_path, sort_index))
                sort_index += 1
        filename = sanitize_generated_filename(f"[{fund.name}]_meeting_packet_{date.today().isoformat()}.zip")
        return store_generated_attachment(
            db=db,
            payload=buffer.getvalue(),
            original_filename=filename,
            mime_type=ZIP_MIME,
            entity_type="meeting_packet:zip",
            entity_id=run.id,
            uploaded_by=user_id,
            commit=False,
        )

    def _resolve_document_path(self, *, db: Session, row: MeetingPacketDocument) -> Path | None:
        attachment = row.attachment or (db.get(Attachment, row.attachment_id) if row.attachment_id else None)
        if attachment and attachment.file_path:
            return Path(attachment.file_path)

        external = row.external_document or (
            db.get(ComplianceDocument, row.external_document_id) if row.external_document_id else None
        )
        if external is None:
            return None

        external_attachment = getattr(external, "attachment", None) or (
            db.get(Attachment, external.attachment_id) if external.attachment_id else None
        )
        if external_attachment and external_attachment.file_path:
            return Path(external_attachment.file_path)
        if external.file_path:
            candidate = Path(external.file_path)
            return candidate if candidate.is_absolute() else (Path(__file__).resolve().parents[2] / candidate)
        return None

    def _zip_arcname(self, row: MeetingPacketDocument, file_path: Path, sort_index: int) -> str:
        prefix = SLOT_LABELS.get(row.slot, row.slot)
        return f"{sort_index:02d}_{prefix}{file_path.suffix}"

    def _missing_required_slots(self, *, db: Session, run: MeetingPacketRun, plan) -> list[str]:
        rows = {row.slot: row for row in list(run.documents or [])}
        missing: list[str] = []
        for slot in plan.slots:
            row = rows.get(slot.slot)
            if row is None:
                missing.append(slot.slot)
                continue
            has_attachment = row.attachment is not None or row.attachment_id is not None
            has_external_document = row.external_document is not None or row.external_document_id is not None
            if slot.generation_mode == "external_receive":
                if not has_attachment and not has_external_document:
                    missing.append(slot.slot)
            elif slot.slot in AUTO_GENERATED_SLOTS:
                if not has_attachment:
                    missing.append(slot.slot)
        return missing

    def _latest_biz_report(self, db: Session, fund_id: int) -> BizReport | None:
        return (
            db.query(BizReport)
            .filter(BizReport.fund_id == fund_id)
            .order_by(BizReport.report_year.desc(), BizReport.id.desc())
            .first()
        )

    def _financial_summary(
        self,
        *,
        db: Session,
        fund: Fund,
        latest_biz_report: BizReport | None = None,
    ) -> list[dict[str, str]]:
        if latest_biz_report is None:
            latest_biz_report = self._latest_biz_report(db, fund.id)
        if latest_biz_report:
            return [
                {"label": "총 약정액", "value": self._fmt_money(latest_biz_report.total_commitment), "note": "BizReport"},
                {"label": "누적 납입액", "value": self._fmt_money(latest_biz_report.total_paid_in), "note": "BizReport"},
                {"label": "NAV", "value": self._fmt_money(latest_biz_report.fund_nav), "note": "BizReport"},
                {"label": "투자금액", "value": self._fmt_money(latest_biz_report.total_invested), "note": "BizReport"},
            ]
        return [
            {"label": "총 약정액", "value": self._fmt_money(fund.commitment_total), "note": "Fund"},
            {"label": "GP 약정액", "value": self._fmt_money(fund.gp_commitment), "note": "Fund"},
        ]

    def _recipients(self, *, fund: Fund, packet_type: str) -> list[str]:
        if packet_type == "gp_shareholders_meeting":
            return [f"{fund.gp or '업무집행조합원'} 사원 귀하"]
        names = [lp.name for lp in list(fund.lps or []) if lp.name]
        return names or [f"{fund.name} 조합원"]

    def _attachment_labels(self, *, run: MeetingPacketRun, include_bylaw_amendment: bool) -> list[str]:
        labels: list[str] = []
        for row in self._sorted_documents(run):
            slot = row.slot
            if slot in {"official_notice", "minutes"}:
                continue
            if slot == "bylaw_amendment_draft" and not include_bylaw_amendment and run.packet_type != "fund_lp_regular_meeting_project_with_bylaw_amendment":
                continue
            labels.append(SLOT_LABELS.get(slot, slot))
        return labels

    def _report_items(self, packet_type: str) -> list[str]:
        if packet_type == "gp_shareholders_meeting":
            return ["감사보고"]
        return ["감사보고", "영업보고"]

    def _subject_text(self, *, fund: Fund, packet_type: str) -> str:
        if packet_type == "gp_shareholders_meeting":
            return f"{fund.gp or fund.name} 정기사원총회 개최의 건"
        if packet_type == "fund_lp_regular_meeting_nongmotae":
            return f"{fund.name} 정기조합원총회 및 온기 투자보고회 개최의 건"
        return f"{fund.name} 정기조합원총회 개최의 건"

    def _legal_basis(self, *, fund: Fund, packet_type: str) -> str:
        meeting_terms = [row for row in list(fund.key_terms or []) if "총회" in (row.label or "") or "소집" in (row.label or "")]
        refs = [row.article_ref for row in meeting_terms if row.article_ref]
        if packet_type == "gp_shareholders_meeting":
            return "정관상 총회 소집 조항에 의거하여 정기사원총회를 개최합니다."
        if refs:
            return f"규약 {', '.join(refs)}에 의거하여 정기총회를 개최합니다."
        return "규약상 총회 소집 및 운영 조항에 의거하여 정기총회를 개최합니다."

    def _vote_intro(self, *, fund: Fund, assembly: Assembly, slot: str) -> str:
        verb = "의결권을 행사" if slot == "proxy_vote_notice" else "서면으로 의결"
        return f"본인은 {self._format_date_label(assembly.date)} 개최되는 {fund.name} 안건에 대해 다음과 같이 {verb}합니다."

    def _minutes_opening(self, *, fund: Fund, assembly: Assembly, packet_type: str) -> str:
        subject = "정기사원총회" if packet_type == "gp_shareholders_meeting" else "정기조합원총회"
        return f"{fund.name}는 {self._format_date_label(assembly.date)} {assembly.location or '회의실'}에서 {subject}를 개최하다."

    def _attendance_summary(self, *, fund: Fund, packet_type: str) -> list[dict[str, str]]:
        total_seats = self._seat_total(fund)
        total_people = len(list(fund.lps or [])) if packet_type != "gp_shareholders_meeting" else 0
        people_label = "조합원 총수" if packet_type != "gp_shareholders_meeting" else "사원 총수"
        attended_label = "출석 조합원수" if packet_type != "gp_shareholders_meeting" else "출석 사원수"
        return [
            {"label": people_label, "value": str(total_people) if total_people else "확인 필요"},
            {"label": attended_label, "value": str(total_people) if total_people else "확인 필요"},
            {"label": "총 출자좌수", "value": str(total_seats) if total_seats else "확인 필요"},
            {"label": "출석 출자좌수", "value": str(total_seats) if total_seats else "확인 필요"},
        ]

    def _short_title(self, title: str) -> str:
        cleaned = " ".join(title.replace("제", "제 ").split())
        if len(cleaned) <= 32:
            return cleaned
        return cleaned[:32].rstrip() + "..."

    def _agenda_kind_from_title(self, title: str) -> str:
        if "재무제표" in title:
            return "financial_statement_approval"
        if "규약 변경" in title:
            return "bylaw_change"
        if "참여인력" in title or "운용인력" in title:
            return "manager_change"
        if "준법감시인" in title:
            return "compliance_officer_change"
        return "custom"

    def _fallback_agenda_description(
        self,
        *,
        db: Session,
        fund: Fund,
        agenda_kind: str,
        title: str,
        latest_biz_report: BizReport | None,
    ) -> str:
        if agenda_kind == "financial_statement_approval":
            nav = self._fmt_money(latest_biz_report.fund_nav) if latest_biz_report else self._fmt_money(fund.commitment_total)
            return f"{fund.name}의 당기 재무제표와 주요 재무현황을 조합원에게 보고하고, 관련 내용을 승인받기 위해 상정하는 안건입니다. 현재 확인된 주요 기준 수치는 {nav} 수준입니다."
        if agenda_kind == "bylaw_change":
            return f"{fund.name} 운용 과정에서 필요한 규약 변경 내용을 설명하고, 개정 규약안과 신구대조표를 기준으로 조합원 의결을 받기 위해 상정하는 안건입니다."
        if agenda_kind == "manager_change":
            return f"{fund.name}의 핵심운용인력 또는 참여인력 변경 사항을 설명하고, 관련 규약과 보고 의무를 충족하기 위해 상정하는 안건입니다."
        if agenda_kind == "compliance_officer_change":
            return "준법감시인 변경 배경과 예정 인력 정보를 설명하고, 관련 의사결정을 위해 상정하는 안건입니다."
        return f"{title}에 대한 배경과 주요 내용을 설명하고 필요한 승인을 받기 위해 상정하는 안건입니다."

    def _resolution_text(self, title: str) -> str:
        return f"의장은 {title}에 대해 설명하고 승인을 구한 바, 원안대로 가결하다."

    def _sender_signature(self, *, fund: Fund, packet_type: str) -> str:
        if packet_type == "gp_shareholders_meeting":
            return fund.gp or "대표이사"
        return f"업무집행조합원 {fund.gp or ''}".strip()

    def _investment_count_text(self, db: Session, fund_id: int) -> str:
        count = db.query(Valuation.investment_id).filter(Valuation.fund_id == fund_id).distinct().count()
        return f"{count}건" if count else "등록 데이터 없음"

    def _seat_total(self, fund: Fund) -> int:
        candidate = next((row.value for row in list(fund.key_terms or []) if "좌수" in (row.label or "")), None)
        if candidate:
            try:
                return int(float(str(candidate).replace(",", "")))
            except ValueError:
                pass
        unit_price = next((row.value for row in list(fund.key_terms or []) if "좌당" in (row.label or "")), None)
        try:
            unit = float(str(unit_price).replace(",", "")) if unit_price else 1_000_000.0
        except ValueError:
            unit = 1_000_000.0
        total = float(fund.commitment_total or 0)
        return int(round(total / unit)) if unit > 0 and total > 0 else 0

    def _fmt_money(self, value: Any) -> str:
        if value in (None, ""):
            return "-"
        try:
            return f"{int(float(value)):,}원"
        except (TypeError, ValueError):
            return str(value)

    def _fmt_date(self, value: Any) -> str:
        if value is None:
            return "-"
        if hasattr(value, "strftime"):
            return value.strftime("%Y-%m-%d")
        return str(value)

    def _format_doc_date(self, value: date) -> str:
        return value.strftime("%Y. %m. %d.")

    def _format_date_label(self, value: date) -> str:
        weekdays = ["월", "화", "수", "목", "금", "토", "일"]
        return f"{value.year}년 {value.month}월 {value.day}일({weekdays[value.weekday()]})"

    def _build_slot_filename(self, fund_name: str, slot: str, meeting_date: date) -> str:
        suffix = {
            "official_notice": "공문",
            "agenda_explanation": "의안설명서",
            "written_resolution": "서면의결서",
            "proxy_vote_notice": "의결권행사통보서",
            "minutes": "의사록초안",
            "business_report": "영업보고서",
        }.get(slot, slot)
        return sanitize_generated_filename(f"[{fund_name}]_{meeting_date.isoformat()}_{suffix}.docx")
