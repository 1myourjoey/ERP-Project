from datetime import date, datetime
import re
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.phase3 import CapitalCall, CapitalCallItem
from models.task import Task
from models.workflow import Workflow, WorkflowStep
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance
from schemas.phase3 import (
    CapitalCallBatchCreate,
    CapitalCallCreate,
    CapitalCallItemCreate,
    CapitalCallItemListItem,
    CapitalCallItemResponse,
    CapitalCallSummaryResponse,
    CapitalCallItemUpdate,
    CapitalCallListItem,
    CapitalCallResponse,
    CapitalCallUpdate,
)
from services.fund_integrity import (
    recalculate_fund_stats,
    validate_paid_in_deltas,
)
from services.workflow_service import instantiate_workflow

router = APIRouter(tags=["capital_calls"])


CAPITAL_CALL_MEMO_PATTERNS = [
    re.compile(r"\[linked\s*capitalcall\s*:\s*#?(\d+)\]", re.IGNORECASE),
    re.compile(r"\[capitalcall\s*:\s*#?(\d+)\]", re.IGNORECASE),
    re.compile(r"capital_call_id\s*[:=]\s*(\d+)", re.IGNORECASE),
]

INVALID_PAID_AMOUNT_DETAIL = "납입 금액은 0보다 커야 합니다."


def _ensure_fund(db: Session, fund_id: int) -> Fund:
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    return fund


def _normalize_paid_amount(value: int | float | None) -> int:
    amount = int(value or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail=INVALID_PAID_AMOUNT_DETAIL)
    return amount


def _extract_capital_call_id(memo: str | None) -> int | None:
    if not memo:
        return None
    for pattern in CAPITAL_CALL_MEMO_PATTERNS:
        matched = pattern.search(memo)
        if not matched:
            continue
        try:
            return int(matched.group(1))
        except (TypeError, ValueError):
            continue
    return None


def _is_capital_call_payment_step(step_name: str | None) -> bool:
    normalized = "".join((step_name or "").split()).lower()
    return any(
        token in normalized
        for token in (
            "납입확인",
            "입금확인",
            "납부확인",
            "수납확인",
            "paymentconfirmed",
            "paymentconfirm",
        )
    )


def _find_capital_call_workflow_template(db: Session, call_type: str | None) -> Workflow | None:
    normalized_type = (call_type or "").strip().lower()
    if normalized_type == "initial":
        preferred_tokens = ["initial capital call", "initialcall", "최초출자", "초기출자"]
    else:
        preferred_tokens = ["additional capital call", "capital call", "수시출자", "추가출자", "출자요청"]

    templates = db.query(Workflow).order_by(Workflow.id.asc()).all()

    for template in templates:
        name_key = "".join((template.name or "").split()).lower()
        if any(token in name_key for token in preferred_tokens):
            return template

    for template in templates:
        key = " ".join(
            [
                template.name or "",
                template.trigger_description or "",
                template.category or "",
            ]
        ).lower()
        if not any(token in key for token in ("capital call", "출자", "납입")):
            continue
        if any(_is_capital_call_payment_step(step.name) for step in template.steps):
            return template

    for template in templates:
        if any(_is_capital_call_payment_step(step.name) for step in template.steps):
            return template
    return None


def _ensure_capital_call_workflow_template(db: Session, call_type: str | None) -> Workflow:
    template = _find_capital_call_workflow_template(db, call_type)
    if template is not None:
        return template

    normalized_type = _normalize_call_type_key(call_type)
    template_name_map = {
        "initial": "최초 출자요청 결재",
        "최초출자": "최초 출자요청 결재",
        "초기출자": "최초 출자요청 결재",
        "additional": "추가 출자요청 결재",
        "추가출자": "추가 출자요청 결재",
        "수시출자": "추가 출자요청 결재",
    }
    template_name = template_name_map.get(normalized_type, "출자요청 결재")

    workflow = Workflow(
        name=template_name,
        category="출자관리",
        trigger_description="출자요청 발생 시",
        total_duration="약 1주",
    )
    workflow.steps = [
        WorkflowStep(
            order=1,
            name="1. 요청서 검토",
            timing="D-3",
            timing_offset_days=-3,
            estimated_time="1h",
            quadrant="Q1",
            memo=None,
        ),
        WorkflowStep(
            order=2,
            name="2. 납입확인",
            timing="D-day",
            timing_offset_days=0,
            estimated_time="30m",
            quadrant="Q1",
            memo=None,
        ),
        WorkflowStep(
            order=3,
            name="3. 결과 공유",
            timing="D+1",
            timing_offset_days=1,
            estimated_time="30m",
            quadrant="Q2",
            memo=None,
        ),
    ]
    db.add(workflow)
    db.flush()
    return workflow


