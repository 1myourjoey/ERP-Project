from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP, LPTransfer
from models.workflow import Workflow, WorkflowStep
from models.workflow_instance import WorkflowInstance
from schemas.lp_transfer import (
    LPTransferCompleteRequest,
    LPTransferCreate,
    LPTransferResponse,
    LPTransferUpdate,
)
from services.lp_transfer_service import apply_lp_transfer_completion
from services.workflow_service import instantiate_workflow

router = APIRouter(tags=["lp_transfers"])

LP_TRANSFER_WORKFLOW_NAME = "LP 양수양도"
LP_TRANSFER_WORKFLOW_CATEGORY = "LP교체"
LP_TRANSFER_STEPS = [
    ("조합원총회 공문 발송 (14일 이전, 규약 체크)", -14, "Q1"),
    ("의안설명서 준비 (공문 전)", -13, "Q1"),
    ("양도양수계획서 작성 (공문 전, 보충서류 추가 가능)", -12, "Q1"),
    ("우선매수권 행사 확인서 (공문 전)", -11, "Q1"),
    ("서면결의서 준비 (공문 전)", -10, "Q1"),
    ("조합 규약(개정안) 작성 (공문 전)", -9, "Q1"),
    ("규약신구대조표 작성 (엑셀)", -8, "Q2"),
    ("캐피탈콜 진행 (변경등록 전, 총회 가결시 가능)", -1, "Q1"),
    ("조합원총회 공문 발송 (14일 이전)", 0, "Q1"),
    ("의안설명서 작성 (주제별 구성)", 1, "Q1"),
    ("서면의결서 준비 (의결 표 구성)", 2, "Q1"),
    ("규약 개정본 작성 (목차, 페이지 확인)", 3, "Q1"),
    ("규약 신구대조표 작성 (대조, 비고 간략)", 4, "Q2"),
]


def _ensure_fund(db: Session, fund_id: int) -> Fund:
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    return fund


def _build_transfer_response(db: Session, transfer: LPTransfer) -> LPTransferResponse:
    from_lp = db.get(LP, transfer.from_lp_id) if transfer.from_lp_id else None
    to_lp = db.get(LP, transfer.to_lp_id) if transfer.to_lp_id else None
    return LPTransferResponse(
        id=transfer.id,
        fund_id=transfer.fund_id,
        from_lp_id=transfer.from_lp_id,
        from_lp_name=from_lp.name if from_lp else None,
        to_lp_id=transfer.to_lp_id,
        to_lp_name=(to_lp.name if to_lp else None) or transfer.to_lp_name,
        to_lp_type=(to_lp.type if to_lp else None) or transfer.to_lp_type,
        to_lp_business_number=(to_lp.business_number if to_lp else None) or transfer.to_lp_business_number,
        to_lp_address=(to_lp.address if to_lp else None) or transfer.to_lp_address,
        to_lp_contact=(to_lp.contact if to_lp else None) or transfer.to_lp_contact,
        transfer_amount=transfer.transfer_amount,
        transfer_date=transfer.transfer_date,
        status=transfer.status,
        workflow_instance_id=transfer.workflow_instance_id,
        notes=transfer.notes,
        created_at=transfer.created_at,
    )


def _ensure_lp_transfer_workflow_template(db: Session) -> Workflow:
    existing = (
        db.query(Workflow)
        .filter(
            Workflow.category == LP_TRANSFER_WORKFLOW_CATEGORY,
            Workflow.name == LP_TRANSFER_WORKFLOW_NAME,
        )
        .first()
    )
    if existing:
        return existing

    workflow = Workflow(
        name=LP_TRANSFER_WORKFLOW_NAME,
        category=LP_TRANSFER_WORKFLOW_CATEGORY,
        trigger_description="LP 양수양도 발생 시",
        total_duration="약 2~4주",
    )
    for order, (name, offset_days, quadrant) in enumerate(LP_TRANSFER_STEPS, start=1):
        workflow.steps.append(
            WorkflowStep(
                order=order,
                name=name,
                timing=f"D{offset_days:+d}" if offset_days != 0 else "D-day",
                timing_offset_days=offset_days,
                estimated_time="1h",
                quadrant=quadrant,
                memo=None,
            )
        )
    db.add(workflow)
    db.flush()
    return workflow


@router.get("/api/funds/{fund_id}/lp-transfers", response_model=list[LPTransferResponse])
def list_lp_transfers(fund_id: int, db: Session = Depends(get_db)):
    _ensure_fund(db, fund_id)
    rows = (
        db.query(LPTransfer)
        .filter(LPTransfer.fund_id == fund_id)
        .order_by(LPTransfer.id.desc())
        .all()
    )
    return [_build_transfer_response(db, row) for row in rows]


