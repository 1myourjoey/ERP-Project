from datetime import date

from sqlalchemy.orm import Session

from models.fund import LP, LPTransfer


def apply_lp_transfer_completion(db: Session, transfer: LPTransfer) -> LPTransfer:
    if transfer.status == "completed":
        return transfer

    from_lp = db.get(LP, transfer.from_lp_id)
    if not from_lp:
        raise ValueError("양도 LP를 찾을 수 없습니다")
    if from_lp.fund_id != transfer.fund_id:
        raise ValueError("양도 LP와 조합 정보가 일치하지 않습니다")

    amount = int(transfer.transfer_amount or 0)
    if amount <= 0:
        raise ValueError("양도 금액이 올바르지 않습니다")

    from_commitment_before = int(from_lp.commitment or 0)
    from_paid_in_before = int(from_lp.paid_in or 0)
    if from_commitment_before < amount:
        raise ValueError("양도 금액이 양도 LP 약정액을 초과합니다")

    to_lp: LP | None = None
    if transfer.to_lp_id:
        to_lp = db.get(LP, transfer.to_lp_id)
        if not to_lp:
            raise ValueError("양수 LP를 찾을 수 없습니다")
        if to_lp.fund_id != transfer.fund_id:
            raise ValueError("양수 LP와 조합 정보가 일치하지 않습니다")
    else:
        to_name = (transfer.to_lp_name or "").strip()
        to_type = (transfer.to_lp_type or "").strip()
        if not to_name:
            raise ValueError("신규 양수 LP명은 필수입니다")
        if not to_type:
            raise ValueError("신규 양수 LP 유형은 필수입니다")
        to_lp = LP(
            fund_id=transfer.fund_id,
            name=to_name,
            type=to_type,
            commitment=0,
            paid_in=0,
            contact=(transfer.to_lp_contact or "").strip() or None,
            business_number=(transfer.to_lp_business_number or "").strip() or None,
            address=(transfer.to_lp_address or "").strip() or None,
        )
        db.add(to_lp)
        db.flush()
        transfer.to_lp_id = to_lp.id

    to_commitment_before = int(to_lp.commitment or 0)
    to_paid_in_before = int(to_lp.paid_in or 0)

    paid_in_to_transfer = 0
    if from_commitment_before > 0 and from_paid_in_before > 0:
        paid_in_to_transfer = int(round(from_paid_in_before * (amount / from_commitment_before)))
        paid_in_to_transfer = min(paid_in_to_transfer, from_paid_in_before)

    from_lp.commitment = from_commitment_before - amount
    from_lp.paid_in = max(0, from_paid_in_before - paid_in_to_transfer)

    to_lp.commitment = to_commitment_before + amount
    to_lp.paid_in = to_paid_in_before + paid_in_to_transfer

    transfer.status = "completed"
    if transfer.transfer_date is None:
        transfer.transfer_date = date.today()
    return transfer


def apply_transfer_by_workflow_instance_id(
    db: Session,
    workflow_instance_id: int,
) -> LPTransfer | None:
    transfer = (
        db.query(LPTransfer)
        .filter(LPTransfer.workflow_instance_id == workflow_instance_id)
        .order_by(LPTransfer.id.desc())
        .first()
    )
    if not transfer:
        return None
    return apply_lp_transfer_completion(db, transfer)
