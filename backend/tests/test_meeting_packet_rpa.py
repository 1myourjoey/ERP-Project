from pathlib import Path

from models.biz_report import BizReport
from services.meeting_packet_rpa import MeetingPacketRPAService


def test_analyze_root_classifies_packet_types(tmp_path, monkeypatch):
    pex_dir = tmp_path / "1_조합원통지(25.03.06)_트리거-글로벌PEX투자조합"
    project_dir = tmp_path / "[트리거메디테크3호조합]"
    gp_dir = tmp_path / "[2025년 정기사원총회]"
    for folder in (pex_dir, project_dir, gp_dir):
        folder.mkdir(parents=True)

    for path in [
        pex_dir / "[공문] 트리거-글로벌PEX투자조합 2기 정기조합원 총회 및 온기 투자보고회.hwp",
        pex_dir / "별첨1. 의안설명서.hwp",
        pex_dir / "별첨2. 제2기 감사보고서.pdf",
        pex_dir / "별첨3. 제2기 조합 영업보고서.hwp",
        pex_dir / "별첨4. 의결권행사통보서.hwp",
        project_dir / "[공문] 트리거메디테크3호조합 제1기 정기조합원총회 개최의 건.hwp",
        project_dir / "별첨1. 의안설명서.hwp",
        project_dir / "별첨2. 제1기 감사보고서.pdf",
        project_dir / "별첨3. 제1기 조합 영업보고서.hwp",
        project_dir / "별첨4. 개정 규약(안).pdf",
        project_dir / "별첨5. 규약 신구대조표.xlsx",
        project_dir / "별첨6. 서면의결서.hwp",
        project_dir / "[트리거메디테크3호조합] 제1기 조합원총회 의사록.doc",
        gp_dir / "[공문] 트리거투자파트너스(유) 정기사원총회 개최의 건.hwp",
        gp_dir / "별첨1. 의안설명서.hwp",
        gp_dir / "별첨2. 재무제표증명원.pdf",
        gp_dir / "별첨3. 서면의결서.hwp",
        gp_dir / "정기사원총회 의사록.hwp",
    ]:
        path.write_bytes(b"dummy")

    def fake_preview(self, path: Path) -> str:
        name = path.name
        if "PEX" in name or "투자보고회" in name:
            return "트리거-글로벌PEX투자조합 제2기 정기조합원총회 및 온기 투자보고회"
        if "트리거메디테크3호조합" in name and "공문" in name:
            return "트리거 메디테크 3호 조합 제1기 정기조합원총회 개최의 건\n제2호 의안 : 신규 참여인력 추가의 건\n제3호 의안 : 규약 변경의 건"
        if "신구대조표" in name:
            return "규약 변경 대조표\n변경개요 : 제28조(성과보수)"
        if "정기사원총회" in name:
            return "정기 사원총회 의사록\n제2호 의안 : 준법감시인 변경의 건"
        return ""

    monkeypatch.setattr(MeetingPacketRPAService, "_extract_preview_text", fake_preview)

    service = MeetingPacketRPAService()
    result = service.analyze_root(str(tmp_path))

    packet_map = {row.package_name: row.packet_type for row in result.packages}
    assert packet_map["1_조합원통지(25.03.06)_트리거-글로벌PEX투자조합"] == "fund_lp_regular_meeting_pex"
    assert packet_map["[트리거메디테크3호조합]"] == "fund_lp_regular_meeting_project_with_bylaw_amendment"
    assert packet_map["[2025년 정기사원총회]"] == "gp_shareholders_meeting"


def test_generation_plan_marks_external_and_assisted_slots(db_session, client, sample_fund, sample_investment):
    db_session.add(
        BizReport(
            fund_id=sample_fund["id"],
            report_year=2025,
            status="작성중",
        )
    )
    db_session.commit()

    response = client.post(
        "/api/meeting-rpa/generation-plan",
        json={
            "fund_id": sample_fund["id"],
            "packet_type": "fund_lp_regular_meeting_project_with_bylaw_amendment",
            "include_bylaw_amendment": True,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["recommended_packet_type"] == "fund_lp_regular_meeting_project_with_bylaw_amendment"
    assert isinstance(payload["packet_reasoning"], list)
    slots = {row["slot"]: row for row in payload["slots"]}
    assert slots["audit_report"]["status"] == "external_required"
    assert slots["business_report"]["generation_mode"] == "erp_rpa"
    assert slots["business_report"]["builder_candidate"] == "erp_biz_report_draft"
    assert slots["official_notice"]["recommended_layout"] == "one_page"
    assert slots["bylaw_amendment_draft"]["status"] == "assisted"
    assert slots["minutes"]["status"] == "assisted"


def test_fund_scoped_generation_plan_route_returns_packet_recommendation(db_session, client, sample_fund):
    response = client.get(
        f"/api/funds/{sample_fund['id']}/meeting-rpa/plan",
        params={"include_bylaw_amendment": "true"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["fund_id"] == sample_fund["id"]
    assert payload["recommended_packet_type"] == "fund_lp_regular_meeting_project_with_bylaw_amendment"
    assert any("규약 변경" in item for item in payload["packet_reasoning"])
