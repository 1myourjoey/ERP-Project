from __future__ import annotations

import tempfile
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user
from models.accounting import Account
from models.auto_mapping_rule import AutoMappingRule
from models.bank_transaction import BankTransaction
from models.fund import Fund
from models.provisional_fs import ProvisionalFS
from models.user import User
from services.auto_journal import AutoJournalService
from services.bank_statement_parser import BankStatementParser
from services.fs_excel_exporter import FSExcelExporter
from services.provisional_fs_service import ProvisionalFSService
from seeds.default_mapping_rules import seed_default_mapping_rules
from seeds.fund_accounts import ensure_fund_standard_accounts

router = APIRouter(tags=["provisional_fs"])


class ParseClipboardRequest(BaseModel):
    text: str
    account_number: str | None = None


class AutoJournalRequest(BaseModel):
    year_month: str | None = None


class ManualMapRequest(BaseModel):
    debit_account_id: int
    credit_account_id: int
    description: str | None = None
    learn: bool = True


class MappingRuleCreateRequest(BaseModel):
    keyword: str
    direction: str
    debit_account_id: int
    credit_account_id: int
    description_template: str | None = None
    priority: int = 0
    is_active: bool = True


class MappingRuleUpdateRequest(BaseModel):
    keyword: str | None = None
    direction: str | None = None
    debit_account_id: int | None = None
    credit_account_id: int | None = None
    description_template: str | None = None
    priority: int | None = None
    is_active: bool | None = None


class GenerateFSRequest(BaseModel):
    year_month: str