def _normalize_call_type_key(call_type: str | None) -> str:
    return "".join((call_type or "").strip().lower().split())


def _capital_call_round(db: Session, call: CapitalCall) -> int:
    if call.id is None:
        return 1
    return max(
        1,
        int(
            db.query(CapitalCall)
            .filter(
                CapitalCall.fund_id == call.fund_id,
                or_(
                    CapitalCall.call_date < call.call_date,
                    and_(
                        CapitalCall.call_date == call.call_date,
                        CapitalCall.id <= call.id,
                    ),
                ),
            )
            .count()
        ),
    )


def _build_linked_workflow_name(db: Session, call: CapitalCall, fund: Fund) -> str:
    call_type_map = {
        "initial": "최초",
        "최초출자": "최초",
        "초기출자": "최초",
        "additional": "추가",
        "추가출자": "추가",
        "수시출자": "추가",
        "regular": "정기",
        "정기출자": "정기",
        "manager_closure": "매니저클로징",
        "매니저클로징": "매니저클로징",
        "other": "기타",
        "기타": "기타",
    }
    normalized_type = _normalize_call_type_key(call.call_type)
    type_label = call_type_map.get(normalized_type)
    round_no = _capital_call_round(db, call)
    suffix = "출자요청(Capital Call) 결재"
    if type_label:
        suffix = f"{type_label} {suffix}"
    return f"[{fund.name}] 제{round_no}차 {suffix}"


def _build_linked_workflow_memo(call: CapitalCall, request_memo: str | None) -> str:
    metadata = [
        f"[Linked CapitalCall:#{call.id}]",
        f"[CapitalCall:#{call.id}]",
        f"capital_call_id={call.id}",
        f"fund_id={call.fund_id}",
        f"call_type={call.call_type}",
    ]
    if request_memo and request_memo.strip():
        metadata.append(request_memo.strip())
    return " | ".join(metadata)


def _find_workflow_instance_by_memo_capital_call_id(
    db: Session,
    capital_call_id: int,
) -> WorkflowInstance | None:
    token = str(capital_call_id)
    row = (
        db.query(WorkflowInstance)
        .filter(
            WorkflowInstance.memo.isnot(None),
            or_(
                WorkflowInstance.memo.ilike(f"%capital_call_id={token}%"),
                WorkflowInstance.memo.ilike(f"%capital_call_id:{token}%"),
                WorkflowInstance.memo.ilike(f"%[Linked CapitalCall:#{token}]%"),
                WorkflowInstance.memo.ilike(f"%[CapitalCall:#{token}]%"),
            ),
        )
        .order_by(WorkflowInstance.created_at.desc(), WorkflowInstance.id.desc())
        .first()
    )
    if row:
        return row

    fallback_rows = (
        db.query(WorkflowInstance)
        .filter(WorkflowInstance.memo.isnot(None))
        .order_by(WorkflowInstance.created_at.desc(), WorkflowInstance.id.desc())
        .all()
    )
    for candidate in fallback_rows:
        if _extract_capital_call_id(candidate.memo) == capital_call_id:
            return candidate
    return None


def _resolve_linked_workflow_instance(
    db: Session,
    call: CapitalCall,
) -> WorkflowInstance | None:
    if call.linked_workflow_instance_id is not None:
        instance = db.get(WorkflowInstance, call.linked_workflow_instance_id)
        if instance is not None:
            return instance
    return _find_workflow_instance_by_memo_capital_call_id(db, call.id)


