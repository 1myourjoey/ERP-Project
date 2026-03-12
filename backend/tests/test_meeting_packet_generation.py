from __future__ import annotations

from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from zipfile import ZipFile

import services.meeting_packet_docx_service as meeting_packet_docx_service
from models.attachment import Attachment
from models.biz_report import BizReport
from services.generated_attachment_service import UPLOAD_DIR
from services.meeting_packet_docx_service import MeetingPacketDocxService


def _seed_biz_report(db_session, fund_id: int) -> None:
    db_session.add(
        BizReport(
            fund_id=fund_id,
            report_year=2025,
            status="작성중",
            total_commitment=10_000_000_000,
            total_paid_in=5_000_000_000,
            fund_nav=4_200_000_000,
            total_invested=3_000_000_000,
            market_overview="시장과 포트폴리오 현황을 점검했습니다.",
            portfolio_summary="주요 투자자산 현황을 정리했습니다.",
            key_issues="추가 집행과 준법 검토 이슈를 포함합니다.",
        )
    )
    db_session.commit()


def _prepare_payload(fund_id: int, *, packet_type: str, include_bylaw_amendment: bool) -> dict[str, object]:
    return {
        "fund_id": fund_id,
        "packet_type": packet_type,
        "meeting_date": "2026-03-30",
        "meeting_time": "13:00",
        "meeting_method": "서면결의",
        "location": "트리거 회의실",
        "chair_name": "홍길동",
        "document_number": "TR-2026-07",
        "report_year": 2025,
        "include_bylaw_amendment": include_bylaw_amendment,
    }


def test_prepare_meeting_packet_creates_draft_with_agendas_and_slots(client, sample_fund):
    response = client.post(
        f"/api/funds/{sample_fund['id']}/meeting-packets/prepare",
        json=_prepare_payload(
            sample_fund["id"],
            packet_type="fund_lp_regular_meeting_project_with_bylaw_amendment",
            include_bylaw_amendment=True,
        ),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] > 0
    assert payload["assembly_id"] > 0
    assert payload["packet_type"] == "fund_lp_regular_meeting_project_with_bylaw_amendment"
    assert len(payload["agenda_items"]) >= 2
    assert any(item["kind"] == "financial_statement_approval" for item in payload["agenda_items"])
    slots = {row["slot"]: row for row in payload["slots"]}
    assert "official_notice" in slots
    assert slots["audit_report"]["generation_mode"] == "external_receive"
    assert any(doc["slot"] == "audit_report" for doc in payload["documents"])


def test_generate_meeting_packet_creates_docx_and_partial_zip(db_session, client, sample_fund_with_lps):
    _seed_biz_report(db_session, sample_fund_with_lps["id"])

    draft_response = client.post(
        f"/api/funds/{sample_fund_with_lps['id']}/meeting-packets/prepare",
        json=_prepare_payload(
            sample_fund_with_lps["id"],
            packet_type="fund_lp_regular_meeting_project",
            include_bylaw_amendment=False,
        ),
    )
    assert draft_response.status_code == 200
    run_id = draft_response.json()["run_id"]

    generate_response = client.post(f"/api/meeting-packets/{run_id}/generate", json={})
    assert generate_response.status_code == 200
    payload = generate_response.json()
    assert payload["run_id"] == run_id
    assert payload["zip_attachment_id"] is not None
    assert payload["status"] == "partial"

    documents = {row["slot"]: row for row in payload["documents"]}
    assert documents["official_notice"]["attachment_id"] is not None
    assert documents["agenda_explanation"]["attachment_id"] is not None
    assert documents["written_resolution"]["attachment_id"] is not None
    assert documents["minutes"]["attachment_id"] is not None
    assert documents["business_report"]["attachment_id"] is not None
    assert payload["missing_slots"] == ["audit_report"]

    zip_response = client.get(f"/api/documents/{payload['zip_attachment_id']}/download")
    assert zip_response.status_code == 200
    assert zip_response.headers["content-type"].startswith("application/zip")
    with ZipFile(BytesIO(zip_response.content)) as archive:
        names = archive.namelist()
    assert names[1] == "00_manifest.json"
    assert [name[:3] for name in names[2:]] == ["01_", "02_", "03_", "04_", "05_"]