def _to_float(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _serialize_bank_txn(txn: BankTransaction) -> dict:
    return {
        "id": txn.id,
        "fund_id": txn.fund_id,
        "transaction_date": txn.transaction_date.isoformat() if txn.transaction_date else None,
        "withdrawal": _to_float(txn.withdrawal),
        "deposit": _to_float(txn.deposit),
        "balance_after": _to_float(txn.balance_after) if txn.balance_after is not None else None,
        "description": txn.description,
        "counterparty": txn.counterparty,
        "bank_branch": txn.bank_branch,
        "account_number": txn.account_number,
        "journal_entry_id": txn.journal_entry_id,
        "auto_mapped": bool(txn.auto_mapped),
        "mapping_rule_id": txn.mapping_rule_id,
        "year_month": txn.year_month,
        "created_at": txn.created_at.isoformat() if txn.created_at else None,
    }


def _serialize_mapping_rule(rule: AutoMappingRule, db: Session) -> dict:
    debit = db.get(Account, rule.debit_account_id)
    credit = db.get(Account, rule.credit_account_id)
    return {
        "id": rule.id,
        "fund_id": rule.fund_id,
        "keyword": rule.keyword,
        "direction": rule.direction,
        "debit_account_id": rule.debit_account_id,
        "credit_account_id": rule.credit_account_id,
        "debit_account_name": debit.name if debit else None,
        "credit_account_name": credit.name if credit else None,
        "description_template": rule.description_template,
        "priority": rule.priority,
        "use_count": rule.use_count,
        "is_active": bool(rule.is_active),
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
    }


def _serialize_fs(fs: ProvisionalFS) -> dict:
    import json

    def _json_load(raw: str | None) -> dict:
        if not raw:
            return {}
        try:
            value = json.loads(raw)
            return value if isinstance(value, dict) else {}
        except Exception:  # noqa: BLE001
            return {}

    return {
        "id": fs.id,
        "fund_id": fs.fund_id,
        "year_month": fs.year_month,
        "status": fs.status,
        "sfp_data": _json_load(fs.sfp_data),
        "is_data": _json_load(fs.is_data),
        "total_assets": _to_float(fs.total_assets) if fs.total_assets is not None else None,
        "total_liabilities": _to_float(fs.total_liabilities) if fs.total_liabilities is not None else None,
        "total_equity": _to_float(fs.total_equity) if fs.total_equity is not None else None,
        "net_income": _to_float(fs.net_income) if fs.net_income is not None else None,
        "confirmed_at": fs.confirmed_at.isoformat() if fs.confirmed_at else None,
        "confirmed_by": fs.confirmed_by,
        "created_at": fs.created_at.isoformat() if fs.created_at else None,
        "updated_at": fs.updated_at.isoformat() if fs.updated_at else None,
    }


def _validate_fund(fund_id: int, db: Session) -> Fund:
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    return fund


def _validate_account(account_id: int, db: Session) -> Account:
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


def _ensure_baseline(fund_id: int, db: Session) -> None:
    ensure_fund_standard_accounts(db, fund_id)
    seed_default_mapping_rules(db, fund_id)


def _save_bank_transactions(
    rows: list[dict],
    fund_id: int,
    db: Session,
    *,
    account_number: str | None = None,
) -> list[BankTransaction]:
    created: list[BankTransaction] = []

    for item in rows:
        transaction_date = item.get("transaction_date")
        withdrawal = float(item.get("withdrawal") or 0)
        deposit = float(item.get("deposit") or 0)
        description = item.get("description")
        counterparty = item.get("counterparty")
        year_month = item.get("year_month")

        if transaction_date is None or not year_month:
            continue

        duplicate = (
            db.query(BankTransaction)
            .filter(
                BankTransaction.fund_id == fund_id,
                BankTransaction.transaction_date == transaction_date,
                BankTransaction.withdrawal == withdrawal,
                BankTransaction.deposit == deposit,
                BankTransaction.description == description,
                BankTransaction.counterparty == counterparty,
                BankTransaction.year_month == year_month,
            )
            .first()
        )
        if duplicate:
            continue

        row = BankTransaction(
            fund_id=fund_id,
            transaction_date=transaction_date,
            withdrawal=withdrawal,
            deposit=deposit,
            balance_after=item.get("balance_after"),
            description=description,
            counterparty=counterparty,
            bank_branch=item.get("bank_branch"),
            account_number=account_number or item.get("account_number"),
            year_month=year_month,
        )
        db.add(row)
        created.append(row)

    db.commit()
    for row in created:
        db.refresh(row)

    return created


@router.post("/api/funds/{fund_id}/bank-transactions/parse")
def parse_bank_transactions_from_clipboard(
    fund_id: int,
    data: ParseClipboardRequest,
    db: Session = Depends(get_db),
):
    _validate_fund(fund_id, db)
    _ensure_baseline(fund_id, db)

    parser = BankStatementParser()
    rows = parser.parse_clipboard_text(data.text, fund_id)
    created = _save_bank_transactions(rows, fund_id, db, account_number=data.account_number)

    year_months = sorted({row.year_month for row in created})
    return {
        "created_count": len(created),
        "items": [_serialize_bank_txn(row) for row in created],
        "year_months": year_months,
    }


@router.post("/api/funds/{fund_id}/bank-transactions/upload")
async def upload_bank_transactions_excel(
    fund_id: int,
    payload: bytes = Body(..., media_type="application/octet-stream"),
    db: Session = Depends(get_db),
):
    _validate_fund(fund_id, db)
    _ensure_baseline(fund_id, db)

    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as fp:
            fp.write(payload)
            tmp_path = fp.name

        parser = BankStatementParser()
        rows = parser.parse_excel(tmp_path, fund_id)
        created = _save_bank_transactions(rows, fund_id, db)
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)

    year_months = sorted({row.year_month for row in created})
    return {
        "created_count": len(created),
        "items": [_serialize_bank_txn(row) for row in created],
        "year_months": year_months,
    }


