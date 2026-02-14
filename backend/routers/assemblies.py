from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.phase3 import Assembly
from schemas.phase3 import AssemblyCreate, AssemblyListItem, AssemblyResponse, AssemblyUpdate

router = APIRouter(tags=["assemblies"])


def _ensure_fund(db: Session, fund_id: int) -> None:
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")


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
        result.append(
            AssemblyListItem(
                id=row.id,
                fund_id=row.fund_id,
                type=row.type,
                date=row.date,
                agenda=row.agenda,
                status=row.status,
                minutes_completed=bool(row.minutes_completed),
                memo=row.memo,
                created_at=row.created_at,
                fund_name=fund.name if fund else "",
            )
        )
    return result


@router.get("/api/assemblies/{assembly_id}", response_model=AssemblyResponse)
def get_assembly(assembly_id: int, db: Session = Depends(get_db)):
    row = db.get(Assembly, assembly_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assembly not found")
    return AssemblyResponse(
        id=row.id,
        fund_id=row.fund_id,
        type=row.type,
        date=row.date,
        agenda=row.agenda,
        status=row.status,
        minutes_completed=bool(row.minutes_completed),
        memo=row.memo,
        created_at=row.created_at,
    )


@router.post("/api/assemblies", response_model=AssemblyResponse, status_code=201)
def create_assembly(data: AssemblyCreate, db: Session = Depends(get_db)):
    _ensure_fund(db, data.fund_id)
    row = Assembly(
        fund_id=data.fund_id,
        type=data.type,
        date=data.date,
        agenda=data.agenda,
        status=data.status,
        minutes_completed=1 if data.minutes_completed else 0,
        memo=data.memo,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AssemblyResponse(
        id=row.id,
        fund_id=row.fund_id,
        type=row.type,
        date=row.date,
        agenda=row.agenda,
        status=row.status,
        minutes_completed=bool(row.minutes_completed),
        memo=row.memo,
        created_at=row.created_at,
    )


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
        else:
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return AssemblyResponse(
        id=row.id,
        fund_id=row.fund_id,
        type=row.type,
        date=row.date,
        agenda=row.agenda,
        status=row.status,
        minutes_completed=bool(row.minutes_completed),
        memo=row.memo,
        created_at=row.created_at,
    )


@router.delete("/api/assemblies/{assembly_id}", status_code=204)
def delete_assembly(assembly_id: int, db: Session = Depends(get_db)):
    row = db.get(Assembly, assembly_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assembly not found")
    db.delete(row)
    db.commit()
