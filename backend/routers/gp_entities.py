from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.gp_entity import GPEntity
from schemas.gp_entity import GPEntityCreate, GPEntityResponse, GPEntityUpdate

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
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/gp-entities/{entity_id}", response_model=GPEntityResponse)
def update_gp_entity(entity_id: int, data: GPEntityUpdate, db: Session = Depends(get_db)):
    row = db.get(GPEntity, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="고유계정을 찾을 수 없습니다")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/gp-entities/{entity_id}", status_code=204)
def delete_gp_entity(entity_id: int, db: Session = Depends(get_db)):
    row = db.get(GPEntity, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="고유계정을 찾을 수 없습니다")
    db.delete(row)
    db.commit()