@router.get("/api/funds/{fund_id}/bank-transactions")
def list_bank_transactions(
    fund_id: int,
    year_month: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    _validate_fund(fund_id, db)

    query = db.query(BankTransaction).filter(BankTransaction.fund_id == fund_id)
    if year_month:
        query = query.filter(BankTransaction.year_month == year_month)

    rows = query.order_by(BankTransaction.transaction_date.desc(), BankTransaction.id.desc()).all()
    return [_serialize_bank_txn(row) for row in rows]


@router.post("/api/funds/{fund_id}/bank-transactions/auto-journal")
def run_auto_journal(
    fund_id: int,
    data: AutoJournalRequest,
    db: Session = Depends(get_db),
):
    _validate_fund(fund_id, db)
    _ensure_baseline(fund_id, db)

    query = db.query(BankTransaction).filter(
        BankTransaction.fund_id == fund_id,
        BankTransaction.journal_entry_id.is_(None),
    )
    if data.year_month:
        query = query.filter(BankTransaction.year_month == data.year_month)

    rows = query.order_by(BankTransaction.transaction_date.asc(), BankTransaction.id.asc()).all()
    service = AutoJournalService()
    return service.auto_map(rows, fund_id, db)


@router.post("/api/funds/{fund_id}/bank-transactions/{txn_id}/manual-map")
def manual_map_bank_transaction(
    fund_id: int,
    txn_id: int,
    data: ManualMapRequest,
    db: Session = Depends(get_db),
):
    _validate_fund(fund_id, db)
    _validate_account(data.debit_account_id, db)
    _validate_account(data.credit_account_id, db)

    txn = db.get(BankTransaction, txn_id)
    if not txn or txn.fund_id != fund_id:
        raise HTTPException(status_code=404, detail="Bank transaction not found")

    service = AutoJournalService()
    try:
        result = service.learn_mapping(
            txn_id=txn_id,
            debit_account_id=data.debit_account_id,
            credit_account_id=data.credit_account_id,
            db=db,
            learn=data.learn,
            description=data.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.refresh(txn)
    return {
        "ok": True,
        "result": result,
        "item": _serialize_bank_txn(txn),
    }


@router.get("/api/funds/{fund_id}/mapping-rules")
def list_mapping_rules(fund_id: int, db: Session = Depends(get_db)):
    _validate_fund(fund_id, db)
    _ensure_baseline(fund_id, db)

    rows = (
        db.query(AutoMappingRule)
        .filter((AutoMappingRule.fund_id == fund_id) | (AutoMappingRule.fund_id.is_(None)))
        .order_by(AutoMappingRule.priority.desc(), AutoMappingRule.id.desc())
        .all()
    )
    return [_serialize_mapping_rule(row, db) for row in rows]


@router.post("/api/funds/{fund_id}/mapping-rules", status_code=201)
def create_mapping_rule(
    fund_id: int,
    data: MappingRuleCreateRequest,
    db: Session = Depends(get_db),
):
    _validate_fund(fund_id, db)

    if data.direction not in {"deposit", "withdrawal"}:
        raise HTTPException(status_code=400, detail="direction must be deposit or withdrawal")

    _validate_account(data.debit_account_id, db)
    _validate_account(data.credit_account_id, db)

    row = AutoMappingRule(
        fund_id=fund_id,
        keyword=data.keyword.strip(),
        direction=data.direction,
        debit_account_id=data.debit_account_id,
        credit_account_id=data.credit_account_id,
        description_template=data.description_template,
        priority=data.priority,
        is_active=data.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_mapping_rule(row, db)


@router.put("/api/mapping-rules/{rule_id}")
def update_mapping_rule(
    rule_id: int,
    data: MappingRuleUpdateRequest,
    db: Session = Depends(get_db),
):
    row = db.get(AutoMappingRule, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail="Mapping rule not found")

    payload = data.model_dump(exclude_unset=True)

    if "direction" in payload and payload["direction"] not in {"deposit", "withdrawal"}:
        raise HTTPException(status_code=400, detail="direction must be deposit or withdrawal")

    if "debit_account_id" in payload and payload["debit_account_id"] is not None:
        _validate_account(payload["debit_account_id"], db)
    if "credit_account_id" in payload and payload["credit_account_id"] is not None:
        _validate_account(payload["credit_account_id"], db)

    for key, value in payload.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return _serialize_mapping_rule(row, db)


@router.post("/api/funds/{fund_id}/provisional-fs/generate")
def generate_provisional_fs(
    fund_id: int,
    data: GenerateFSRequest,
    db: Session = Depends(get_db),
):
    _validate_fund(fund_id, db)
    _ensure_baseline(fund_id, db)

    service = ProvisionalFSService()
    try:
        fs = service.generate(fund_id, data.year_month, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _serialize_fs(fs)


@router.get("/api/funds/{fund_id}/provisional-fs")
def get_provisional_fs(
    fund_id: int,
    year_month: str,
    db: Session = Depends(get_db),
):
    _validate_fund(fund_id, db)

    row = (
        db.query(ProvisionalFS)
        .filter(ProvisionalFS.fund_id == fund_id, ProvisionalFS.year_month == year_month)
        .first()
    )
    if not row:
        return None
    return _serialize_fs(row)


@router.put("/api/provisional-fs/{fs_id}/confirm")
def confirm_provisional_fs(
    fs_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(ProvisionalFS, fs_id)
    if not row:
        raise HTTPException(status_code=404, detail="Provisional FS not found")

    row.status = "confirmed"
    row.confirmed_at = datetime.utcnow()
    row.confirmed_by = current_user.id

    db.commit()
    db.refresh(row)
    return _serialize_fs(row)


@router.get("/api/provisional-fs/{fs_id}/download")
def download_provisional_fs(fs_id: int, db: Session = Depends(get_db)):
    row = db.get(ProvisionalFS, fs_id)
    if not row:
        raise HTTPException(status_code=404, detail="Provisional FS not found")

    fund = db.get(Fund, row.fund_id)

    exporter = FSExcelExporter()
    file_path = exporter.export(row, fund, db)

    base_name = f"{fund.name if fund else 'fund'}_{row.year_month}_provisional_fs.xlsx"
    encoded = quote(base_name)
    return FileResponse(
        path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"provisional_fs.xlsx\"; filename*=UTF-8''{encoded}"
            )
        },
    )


@router.get("/api/provisional-fs/overview")
def provisional_fs_overview(
    year_month: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    target_year_month = year_month or datetime.utcnow().strftime("%Y-%m")
    funds = db.query(Fund).order_by(Fund.id.asc()).all()

    items: list[dict] = []
    for fund in funds:
        tx_query = db.query(BankTransaction).filter(
            BankTransaction.fund_id == fund.id,
            BankTransaction.year_month == target_year_month,
        )

        total_txn_count = tx_query.count()
        mapped_txn_count = tx_query.filter(BankTransaction.journal_entry_id.isnot(None)).count()
        unmapped_count = max(total_txn_count - mapped_txn_count, 0)

        fs = (
            db.query(ProvisionalFS)
            .filter(ProvisionalFS.fund_id == fund.id, ProvisionalFS.year_month == target_year_month)
            .first()
        )

        if fs and fs.status == "confirmed":
            status = "confirmed"
        elif total_txn_count == 0:
            status = "not_started"
        elif unmapped_count > 0:
            status = "needs_mapping"
        elif fs:
            status = fs.status
        else:
            status = "ready"

        items.append(
            {
                "fund_id": fund.id,
                "fund_name": fund.name,
                "status": status,
                "provisional_fs_id": fs.id if fs else None,
                "total_assets": _to_float(fs.total_assets) if fs and fs.total_assets is not None else None,
                "total_liabilities": _to_float(fs.total_liabilities) if fs and fs.total_liabilities is not None else None,
                "total_equity": _to_float(fs.total_equity) if fs and fs.total_equity is not None else None,
                "net_income": _to_float(fs.net_income) if fs and fs.net_income is not None else None,
                "bank_txn_count": total_txn_count,
                "mapped_count": mapped_txn_count,
                "unmapped_count": unmapped_count,
            }
        )

    summary = {
        "fund_count": len(items),
        "confirmed_count": sum(1 for item in items if item["status"] == "confirmed"),
        "needs_mapping_count": sum(1 for item in items if item["status"] == "needs_mapping"),
        "not_started_count": sum(1 for item in items if item["status"] == "not_started"),
        "total_unmapped_count": sum(item["unmapped_count"] for item in items),
        "total_assets_sum": float(sum(item["total_assets"] or 0 for item in items)),
    }

    return {
        "year_month": target_year_month,
        "summary": summary,
        "items": items,
    }
