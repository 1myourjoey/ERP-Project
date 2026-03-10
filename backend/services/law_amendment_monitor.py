from __future__ import annotations

import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Any

import httpx

from database import SessionLocal
from models.compliance import ComplianceDocument
from models.fund import Fund
from services.compliance_orchestrator import ComplianceOrchestrator
from services.document_ingestion import DocumentIngestionService


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
        synced_count = await self._sync_amended_law_documents(amendments)
        recheck_count = await self._trigger_fund_rechecks(amendments, trigger_source=trigger_source)
        return {
            "checked_at": datetime.utcnow().isoformat(),
            "days": days,
            "count": len(amendments),
            "saved_count": saved_count,
            "synced_count": synced_count,
            "recheck_count": recheck_count,
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

    async def _trigger_fund_rechecks(self, amendments: list[dict[str, Any]], *, trigger_source: str) -> int:
        if not amendments:
            return 0

        db = SessionLocal()
        rechecked = 0
        try:
            funds = (
                db.query(Fund)
                .filter(Fund.status.in_(["active", "운용중"]))
                .order_by(Fund.id.asc())
                .all()
            )
            if not funds:
                funds = db.query(Fund).order_by(Fund.id.asc()).all()

            orchestrator = ComplianceOrchestrator()
            for fund in funds:
                await orchestrator.run_review(
                    db=db,
                    fund_id=fund.id,
                    scenario="fund_document_check",
                    query="최근 개정된 법령이 이 조합의 규약, 특별조합원 가이드라인, 투자계약서와 충돌하거나 추가 조치를 요구하는지 검토해줘.",
                    investment_id=None,
                    trigger_type="scheduled",
                    created_by=None,
                    run_rule_engine=True,
                )
                rechecked += 1
            db.commit()
            return rechecked
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    async def _sync_amended_law_documents(self, amendments: list[dict[str, Any]]) -> int:
        if not amendments:
            return 0

        oc_key = os.getenv("LAW_API_OC", "").strip()
        if not oc_key:
            return 0

        db = SessionLocal()
        synced = 0
        try:
            ingestion = DocumentIngestionService()
            async with httpx.AsyncClient(timeout=30.0) as client:
                for item in amendments:
                    raw_text = await self._fetch_law_full_text(
                        client=client,
                        mst=str(item.get("mst") or "").strip(),
                        oc_key=oc_key,
                    )
                    if not raw_text.strip():
                        continue

                    title = str(item.get("law_name") or "").strip() or f"law-{item.get('mst')}"
                    existing = (
                        db.query(ComplianceDocument)
                        .filter(
                            ComplianceDocument.source_tier == "law",
                            ComplianceDocument.document_role == str(item.get("mst") or ""),
                        )
                        .first()
                    )
                    if existing is None:
                        existing = ComplianceDocument(
                            title=title,
                            document_type="laws",
                            source_tier="law",
                            scope="global",
                            document_role=str(item.get("mst") or ""),
                            version=str(item.get("amendment_date") or ""),
                            effective_date=self._parse_ymd(item.get("effective_date")),
                            effective_from=self._parse_ymd(item.get("effective_date")),
                            file_path=f"law://{item.get('mst')}",
                            ingest_status="pending",
                            ocr_status="not_needed",
                            index_status="pending",
                            is_active=True,
                        )
                        db.add(existing)
                        db.flush()
                    else:
                        existing.title = title
                        existing.version = str(item.get("amendment_date") or "") or existing.version
                        existing.effective_date = self._parse_ymd(item.get("effective_date")) or existing.effective_date
                        existing.effective_from = self._parse_ymd(item.get("effective_date")) or existing.effective_from

                    ingest_result = ingestion.ingest_text(
                        text=raw_text,
                        collection_name="laws",
                        document_id=existing.id,
                        metadata={
                            "document_id": existing.id,
                            "document_type": "laws",
                            "source_tier": "law",
                            "title": existing.title,
                            "version": existing.version or "",
                            "scope": "global",
                            "document_role": existing.document_role or "",
                            "mst": str(item.get("mst") or ""),
                        },
                        db=db,
                    )
                    existing.ingest_status = ingest_result["ingest_status"]
                    existing.ocr_status = ingest_result["ocr_status"]
                    existing.index_status = ingest_result["index_status"]
                    existing.extraction_quality = ingest_result["extraction_quality"]
                    existing.content_summary = f"Indexed {ingest_result['chunk_count']} chunks from law.go.kr"
                    synced += 1
            db.commit()
            return synced
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    async def _fetch_law_full_text(self, *, client: httpx.AsyncClient, mst: str, oc_key: str) -> str:
        if not mst:
            return ""
        response = await client.get(
            "https://www.law.go.kr/DRF/lawService.do",
            params={
                "OC": oc_key,
                "target": "law",
                "MST": mst,
                "type": "XML",
            },
        )
        response.raise_for_status()
        return self._extract_law_text_from_xml(response.text)

    @staticmethod
    def _extract_law_text_from_xml(xml_text: str) -> str:
        if not xml_text.strip():
            return ""
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            return xml_text

        collected: list[str] = []
        priority_tags = {
            "조문내용",
            "항내용",
            "호내용",
            "조문제목",
            "조문번호",
            "부칙내용",
            "법령명한글",
        }
        for element in root.iter():
            tag = element.tag.split("}", 1)[-1]
            text = " ".join(part.strip() for part in element.itertext() if str(part).strip())
            if not text:
                continue
            if tag in priority_tags:
                collected.append(text)

        if collected:
            deduped: list[str] = []
            seen: set[str] = set()
            for row in collected:
                if row in seen:
                    continue
                seen.add(row)
                deduped.append(row)
            return "\n".join(deduped)

        flat_text = " ".join(part.strip() for part in root.itertext() if str(part).strip())
        return re.sub(r"\s{2,}", " ", flat_text).strip()

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
