from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.checklist import Checklist, ChecklistItem
from schemas.checklist import (
    ChecklistCreate,
    ChecklistUpdate,
    ChecklistListItem,
    ChecklistResponse,
    ChecklistItemCreate,
    ChecklistItemUpdate,
    ChecklistItemResponse,
)

router = APIRouter(tags=["checklists"])


@router.get("/api/checklists", response_model=list[ChecklistListItem])
def list_checklists(db: Session = Depends(get_db)):
    checklists = db.query(Checklist).order_by(Checklist.id.desc()).all()
    return [
        ChecklistListItem(
            id=cl.id,
            name=cl.name,
            category=cl.category,
            total_items=len(cl.items),
            checked_items=sum(1 for item in cl.items if item.checked),
        )
        for cl in checklists
    ]


@router.get("/api/checklists/{checklist_id}", response_model=ChecklistResponse)
def get_checklist(checklist_id: int, db: Session = Depends(get_db)):
    checklist = db.get(Checklist, checklist_id)
    if not checklist:
        raise HTTPException(404, "Checklist not found")
    return checklist


@router.post("/api/checklists", response_model=ChecklistResponse, status_code=201)
def create_checklist(data: ChecklistCreate, db: Session = Depends(get_db)):
    checklist = Checklist(name=data.name, category=data.category)
    for item in data.items:
        checklist.items.append(ChecklistItem(
            order=item.order,
            name=item.name,
            required=item.required,
            checked=item.checked,
            notes=item.notes,
        ))

    db.add(checklist)
    db.commit()
    db.refresh(checklist)
    return checklist


@router.put("/api/checklists/{checklist_id}", response_model=ChecklistResponse)
def update_checklist(checklist_id: int, data: ChecklistUpdate, db: Session = Depends(get_db)):
    checklist = db.get(Checklist, checklist_id)
    if not checklist:
        raise HTTPException(404, "Checklist not found")

    payload = data.model_dump(exclude_unset=True)
    if "name" in payload:
        checklist.name = payload["name"]
    if "category" in payload:
        checklist.category = payload["category"]

    if "items" in payload and payload["items"] is not None:
        checklist.items.clear()
        for item in payload["items"]:
            checklist.items.append(ChecklistItem(
                order=item["order"],
                name=item["name"],
                required=item.get("required", True),
                checked=item.get("checked", False),
                notes=item.get("notes"),
            ))

    db.commit()
    db.refresh(checklist)
    return checklist


@router.delete("/api/checklists/{checklist_id}", status_code=204)
def delete_checklist(checklist_id: int, db: Session = Depends(get_db)):
    checklist = db.get(Checklist, checklist_id)
    if not checklist:
        raise HTTPException(404, "Checklist not found")

    db.delete(checklist)
    db.commit()


@router.post("/api/checklists/{checklist_id}/items", response_model=ChecklistItemResponse, status_code=201)
def create_checklist_item(checklist_id: int, data: ChecklistItemCreate, db: Session = Depends(get_db)):
    checklist = db.get(Checklist, checklist_id)
    if not checklist:
        raise HTTPException(404, "Checklist not found")

    item = ChecklistItem(checklist_id=checklist_id, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/api/checklists/{checklist_id}/items/{item_id}", response_model=ChecklistItemResponse)
def update_checklist_item(checklist_id: int, item_id: int, data: ChecklistItemUpdate, db: Session = Depends(get_db)):
    item = db.get(ChecklistItem, item_id)
    if not item or item.checklist_id != checklist_id:
        raise HTTPException(404, "Checklist item not found")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(item, key, val)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/api/checklists/{checklist_id}/items/{item_id}", status_code=204)
def delete_checklist_item(checklist_id: int, item_id: int, db: Session = Depends(get_db)):
    item = db.get(ChecklistItem, item_id)
    if not item or item.checklist_id != checklist_id:
        raise HTTPException(404, "Checklist item not found")

    db.delete(item)
    db.commit()