def _serialize_capital_call(call: CapitalCall, db: Session, fund_name: str = "") -> dict:
    linked_instance = _resolve_linked_workflow_instance(db, call)
    linked_id = call.linked_workflow_instance_id
    if linked_id is None and linked_instance is not None:
        linked_id = linked_instance.id

    return {
        "id": call.id,
        "fund_id": call.fund_id,
        "linked_workflow_instance_id": linked_id,
        "linked_workflow_name": linked_instance.name if linked_instance else None,
        "linked_workflow_status": linked_instance.status if linked_instance else None,
        "call_date": call.call_date,
        "call_type": call.call_type,
        "total_amount": call.total_amount,
        "request_percent": call.request_percent,
        "memo": call.memo,
        "created_at": call.created_at,
        "fund_name": fund_name,
    }


def _append_workflow_variance_log(instance: WorkflowInstance, message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[CapitalCallVariance {timestamp}] {message}"
    existing = instance.memo or ""
    instance.memo = f"{existing}\n{line}".strip()


def _complete_payment_step_for_instance(
    db: Session,
    instance: WorkflowInstance,
    note: str | None = None,
) -> bool:
    if instance.status != "active":
        return False

    step_rows = (
        db.query(WorkflowStepInstance)
        .join(WorkflowStep, WorkflowStep.id == WorkflowStepInstance.workflow_step_id)
        .filter(
            WorkflowStepInstance.instance_id == instance.id,
            WorkflowStepInstance.status.in_(["pending", "in_progress"]),
        )
        .order_by(WorkflowStep.order.asc(), WorkflowStepInstance.id.asc())
        .all()
    )
    payment_step = next(
        (
            row
            for row in step_rows
            if row.step is not None and _is_capital_call_payment_step(row.step.name)
        ),
        None,
    )
    if payment_step is None:
        return False

    now = datetime.now()
    payment_step.status = "completed"
    payment_step.completed_at = now
    if note:
        current = payment_step.notes or ""
        payment_step.notes = f"{current}\n{note}".strip()

    if payment_step.task_id:
        task = db.get(Task, payment_step.task_id)
        if task:
            task.status = "completed"
            task.completed_at = now
            if note:
                task.memo = f"{(task.memo or '').strip()}\n[자동 동기화] {note}".strip()

    next_step = (
        db.query(WorkflowStepInstance)
        .join(WorkflowStep, WorkflowStep.id == WorkflowStepInstance.workflow_step_id)
        .filter(
            WorkflowStepInstance.instance_id == instance.id,
            WorkflowStepInstance.status == "pending",
            WorkflowStepInstance.id != payment_step.id,
        )
        .order_by(WorkflowStep.order.asc(), WorkflowStepInstance.id.asc())
        .first()
    )
    if next_step:
        next_step.status = "in_progress"
        if next_step.task_id:
            next_task = db.get(Task, next_step.task_id)
            if next_task and next_task.status == "pending":
                next_task.status = "in_progress"

    if all(step.status in ("completed", "skipped") for step in instance.step_instances):
        instance.status = "completed"
        instance.completed_at = now

    return True


def _create_linked_workflow_instance(
    db: Session,
    call: CapitalCall,
    fund: Fund,
    request_memo: str | None,
) -> WorkflowInstance:
    template = _ensure_capital_call_workflow_template(db, call.call_type)

    instance = instantiate_workflow(
        db,
        template,
        _build_linked_workflow_name(db, call, fund),
        call.call_date,
        _build_linked_workflow_memo(call, request_memo),
        fund_id=call.fund_id,
        auto_commit=False,
    )
    call.linked_workflow_instance_id = instance.id
    return instance


def _assert_capital_call_deletable(db: Session, call: CapitalCall) -> None:
    linked_instance = _resolve_linked_workflow_instance(db, call)
    if linked_instance and linked_instance.status == "active":
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a capital call with an active linked workflow",
        )


