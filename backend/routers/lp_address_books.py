from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.lp_address_book import LPAddressBook
from schemas.lp_address_book import (
    LPAddressBookCreate,
    LPAddressBookRelatedFund,
    LPAddressBookResponse,
    LPAddressBookUpdate,
)

router = APIRouter(tags=["lp_address_books"])


def _normalize_text(value: str | None) -> str:
    return (value or "").strip()


def _normalize_optional(value: str | None) -> str | None:
    text = _normalize_text(value)
    return text or None


def _ensure_row(book_id: int, db: Session) -> LPAddressBook:
    row = db.get(LPAddressBook, book_id)
    if not row:
        raise HTTPException(status_code=404, detail="LP 주소록을 찾을 수 없습니다")
    return row


def _ensure_business_number_unique(db: Session, business_number: str | None, current_id: int | None = None) -> None:
    normalized = _normalize_optional(business_number)
    if not normalized:
        return

    query = db.query(LPAddressBook).filter(LPAddressBook.business_number == normalized)
    if current_id is not None:
        query = query.filter(LPAddressBook.id != current_id)

    conflict = query.first()
    if conflict:
        raise HTTPException(status_code=409, detail="이미 등록된 사업자등록번호입니다")


def _collect_related_funds(db: Session, row: LPAddressBook) -> list[LPAddressBookRelatedFund]:
    conditions = [LP.address_book_id == row.id]
    if row.business_number:
        conditions.append(LP.business_number == row.business_number)
    if row.name:
        conditions.append(LP.name == row.name)

    related = (
        db.query(Fund.id, Fund.name)
        .join(LP, LP.fund_id == Fund.id)
        .filter(or_(*conditions))
        .distinct()
        .order_by(Fund.name.asc(), Fund.id.asc())
        .all()
    )
    return [
        LPAddressBookRelatedFund(
            fund_id=int(item.id),
            fund_name=item.name or f"Fund #{item.id}",
        )
        for item in related
    ]


def _to_response(db: Session, row: LPAddressBook) -> LPAddressBookResponse:
    related_funds = _collect_related_funds(db, row)
    return LPAddressBookResponse(
        id=row.id,
        name=row.name,
        type=row.type,
        contact=row.contact,
        business_number=row.business_number,
        address=row.address,
        memo=row.memo,
        gp_entity_id=row.gp_entity_id,
        is_active=row.is_active,
        created_at=row.created_at,
        updated_at=row.updated_at,
        related_funds_count=len(related_funds),
        related_funds=related_funds,
    )


@router.get("/api/lp-address-books", response_model=list[LPAddressBookResponse])
def list_lp_address_books(
    q: str | None = None,
    is_active: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(LPAddressBook)
    keyword = _normalize_text(q)
    if keyword:
        pattern = f"%{keyword}%"
        query = query.filter(
            or_(
                LPAddressBook.name.ilike(pattern),
                LPAddressBook.type.ilike(pattern),
                LPAddressBook.business_number.ilike(pattern),
                LPAddressBook.address.ilike(pattern),
                LPAddressBook.contact.ilike(pattern),
            )
        )

    if is_active is not None:
        query = query.filter(LPAddressBook.is_active == int(bool(is_active)))

    rows = query.order_by(LPAddressBook.is_active.desc(), LPAddressBook.id.desc()).all()
    return [_to_response(db, row) for row in rows]


@router.get("/api/lp-address-books/{book_id}", response_model=LPAddressBookResponse)
def get_lp_address_book(book_id: int, db: Session = Depends(get_db)):
    row = _ensure_row(book_id, db)
    return _to_response(db, row)


@router.post("/api/lp-address-books", response_model=LPAddressBookResponse, status_code=201)
def create_lp_address_book(data: LPAddressBookCreate, db: Session = Depends(get_db)):
    name = _normalize_text(data.name)
    lp_type = _normalize_text(data.type)
    if not name:
        raise HTTPException(status_code=400, detail="이름은 필수입니다")
    if not lp_type:
        raise HTTPException(status_code=400, detail="유형은 필수입니다")

    _ensure_business_number_unique(db, data.business_number)

    row = LPAddressBook(
        name=name,
        type=lp_type,
        contact=_normalize_optional(data.contact),
        business_number=_normalize_optional(data.business_number),
        address=_normalize_optional(data.address),
        memo=_normalize_optional(data.memo),
        gp_entity_id=data.gp_entity_id,
        is_active=int(bool(data.is_active)),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_response(db, row)


@router.patch("/api/lp-address-books/{book_id}", response_model=LPAddressBookResponse)
def update_lp_address_book(
    book_id: int,
    data: LPAddressBookUpdate,
    db: Session = Depends(get_db),
):
    row = _ensure_row(book_id, db)
    payload = data.model_dump(exclude_unset=True)

    if "name" in payload:
        name = _normalize_text(payload.get("name"))
        if not name:
            raise HTTPException(status_code=400, detail="이름은 빈 값일 수 없습니다")
        payload["name"] = name

    if "type" in payload:
        lp_type = _normalize_text(payload.get("type"))
        if not lp_type:
            raise HTTPException(status_code=400, detail="유형은 빈 값일 수 없습니다")
        payload["type"] = lp_type

    if "business_number" in payload:
        _ensure_business_number_unique(db, payload.get("business_number"), current_id=book_id)
        payload["business_number"] = _normalize_optional(payload.get("business_number"))

    for key in {"contact", "address", "memo"}:
        if key in payload:
            payload[key] = _normalize_optional(payload.get(key))

    if "is_active" in payload and payload["is_active"] is not None:
        payload["is_active"] = int(bool(payload["is_active"]))

    for key, value in payload.items():
        setattr(row, key, value)

    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _to_response(db, row)


@router.delete("/api/lp-address-books/{book_id}")
def deactivate_lp_address_book(
    book_id: int,
    db: Session = Depends(get_db),
):
    row = _ensure_row(book_id, db)
    row.is_active = 0
    row.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