@router.post("/api/funds/{fund_id}/lp-transfers", response_model=LPTransferResponse, status_code=201)
def create_lp_transfer(
    fund_id: int,
    data: LPTransferCreate,
    db: Session = Depends(get_db),
):
    fund = _ensure_fund(db, fund_id)
    from_lp = db.get(LP, data.from_lp_id)
    if not from_lp or from_lp.fund_id != fund_id:
        raise HTTPException(status_code=404, detail="양도 LP를 찾을 수 없습니다")
    if int(from_lp.commitment or 0) < int(data.transfer_amount or 0):
        raise HTTPException(status_code=400, detail="양도 금액이 양도 LP 약정액을 초과합니다")

    to_lp: LP | None = None
    if data.to_lp_id is not None:
        to_lp = db.get(LP, data.to_lp_id)
        if not to_lp or to_lp.fund_id != fund_id:
            raise HTTPException(status_code=404, detail="양수 LP를 찾을 수 없습니다")
        if to_lp.id == from_lp.id:
            raise HTTPException(status_code=400, detail="양도 LP와 양수 LP가 동일할 수 없습니다")
    elif not (data.to_lp_name and data.to_lp_type):
        raise HTTPException(status_code=400, detail="신규 양수 LP명과 유형을 입력해 주세요")

    transfer = LPTransfer(
        fund_id=fund_id,
        from_lp_id=data.from_lp_id,
        to_lp_id=data.to_lp_id,
        to_lp_name=(to_lp.name if to_lp else data.to_lp_name),
        to_lp_type=(to_lp.type if to_lp else data.to_lp_type),
        to_lp_business_number=(to_lp.business_number if to_lp else data.to_lp_business_number),
        to_lp_address=(to_lp.address if to_lp else data.to_lp_address),
        to_lp_contact=(to_lp.contact if to_lp else data.to_lp_contact),
        transfer_amount=data.transfer_amount,
        transfer_date=data.transfer_date,
        status="pending",
        notes=data.notes,
    )
    db.add(transfer)
    db.flush()

    template = _ensure_lp_transfer_workflow_template(db)
    trigger_date = data.transfer_date or date.today()
    instance = instantiate_workflow(
        db=db,
        workflow=template,
        name=f"{fund.name} LP 양수양도 - {from_lp.name}",
        trigger_date=trigger_date,
        memo=f"lp_transfer_id={transfer.id}",
        fund_id=fund_id,
    )

    transfer.workflow_instance_id = instance.id
    transfer.status = "in_progress"
    db.commit()
    db.refresh(transfer)
    return _build_transfer_response(db, transfer)


@router.patch("/api/funds/{fund_id}/lp-transfers/{transfer_id}", response_model=LPTransferResponse)
def update_lp_transfer(
    fund_id: int,
    transfer_id: int,
    data: LPTransferUpdate,
    db: Session = Depends(get_db),
):
    _ensure_fund(db, fund_id)
    transfer = db.get(LPTransfer, transfer_id)
    if not transfer or transfer.fund_id != fund_id:
        raise HTTPException(status_code=404, detail="LP 양수양도 이력을 찾을 수 없습니다")

    payload = data.model_dump(exclude_unset=True)
    if "status" in payload:
        allowed = {"pending", "in_progress", "completed", "cancelled"}
        if payload["status"] not in allowed:
            raise HTTPException(status_code=400, detail="지원하지 않는 상태값입니다")
    for key, value in payload.items():
        setattr(transfer, key, value)

    db.commit()
    db.refresh(transfer)
    return _build_transfer_response(db, transfer)


@router.post("/api/funds/{fund_id}/lp-transfers/{transfer_id}/complete", response_model=LPTransferResponse)
def complete_lp_transfer(
    fund_id: int,
    transfer_id: int,
    data: LPTransferCompleteRequest,
    db: Session = Depends(get_db),
):
    _ensure_fund(db, fund_id)
    transfer = db.get(LPTransfer, transfer_id)
    if not transfer or transfer.fund_id != fund_id:
        raise HTTPException(status_code=404, detail="LP 양수양도 이력을 찾을 수 없습니다")

    if data.notes is not None:
        transfer.notes = data.notes
    if data.transfer_date is not None:
        transfer.transfer_date = data.transfer_date

    try:
        apply_lp_transfer_completion(db, transfer)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if transfer.workflow_instance_id:
        instance = db.get(WorkflowInstance, transfer.workflow_instance_id)
        if instance and instance.status != "completed":
            for step in instance.step_instances:
                if step.status not in ("completed", "skipped"):
                    step.status = "completed"
            instance.status = "completed"
            instance.completed_at = datetime.now()

    db.commit()
    db.refresh(transfer)
    return _build_transfer_response(db, transfer)
