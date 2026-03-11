from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi import Query
from sqlalchemy.orm import Session

from database import get_db
from schemas.meeting_packet import (
    MeetingPacketAnalyzeRequest,
    MeetingPacketAnalyzeResponse,
    MeetingPacketDraftResponse,
    MeetingPacketGenerateRequest,
    MeetingPacketGenerateResponse,
    MeetingPacketGenerationPlanRequest,
    MeetingPacketGenerationPlanResponse,
    MeetingPacketPrepareRequest,
    MeetingPacketUpdateRequest,
)
from services.meeting_packet_rpa import MeetingPacketRPAService
from services.meeting_packet_service import MeetingPacketService

router = APIRouter(tags=["meeting_rpa"])


@router.post("/api/meeting-rpa/analyze-root", response_model=MeetingPacketAnalyzeResponse)
def analyze_meeting_packet_root(
    body: MeetingPacketAnalyzeRequest = Body(...),
):
    service = MeetingPacketRPAService()
    try:
        return service.analyze_root(body.root_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/meeting-rpa/generation-plan", response_model=MeetingPacketGenerationPlanResponse)
def build_meeting_packet_generation_plan(
    body: MeetingPacketGenerationPlanRequest = Body(...),
    db: Session = Depends(get_db),
):
    service = MeetingPacketRPAService()
    try:
        return service.build_generation_plan(
            db=db,
            fund_id=body.fund_id,
            packet_type=body.packet_type,
            meeting_date=body.meeting_date,
            meeting_time=body.meeting_time,
            meeting_method=body.meeting_method,
            report_year=body.report_year,
            include_bylaw_amendment=body.include_bylaw_amendment,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/funds/{fund_id}/meeting-rpa/plan", response_model=MeetingPacketGenerationPlanResponse)
def get_fund_meeting_packet_generation_plan(
    fund_id: int,
    packet_type: str | None = Query(default=None),
    meeting_date: str | None = Query(default=None),
    meeting_time: str | None = Query(default=None),
    meeting_method: str | None = Query(default=None),
    report_year: int | None = Query(default=None, ge=2000, le=2100),
    include_bylaw_amendment: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    service = MeetingPacketRPAService()
    try:
        parsed_meeting_date = None
        if meeting_date:
            from datetime import date
            parsed_meeting_date = date.fromisoformat(meeting_date)
        return service.build_generation_plan(
            db=db,
            fund_id=fund_id,
            packet_type=packet_type or "unknown",
            meeting_date=parsed_meeting_date,
            meeting_time=meeting_time,
            meeting_method=meeting_method,
            report_year=report_year,
            include_bylaw_amendment=include_bylaw_amendment,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/funds/{fund_id}/meeting-packets/prepare", response_model=MeetingPacketDraftResponse)
def prepare_meeting_packet(
    fund_id: int,
    body: MeetingPacketPrepareRequest = Body(...),
    db: Session = Depends(get_db),
):
    if fund_id != body.fund_id:
        raise HTTPException(status_code=400, detail="fund_id path and body mismatch")
    service = MeetingPacketService()
    try:
        return service.prepare_draft(db=db, request=body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/meeting-packets/{run_id}", response_model=MeetingPacketDraftResponse)
def get_meeting_packet(run_id: int, db: Session = Depends(get_db)):
    service = MeetingPacketService()
    try:
        return service.get_draft(db=db, run_id=run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/api/meeting-packets/{run_id}", response_model=MeetingPacketDraftResponse)
def update_meeting_packet(
    run_id: int,
    body: MeetingPacketUpdateRequest = Body(...),
    db: Session = Depends(get_db),
):
    service = MeetingPacketService()
    try:
        return service.update_draft(db=db, run_id=run_id, request=body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/meeting-packets/{run_id}/generate", response_model=MeetingPacketGenerateResponse)
def generate_meeting_packet(
    run_id: int,
    body: MeetingPacketGenerateRequest = Body(default=MeetingPacketGenerateRequest()),
    db: Session = Depends(get_db),
):
    service = MeetingPacketService()
    try:
        return service.generate(db=db, run_id=run_id, selected_slots=body.selected_slots)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
