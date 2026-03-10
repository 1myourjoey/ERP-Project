from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.gp_entity import GPEntity
from schemas.gp_entity import GPEntityCreate, GPEntityResponse, GPEntityUpdate
from services.erp_backbone import backbone_enabled, mark_subject_deleted, maybe_emit_mutation, record_snapshot, sync_gp_entity_graph
from services.proposal_data import sync_fund_history, sync_gp_entity_history

router = APIRouter(tags=["gp_entities"])


@router.get("/api/gp-entities", response_model=list[GPEntityResponse])
def list_gp_entities(db: Session = Depends(get_db)):
    return (
        db.query(GPEntity)
        .order_by(GPEntity.is_primary.desc(), GPEntity.id.desc())
        .all()
    )


@router.get("/api/gp-entities/{entity_id}", response_model=GPEntityResponse)
def get_gp_entity(entity_id: int, db: Session = Depends(get_db)):
    row = db.get(GPEntity, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="고유계정을 찾을 수 없습니다")
    return row


@router.post("/api/gp-entities", response_model=GPEntityResponse, status_code=201)
def create_gp_entity(data: GPEntityCreate, db: Session = Depends(get_db)):
    row = GPEntity(**data.model_dump())
    db.add(row)
    db.flush()
    sync_gp_entity_history(db, row)
    if backbone_enabled():
        subject = sync_gp_entity_graph(db, row)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="gp_entity.created",
            after=record_snapshot(row),
            origin_model="gp_entity",
            origin_id=row.id,
        )
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/gp-entities/{entity_id}", response_model=GPEntityResponse)
def update_gp_entity(entity_id: int, data: GPEntityUpdate, db: Session = Depends(get_db)):
    row = db.get(GPEntity, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="고유계정을 찾을 수 없습니다")
    before = record_snapshot(row)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    linked_funds = db.query(Fund).filter(Fund.gp_entity_id == row.id).all()
    for fund in linked_funds:
        fund.gp = row.name
        sync_fund_history(db, fund)
    sync_gp_entity_history(db, row)
    if backbone_enabled():
        subject = sync_gp_entity_graph(db, row)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="gp_entity.updated",
            before=before,
            after=record_snapshot(row),
            origin_model="gp_entity",
            origin_id=row.id,
        )
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/gp-entities/{entity_id}", status_code=204)
def delete_gp_entity(entity_id: int, db: Session = Depends(get_db)):
    row = db.get(GPEntity, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="고유계정을 찾을 수 없습니다")
    before = record_snapshot(row)
    if backbone_enabled():
        subject = mark_subject_deleted(db, subject_type="gp_entity", native_id=row.id, payload=before)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="gp_entity.deleted",
            before=before,
            origin_model="gp_entity",
            origin_id=row.id,
        )
    db.delete(row)
    db.commit()