def test_meeting_packet_docx_service_uses_runtime_temp_dir(monkeypatch):
    captured: dict[str, Path | None] = {"payload_path": None}

    def fake_run(command, **kwargs):
        captured["payload_path"] = Path(command[2])
        output_path = Path(command[3])
        output_path.write_bytes(b"fake-docx")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(meeting_packet_docx_service.subprocess, "run", fake_run)
    monkeypatch.setattr(MeetingPacketDocxService, "_validate", lambda self, output_path: None)

    service = MeetingPacketDocxService()
    payload = {"kind": "official_notice", "title": "테스트"}

    assert service.render(payload) == b"fake-docx"
    assert captured["payload_path"] is not None
    assert service._runtime_temp_dir in captured["payload_path"].parents
    assert not captured["payload_path"].parent.exists()


def test_generate_meeting_packet_returns_detail_and_cleans_files(db_session, client, sample_fund_with_lps, monkeypatch):
    _seed_biz_report(db_session, sample_fund_with_lps["id"])

    draft_response = client.post(
        f"/api/funds/{sample_fund_with_lps['id']}/meeting-packets/prepare",
        json=_prepare_payload(
            sample_fund_with_lps["id"],
            packet_type="fund_lp_regular_meeting_project",
            include_bylaw_amendment=False,
        ),
    )
    assert draft_response.status_code == 200
    run_id = draft_response.json()["run_id"]

    call_count = {"value": 0}

    def fake_render(self, payload):
        call_count["value"] += 1
        if call_count["value"] == 1:
            return b"fake-docx"
        raise RuntimeError("mock render failure")

    before_files = {path.name for path in UPLOAD_DIR.iterdir() if path.is_file()}
    monkeypatch.setattr(MeetingPacketDocxService, "render", fake_render)

    generate_response = client.post(f"/api/meeting-packets/{run_id}/generate", json={})

    assert generate_response.status_code == 500
    assert generate_response.json()["detail"] == "mock render failure"
    assert db_session.query(Attachment).filter(Attachment.entity_type.like("meeting_packet:%")).count() == 0
    after_files = {path.name for path in UPLOAD_DIR.iterdir() if path.is_file()}
    assert after_files == before_files


def test_prepare_meeting_packet_normalizes_legacy_packet_type_and_respects_document_order(db_session, client, sample_fund_with_lps):
    _seed_biz_report(db_session, sample_fund_with_lps["id"])

    draft_response = client.post(
        f"/api/funds/{sample_fund_with_lps['id']}/meeting-packets/prepare",
        json=_prepare_payload(
            sample_fund_with_lps["id"],
            packet_type="fund_lp_regular_meeting_pex",
            include_bylaw_amendment=False,
        ),
    )
    assert draft_response.status_code == 200
    payload = draft_response.json()
    assert payload["packet_type"] == "fund_lp_regular_meeting_nongmotae"
    assert payload["packet_label"] == "조합원총회(농모태형)"

    reordered_slots = [
        "official_notice",
        "proxy_vote_notice",
        "agenda_explanation",
        "business_report",
        "audit_report",
    ]
    update_response = client.put(
        f"/api/meeting-packets/{payload['run_id']}",
        json={
            "document_orders": [
                {"slot": slot, "sort_order": index}
                for index, slot in enumerate(reordered_slots)
            ],
        },
    )
    assert update_response.status_code == 200
    updated_payload = update_response.json()
    assert [item["slot"] for item in updated_payload["documents"]] == reordered_slots

    generate_response = client.post(f"/api/meeting-packets/{payload['run_id']}/generate", json={})
    assert generate_response.status_code == 200
    generated_payload = generate_response.json()
    assert [item["slot"] for item in generated_payload["documents"]] == reordered_slots

    zip_response = client.get(f"/api/documents/{generated_payload['zip_attachment_id']}/download")
    assert zip_response.status_code == 200
    with ZipFile(BytesIO(zip_response.content)) as archive:
        names = archive.namelist()
    assert names[0] == "00_누락체크리스트.md"
    assert names[1] == "00_manifest.json"
    assert names[2].startswith("01_공문")
    assert names[3].startswith("02_의결권행사통보서")
