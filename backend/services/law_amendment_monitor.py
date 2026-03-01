from __future__ import annotations

import os
import re
from datetime import datetime, timedelta
from typing import Any

import httpx

from database import SessionLocal
from models.compliance import ComplianceDocument


class LawAmendmentMonitor:
    """Monitor legal amendments via 국가법령정보센터 open API."""

    MONITORED_LAWS = [
        {"name": "자본시장과 금융투자업에 관한 법률", "mst": "001834"},
        {"name": "벤처투자 촉진에 관한 법률", "mst": "007361"},
        {"name": "여신전문금융업법", "mst": "000933"},
        {"name": "중소기업창업 지원법", "mst": "000640"},
    ]
    BASE_URL = "https://www.law.go.kr/DRF/lawSearch.do"

    async def check_amendments(
        self,
        *,
        days: int = 7,
        trigger_source: str = "weekly_law_amendment_check",
    ) -> dict[str, Any]:
        since_ymd = (datetime.now() - timedelta(days=days)).strftime("%Y%m%d")
        amendments: list[dict[str, Any]] = []
        errors: list[str] = []
        oc_key = os.getenv("LAW_API_OC", "antigravity")

        async with httpx.AsyncClient(timeout=20.0) as client:
            for law in self.MONITORED_LAWS:
                try:
                    response = await client.get(
                        self.BASE_URL,
                        params={
                            "OC": oc_key,
                            "target": "law",
                            "MST": law["mst"],
                            "type": "JSON",
                        },
                    )
                    if response.status_code != 200:
                        errors.append(f"{law['name']}: status={response.status_code}")
                        continue

                    payload = self._parse_response_payload(response)
                    candidate_dates = self._extract_date_candidates(payload)
                    if not candidate_dates:
                        continue
                    latest = max(candidate_dates)
                    if latest < since_ymd:
                        continue

                    amendments.append(
                        {
                            "law_name": law["name"],
                            "mst": law["mst"],
                            "amendment_date": latest,
                            "effective_date": latest,
                            "summary": self._extract_title(payload, fallback=law["name"]),
                            "trigger_source": trigger_source,
                        }
                    )
                except Exception as exc:  # pragma: no cover - network variability
                    errors.append(f"{law['name']}: {exc}")

        saved_count = self._save_amendment_alerts(amendments)
        return {
            "checked_at": datetime.utcnow().isoformat(),
            "days": days,
            "count": len(amendments),
            "saved_count": saved_count,
            "amendments": amendments,
            "errors": errors,
        }

    def _save_amendment_alerts(self, amendments: list[dict[str, Any]]) -> int:
        if not amendments:
            return 0

        db = SessionLocal()
        saved_count = 0
        try:
            for item in amendments:
                effective_date = self._parse_ymd(item.get("effective_date"))
                existing = (
                    db.query(ComplianceDocument)
                    .filter(
                        ComplianceDocument.document_type == "amendment_alert",
                        ComplianceDocument.title == f"[개정감지] {item['law_name']}",
                        ComplianceDocument.effective_date == effective_date,
                    )
                    .first()
                )
                if existing:
                    continue

                db.add(
                    ComplianceDocument(
                        title=f"[개정감지] {item['law_name']}",
                        document_type="amendment_alert",
                        version=str(item.get("amendment_date") or ""),
                        effective_date=effective_date,
                        content_summary=(
                            f"개정일: {item.get('amendment_date', '')}, "
                            f"시행일: {item.get('effective_date', '')}, "
                            f"출처: 국가법령정보센터"
                        ),
                        file_path=None,
                        is_active=True,
                    )
                )
                saved_count += 1
            db.commit()
            return saved_count
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def _parse_response_payload(response: httpx.Response) -> Any:
        content_type = (response.headers.get("content-type") or "").lower()
        text = response.text or ""
        if "json" in content_type or text.lstrip().startswith("{") or text.lstrip().startswith("["):
            try:
                return response.json()
            except Exception:
                return {"raw": text}
        return {"raw": text}

    @classmethod
    def _extract_date_candidates(cls, payload: Any) -> list[str]:
        candidates: list[str] = []
        if isinstance(payload, dict):
            for key, value in payload.items():
                key_text = str(key)
                if any(token in key_text for token in ("시행일자", "공포일자", "개정일", "시행일")):
                    candidates.extend(cls._extract_date_candidates(value))
                else:
                    candidates.extend(cls._extract_date_candidates(value))
        elif isinstance(payload, list):
            for item in payload:
                candidates.extend(cls._extract_date_candidates(item))
        elif isinstance(payload, str):
            candidates.extend(re.findall(r"\b\d{8}\b", payload))
        return [item for item in candidates if len(item) == 8 and item.isdigit()]

    @staticmethod
    def _extract_title(payload: Any, *, fallback: str) -> str:
        if isinstance(payload, dict):
            for key in ("법령명한글", "법령명_한글", "법령명", "title", "name"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            for value in payload.values():
                found = LawAmendmentMonitor._extract_title(value, fallback=fallback)
                if found != fallback:
                    return found
        elif isinstance(payload, list):
            for item in payload:
                found = LawAmendmentMonitor._extract_title(item, fallback=fallback)
                if found != fallback:
                    return found
        return fallback

    @staticmethod
    def _parse_ymd(value: Any) -> datetime | None:
        text = str(value or "").strip()
        if not (text.isdigit() and len(text) == 8):
            return None
        try:
            return datetime.strptime(text, "%Y%m%d")
        except ValueError:
            return None