@router.get("/api/capital-calls", response_model=list[CapitalCallListItem])
def list_capital_calls(
    fund_id: int | None = None,
    call_type: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(CapitalCall)
    if fund_id:
        query = query.filter(CapitalCall.fund_id == fund_id)
    if call_type:
        query = query.filter(CapitalCall.call_type == call_type)
    rows = query.order_by(CapitalCall.call_date.desc(), CapitalCall.id.desc()).all()
    result: list[CapitalCallListItem] = []
    for row in rows:
        fund = db.get(Fund, row.fund_id)
        result.append(
            CapitalCallListItem(
                **_serialize_capital_call(
                    row,
                    db,
                    fund_name=fund.name if fund else "",
                )
            )
        )
    return result


@router.post("/api/capital-calls/batch", response_model=CapitalCallResponse, status_code=201)
def create_capital_call_batch(data: CapitalCallBatchCreate, db: Session = Depends(get_db)):
    fund = _ensure_fund(db, data.fund_id)
    try:
        item_payloads: list[tuple[CapitalCallItemCreate, int]] = []
        lp_paid_deltas: dict[int, int] = defaultdict(int)

        for item_data in data.items:
            amount = _normalize_paid_amount(item_data.amount)
            lp = db.get(LP, item_data.lp_id)
            if not lp:
                raise HTTPException(status_code=404, detail=f"LP {item_data.lp_id} not found")
            if lp.fund_id != data.fund_id:
                raise HTTPException(status_code=409, detail="LP must belong to the same fund")
            if item_data.paid:
                lp_paid_deltas[item_data.lp_id] += amount
            item_payloads.append((item_data, amount))

        validate_paid_in_deltas(db, data.fund_id, dict(lp_paid_deltas))

        call = CapitalCall(
            fund_id=data.fund_id,
            call_date=data.call_date,
            call_type=data.call_type,
            total_amount=data.total_amount,
            request_percent=data.request_percent,
            memo=data.memo,
        )
        db.add(call)
        db.flush()

        for item_data, amount in item_payloads:
            row = CapitalCallItem(
                capital_call_id=call.id,
                lp_id=item_data.lp_id,
                amount=amount,
                paid=1 if item_data.paid else 0,
                paid_date=item_data.paid_date or (date.today() if item_data.paid else None),
                memo=item_data.memo,
            )
            db.add(row)

        if data.create_workflow:
            _create_linked_workflow_instance(db, call, fund, data.memo)

        db.flush()
        recalculate_fund_stats(db, data.fund_id)
        db.commit()
        db.refresh(call)
        return CapitalCallResponse(**_serialize_capital_call(call, db))
    except Exception:
        db.rollback()
        raise


@router.get("/api/capital-calls/{capital_call_id}", response_model=CapitalCallResponse)
def get_capital_call(capital_call_id: int, db: Session = Depends(get_db)):
    row = db.get(CapitalCall, capital_call_id)
    if not row:
        raise HTTPException(status_code=404, detail="Capital call not found")
    return CapitalCallResponse(**_serialize_capital_call(row, db))


@router.post("/api/capital-calls", response_model=CapitalCallResponse, status_code=201)
def create_capital_call(data: CapitalCallCreate, db: Session = Depends(get_db)):
    _ensure_fund(db, data.fund_id)
    row = CapitalCall(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return CapitalCallResponse(**_serialize_capital_call(row, db))


@router.put("/api/capital-calls/{capital_call_id}", response_model=CapitalCallResponse)
def update_capital_call(capital_call_id: int, data: CapitalCallUpdate, db: Session = Depends(get_db)):
    row = db.get(CapitalCall, capital_call_id)
    if not row:
        raise HTTPException(status_code=404, detail="Capital call not found")
    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", row.fund_id)
    _ensure_fund(db, next_fund_id)
    for key, value in payload.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return CapitalCallResponse(**_serialize_capital_call(row, db))


@router.delete("/api/capital-calls/{capital_call_id}", status_code=204)
def delete_capital_call(capital_call_id: int, db: Session = Depends(get_db)):
    row = db.get(CapitalCall, capital_call_id)
    if not row:
        raise HTTPException(status_code=404, detail="Capital call not found")
    _assert_capital_call_deletable(db, row)
    fund_id = row.fund_id
    db.delete(row)
    db.flush()
    recalculate_fund_stats(db, fund_id)
    db.commit()


@router.get(
    "/api/capital-calls/{capital_call_id}/items",
    response_model=list[CapitalCallItemListItem],
)
def list_capital_call_items(capital_call_id: int, db: Session = Depends(get_db)):
    call = db.get(CapitalCall, capital_call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Capital call not found")
    rows = (
        db.query(CapitalCallItem)
        .filter(CapitalCallItem.capital_call_id == capital_call_id)
        .order_by(CapitalCallItem.id.desc())
        .all()
    )
    result: list[CapitalCallItemListItem] = []
    for row in rows:
        lp = db.get(LP, row.lp_id)
        result.append(
            CapitalCallItemListItem(
                id=row.id,
                capital_call_id=row.capital_call_id,
                lp_id=row.lp_id,
                amount=row.amount,
                paid=bool(row.paid),
                paid_date=row.paid_date,
                memo=row.memo,
                lp_name=lp.name if lp else "",
            )
        )
    return result


@router.post(
    "/api/capital-calls/{capital_call_id}/items",
    response_model=CapitalCallItemResponse,
    status_code=201,
)
def create_capital_call_item(capital_call_id: int, data: CapitalCallItemCreate, db: Session = Depends(get_db)):
    call = db.get(CapitalCall, capital_call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Capital call not found")
    amount = _normalize_paid_amount(data.amount)
    lp = db.get(LP, data.lp_id)
    if not lp:
        raise HTTPException(status_code=404, detail="LP not found")
    if lp.fund_id != call.fund_id:
        raise HTTPException(status_code=409, detail="LP must belong to the same fund")

    try:
        if data.paid:
            validate_paid_in_deltas(db, call.fund_id, {data.lp_id: amount})

        row = CapitalCallItem(
            capital_call_id=capital_call_id,
            lp_id=data.lp_id,
            amount=amount,
            paid=1 if data.paid else 0,
            paid_date=data.paid_date or (date.today() if data.paid else None),
            memo=data.memo,
        )
        db.add(row)
        db.flush()
        recalculate_fund_stats(db, call.fund_id)
        db.commit()
        db.refresh(row)
        return CapitalCallItemResponse(
            id=row.id,
            capital_call_id=row.capital_call_id,
            lp_id=row.lp_id,
            amount=row.amount,
            paid=bool(row.paid),
            paid_date=row.paid_date,
            memo=row.memo,
        )
    except Exception:
        db.rollback()
        raise


@router.put(
    "/api/capital-calls/{capital_call_id}/items/{item_id}",
    response_model=CapitalCallItemResponse,
)
def update_capital_call_item(
    capital_call_id: int,
    item_id: int,
    data: CapitalCallItemUpdate,
    db: Session = Depends(get_db),
):
    call = db.get(CapitalCall, capital_call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Capital call not found")
    row = db.get(CapitalCallItem, item_id)
    if not row or row.capital_call_id != capital_call_id:
        raise HTTPException(status_code=404, detail="Capital call item not found")

    payload = data.model_dump(exclude_unset=True)
    sync_workflow = bool(payload.pop("sync_workflow", False))
    if "amount" in payload:
        payload["amount"] = _normalize_paid_amount(payload["amount"])

    old_paid = bool(row.paid)
    old_paid_amount = int(row.amount or 0) if old_paid else 0

    next_lp_id = payload.get("lp_id", row.lp_id)
    lp = db.get(LP, next_lp_id)
    if not lp:
        raise HTTPException(status_code=404, detail="LP not found")
    if lp.fund_id != call.fund_id:
        raise HTTPException(status_code=409, detail="LP must belong to the same fund")

    next_paid = bool(payload.get("paid", old_paid))
    next_amount = int(payload.get("amount", row.amount))
    new_paid_amount = next_amount if next_paid else 0
    if next_paid and next_amount <= 0:
        raise HTTPException(status_code=400, detail=INVALID_PAID_AMOUNT_DETAIL)

    lp_paid_deltas: dict[int, int] = defaultdict(int)
    if old_paid_amount:
        lp_paid_deltas[row.lp_id] -= old_paid_amount
    if new_paid_amount:
        lp_paid_deltas[next_lp_id] += new_paid_amount

    try:
        validate_paid_in_deltas(db, call.fund_id, dict(lp_paid_deltas))

        for key, value in payload.items():
            if key == "paid":
                setattr(row, key, 1 if value else 0)
            else:
                setattr(row, key, value)

        if "paid" in payload:
            if bool(row.paid) and row.paid_date is None:
                row.paid_date = date.today()
            if not bool(row.paid):
                row.paid_date = None

        db.flush()

        new_paid = bool(row.paid)
        if old_paid != new_paid:
            linked_instance = _resolve_linked_workflow_instance(db, call)
            if linked_instance:
                message = (
                    f"CapitalCallItem #{row.id} manually changed payment status "
                    f"from {old_paid} to {new_paid}"
                )
                _append_workflow_variance_log(linked_instance, message)
                if sync_workflow and new_paid:
                    progressed = _complete_payment_step_for_instance(
                        db,
                        linked_instance,
                        note=f"Manual sync from CapitalCallItem #{row.id}",
                    )
                    if not progressed:
                        _append_workflow_variance_log(
                            linked_instance,
                            "sync_workflow requested but no pending payment step was found",
                        )

        recalculate_fund_stats(db, call.fund_id)
        db.commit()
        db.refresh(row)
        return CapitalCallItemResponse(
            id=row.id,
            capital_call_id=row.capital_call_id,
            lp_id=row.lp_id,
            amount=row.amount,
            paid=bool(row.paid),
            paid_date=row.paid_date,
            memo=row.memo,
        )
    except Exception:
        db.rollback()
        raise


@router.delete("/api/capital-calls/{capital_call_id}/items/{item_id}", status_code=204)
def delete_capital_call_item(capital_call_id: int, item_id: int, db: Session = Depends(get_db)):
    row = db.get(CapitalCallItem, item_id)
    if not row or row.capital_call_id != capital_call_id:
        raise HTTPException(status_code=404, detail="Capital call item not found")
    call = db.get(CapitalCall, capital_call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Capital call not found")
    db.delete(row)
    db.flush()
    recalculate_fund_stats(db, call.fund_id)
    db.commit()


@router.get("/api/capital-calls/summary/{fund_id}", response_model=CapitalCallSummaryResponse)
def get_capital_call_summary(fund_id: int, db: Session = Depends(get_db)):
    fund = _ensure_fund(db, fund_id)
    today = date.today()
    calls = (
        db.query(CapitalCall)
        .filter(CapitalCall.fund_id == fund_id)
        .order_by(CapitalCall.call_date.asc(), CapitalCall.id.asc())
        .all()
    )
    call_ids = [row.id for row in calls]
    items = (
        db.query(CapitalCallItem)
        .filter(CapitalCallItem.capital_call_id.in_(call_ids))
        .all()
        if call_ids
        else []
    )
    items_by_call: dict[int, list[CapitalCallItem]] = {}
    for item in items:
        items_by_call.setdefault(item.capital_call_id, []).append(item)

    rows: list[dict] = []
    for idx, call in enumerate(calls, start=1):
        call_items = items_by_call.get(call.id, [])
        paid_items = [item for item in call_items if bool(item.paid)]
        paid_count = len(paid_items)
        total_count = len(call_items)
        paid_amount = sum(float(item.amount or 0) for item in paid_items)
        paid_dates = [item.paid_date for item in paid_items if item.paid_date is not None]
        latest_paid_date = max(paid_dates) if paid_dates else None
        is_fully_paid = total_count > 0 and paid_count == total_count
        paid_on_time = is_fully_paid and all(
            item.paid_date is not None and item.paid_date <= call.call_date
            for item in paid_items
        )
        is_due = call.call_date <= today
        is_overdue_unpaid = is_due and not is_fully_paid
        commitment_total = float(fund.commitment_total or 0)
        commitment_ratio = (
            round((float(call.total_amount or 0) / commitment_total) * 100, 1)
            if commitment_total
            else 0
        )
        rows.append(
            {
                "id": call.id,
                "round": idx,
                "call_date": call.call_date.isoformat() if call.call_date else None,
                "call_type": call.call_type,
                "total_amount": float(call.total_amount or 0),
                "request_percent": call.request_percent,
                "paid_count": paid_count,
                "total_count": total_count,
                "paid_amount": paid_amount,
                "latest_paid_date": latest_paid_date.isoformat() if latest_paid_date else None,
                "is_fully_paid": is_fully_paid,
                "paid_on_time": paid_on_time,
                "is_due": is_due,
                "is_overdue_unpaid": is_overdue_unpaid,
                "commitment_ratio": commitment_ratio,
                "memo": call.memo,
            }
        )

    return {
        "fund_id": fund_id,
        "commitment_total": float(fund.commitment_total or 0),
        "total_paid_in": sum(float(row["paid_amount"] or 0) for row in rows),
        "calls": rows,
    }
