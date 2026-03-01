from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from models.compliance import ComplianceDocument, FundComplianceRule

DEFAULT_COMPLIANCE_DOCUMENTS = [
    {
        "title": "자본시장법",
        "document_type": "law",
        "version": "2024-01-01",
        "effective_date": datetime(2024, 1, 1),
        "content_summary": "자본시장과 금융투자업에 관한 법률 주요 준수사항",
    },
    {
        "title": "벤처투자법",
        "document_type": "law",
        "version": "2024-01-01",
        "effective_date": datetime(2024, 1, 1),
        "content_summary": "벤처투자 촉진에 관한 법률 및 시행령 준수사항",
    },
    {
        "title": "수탁계약",
        "document_type": "agreement",
        "version": "기본",
        "content_summary": "조합 운용 수탁계약 문서",
    },
]


DEFAULT_COMPLIANCE_RULES = [
    {
        "rule_code": "INV-LIMIT-001",
        "rule_name": "동일 기업 투자한도 (20%)",
        "level": "L2",
        "category": "investment",
        "description": "단일 기업 투자금은 약정총액의 20%를 초과할 수 없음",
        "condition": {"type": "range", "target": "investment_ratio", "max": 0.20},
        "severity": "error",
        "auto_task": True,
    },
    {
        "rule_code": "DOC-EXIST-001",
        "rule_name": "수탁계약 존재 확인",
        "level": "L1",
        "category": "governance",
        "description": "필수 수탁계약 문서 존재 여부 점검",
        "condition": {"type": "exists", "target": "document", "document_type": "수탁계약"},
        "severity": "warning",
        "auto_task": False,
    },
    {
        "rule_code": "RPT-DEADLINE-001",
        "rule_name": "분기 보고서 제출 기한 (D-7 경고)",
        "level": "L3",
        "category": "reporting",
        "description": "정기 보고서 마감 7일 이내 진입 시 경고",
        "condition": {"type": "deadline", "target": "quarterly_report", "days_before": 7},
        "severity": "warning",
        "auto_task": True,
    },
    {
        "rule_code": "CAP-CROSS-001",
        "rule_name": "출자금 합계 정합성",
        "level": "L4",
        "category": "capital",
        "description": "LP 약정 합계와 펀드 약정총액 일치 여부 검증",
        "condition": {
            "type": "cross_validate",
            "source": "lp_commitment_sum",
            "target": "fund_commitment_total",
            "tolerance": 0,
        },
        "severity": "error",
        "auto_task": True,
    },
    {
        "rule_code": "INV-LIMIT-002",
        "rule_name": "투자 비율 최소치 점검",
        "level": "L2",
        "category": "investment",
        "description": "최대 단일 투자 비율이 1% 미만이면 데이터 이상으로 간주",
        "condition": {"type": "range", "target": "investment_ratio", "min": 0.01},
        "severity": "warning",
        "auto_task": False,
    },
    {
        "rule_code": "INV-EXIST-001",
        "rule_name": "투자 건 존재 확인",
        "level": "L1",
        "category": "investment",
        "description": "조합에 최소 1건 이상 투자 데이터가 존재해야 함",
        "condition": {"type": "exists", "target": "investment"},
        "severity": "warning",
        "auto_task": False,
    },
    {
        "rule_code": "CAP-CROSS-002",
        "rule_name": "출자금 합계 정합성 (허용오차 포함)",
        "level": "L4",
        "category": "capital",
        "description": "LP 약정 합계와 약정총액의 차이가 허용오차 이내인지 검증",
        "condition": {
            "type": "cross_validate",
            "source": "lp_commitment_sum",
            "target": "fund_commitment_total",
            "tolerance": 1000,
        },
        "severity": "warning",
        "auto_task": False,
    },
    {
        "rule_code": "CMP-CORE-001",
        "rule_name": "핵심 투자 컴플라이언스 복합규칙",
        "level": "L5",
        "category": "investment",
        "description": "핵심 규칙(투자한도+정합성+기한)을 종합 평가",
        "condition": {
            "type": "composite",
            "logic": "AND",
            "rules": ["INV-LIMIT-001", "CAP-CROSS-001", "RPT-DEADLINE-001"],
        },
        "severity": "error",
        "auto_task": True,
    },
    {
        "rule_code": "CMP-DOC-001",
        "rule_name": "문서 및 자본 복합규칙",
        "level": "L5",
        "category": "governance",
        "description": "문서존재 및 자본정합성 조건 동시 충족 필요",
        "condition": {
            "type": "composite",
            "logic": "AND",
            "rules": ["DOC-EXIST-001", "CAP-CROSS-001"],
        },
        "severity": "warning",
        "auto_task": False,
    },
    {
        "rule_code": "CMP-OR-001",
        "rule_name": "투자/문서 대체 충족 규칙",
        "level": "L5",
        "category": "governance",
        "description": "투자 존재 또는 필수 문서 존재 조건 중 하나 충족",
        "condition": {
            "type": "composite",
            "logic": "OR",
            "rules": ["INV-EXIST-001", "DOC-EXIST-001"],
        },
        "severity": "warning",
        "auto_task": False,
    },
]


def seed_default_compliance_rules(db: Session) -> dict[str, int]:
    created_documents = 0
    created_rules = 0
    updated_rules = 0

    existing_documents = {
        (row.title.strip(), (row.version or "").strip()): row
        for row in db.query(ComplianceDocument).all()
    }
    for item in DEFAULT_COMPLIANCE_DOCUMENTS:
        key = (str(item["title"]).strip(), str(item.get("version") or "").strip())
        if key in existing_documents:
            continue
        db.add(ComplianceDocument(**item))
        created_documents += 1

    db.flush()

    existing_rules = {
        row.rule_code: row
        for row in db.query(FundComplianceRule).all()
    }

    for item in DEFAULT_COMPLIANCE_RULES:
        code = str(item["rule_code"])
        if existing_rules.get(code):
            # User-managed rules should remain untouched once created.
            continue
        db.add(
            FundComplianceRule(
                fund_id=None,
                document_id=None,
                rule_code=code,
                rule_name=item["rule_name"],
                level=item["level"],
                category=item["category"],
                description=item.get("description"),
                condition=item["condition"],
                severity=item.get("severity", "warning"),
                auto_task=bool(item.get("auto_task", False)),
                is_active=True,
            )
        )
        created_rules += 1

    if created_documents or created_rules:
        db.commit()

    return {
        "created_documents": created_documents,
        "created_rules": created_rules,
        "updated_rules": updated_rules,
    }
