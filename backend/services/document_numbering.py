from __future__ import annotations

import re
from datetime import date

from sqlalchemy.orm import Session

from models.document_number_seq import DocumentNumberSeq
from models.fund import Fund


class DocumentNumberingService:
    """Document number issuer.

    Format: {FUND_PREFIX}-{TYPE_CODE}-{YEAR}-{SEQ4}
    Example: TGPEX-LC-2026-0001
    """

    TYPE_CODE_MAP: dict[str, str] = {
        "출자확인서": "LC",
        "출자증서": "LC",
        "통지": "NT",
        "공문": "LT",
        "계약": "CT",
        "총회": "GA",
        "보고": "RP",
    }

    def next_number(self, db: Session, fund_id: int, document_type: str) -> str:
        year = date.today().year
        normalized_type = (document_type or "문서").strip()

        seq = (
            db.query(DocumentNumberSeq)
            .filter(
                DocumentNumberSeq.fund_id == fund_id,
                DocumentNumberSeq.document_type == normalized_type,
                DocumentNumberSeq.year == year,
            )
            .with_for_update()
            .first()
        )

        if not seq:
            seq = DocumentNumberSeq(
                fund_id=fund_id,
                document_type=normalized_type,
                year=year,
                last_number=0,
            )
            db.add(seq)
            db.flush()

        seq.last_number = int(seq.last_number or 0) + 1
        db.flush()

        fund = db.get(Fund, fund_id)
        prefix = self._fund_prefix(fund, fund_id)
        type_code = self._type_code(normalized_type)
        return f"{prefix}-{type_code}-{year}-{seq.last_number:04d}"

    def _fund_prefix(self, fund: Fund | None, fund_id: int) -> str:
        if not fund or not fund.name:
            return f"FUND{fund_id}"

        words = re.findall(r"[A-Za-z0-9]+", fund.name.upper())
        if words:
            if len(words) == 1:
                token = words[0]
                return token[:6] if len(token) >= 3 else token.ljust(3, "X")
            initials = "".join(word[0] for word in words if word)
            if len(initials) >= 3:
                return initials[:6]

        fallback = f"FUND{fund.id or fund_id}"
        return fallback[:8]

    def _type_code(self, document_type: str) -> str:
        for keyword, code in self.TYPE_CODE_MAP.items():
            if keyword in document_type:
                return code

        upper = re.sub(r"[^A-Za-z0-9]", "", document_type.upper())
        if len(upper) >= 2:
            return upper[:2]
        if len(upper) == 1:
            return f"{upper}X"
        return "DC"

