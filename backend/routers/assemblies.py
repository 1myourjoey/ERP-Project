from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.meeting_packet import AssemblyAgendaItem
from models.phase3 import Assembly
from schemas.phase3 import (
    AssemblyAgendaItemInput,
    AssemblyAgendaItemResponse,
    AssemblyCreate,
    AssemblyListItem,
    AssemblyResponse,
    AssemblyUpdate,
)

router = APIRouter(tags=["assemblies"])


def _ensure_fund(db: Session, fund_id: int) -> None:
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")


def _agenda_summary(items: list[AssemblyAgendaItemInput]) -> str | None:
    cleaned = [item.title.strip() for item in items if item.title.strip()]
    return "\n".join(cleaned) if cleaned else None


def _replace_agenda_items(row: Assembly, items: list[AssemblyAgendaItemInput] | None) -> None:
    if items is None:
        return
    row.agenda_items.clear()
    for index, item in enumerate(items):
        row.agenda_items.append(
            AssemblyAgendaItem(
                sort_order=int(item.sort_order if item.sort_order is not None else index),
                kind=item.kind,
                title=item.title.strip(),
                short_title=(item.short_title or item.title).strip(),
                description=item.description,
                requires_vote=bool(item.requires_vote),
                source_type=item.source_type,
                source_ref=item.source_ref,
                resolution_text=item.resolution_text,
                vote_result=item.vote_result,
            )
        )
    row.agenda = _agenda_summary(items)


def _serialize_assembly(row: Assembly, fund_name: str = "") -> AssemblyResponse | AssemblyListItem:
    payload = dict(
        id=row.id,
        fund_id=row.fund_id,
        type=row.type,
        date=row.date,
        agenda=row.agenda,
        meeting_time=row.meeting_time,
        meeting_method=row.meeting_method,
        location=row.location,
        chair_name=row.chair_name,
        document_number=row.document_number,
        packet_type=row.packet_type,
        include_bylaw_amendment=bool(row.include_bylaw_amendment),
        status=row.status,
        minutes_completed=bool(row.minutes_completed),
        memo=row.memo,
        agenda_items=[
            AssemblyAgendaItemResponse.model_validate(item)
            for item in list(row.agenda_items or [])
        ],
        created_at=row.created_at,
    )
    if fund_name:
        return AssemblyListItem(**payload, fund_name=fund_name)
    return AssemblyResponse(**payload)


@router.get("/api/assemblies", response_model=list[AssemblyListItem])
def list_assemblies(
    fund_id: int | None = None,
    type: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Assembly)
    if fund_id:
        query = query.filter(Assembly.fund_id == fund_id)
    if type:
        query = query.filter(Assembly.type == type)
    if status:
        query = query.filter(Assembly.status == status)
    rows = query.order_by(Assembly.date.desc(), Assembly.id.desc()).all()
    result: list[AssemblyListItem] = []
    for row in rows:
        fund = db.get(Fund, row.fund_id)
        result.append(_serialize_assembly(row, fund.name if fund else ""))
    return result


@router.get("/api/assemblies/{assembly_id}", response_model=AssemblyResponse)
def get_assembly(assembly_id: int, db: Session = Depends(get_db)):
    row = db.get(Assembly, assembly_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assembly not found")
    return _serialize_assembly(row)


@router.post("/api/assemblies", response_model=AssemblyResponse, status_code=201)
def create_assembly(data: AssemblyCreate, db: Session = Depends(get_db)):
    _ensure_fund(db, data.fund_id)
    row = Assembly(
        fund_id=data.fund_id,
        type=data.type,
        date=data.date,
        agenda=data.agenda or _agenda_summary(data.agenda_items),
        meeting_time=data.meeting_time,
        meeting_method=data.meeting_method,
        location=data.location,
        chair_name=data.chair_name,
        document_number=data.document_number,
        packet_type=data.packet_type,
        include_bylaw_amendment=1 if data.include_bylaw_amendment else 0,
        status=data.status,
        minutes_completed=1 if data.minutes_completed else 0,
        memo=data.memo,
    )
    _replace_agenda_items(row, data.agenda_items)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_assembly(row)


@router.put("/api/assemblies/{assembly_id}", response_model=AssemblyResponse)
def update_assembly(assembly_id: int, data: AssemblyUpdate, db: Session = Depends(get_db)):
    row = db.get(Assembly, assembly_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assembly not found")
    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", row.fund_id)
    _ensure_fund(db, next_fund_id)
    for key, value in payload.items():
        if key == "minutes_completed":
            setattr(row, key, 1 if value else 0)
        elif key == "include_bylaw_amendment":
            setattr(row, key, 1 if value else 0)
        elif key == "agenda_items":
            continue
        else:
            setattr(row, key, value)
    if "agenda_items" in payload:
        _replace_agenda_items(row, payload.get("agenda_items"))
    elif "agenda" in payload and payload.get("agenda") is not None:
        row.agenda = payload["agenda"]
    db.commit()
    db.refresh(row)
    return _serialize_assembly(row)


@router.delete("/api/assemblies/{assembly_id}", status_code=204)
def delete_assembly(assembly_id: int, db: Session = Depends(get_db)):
    row = db.get(Assembly, assembly_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assembly not found")
    db.delete(row)
    db.commit()
