from models.biz_report import BizReport


def test_prepare_meeting_packet_creates_draft_with_agendas_and_slots(client, sample_fund):
    response = client.post(
        f"/api/funds/{sample_fund['id']}/meeting-packets/prepare",
        json={
            "fund_id": sample_fund["id"],
            "packet_type": "fund_lp_regular_meeting_project_with_bylaw_amendment",
            "meeting_date": "2026-03-30",
            "meeting_time": "13:00",
            "meeting_method": "서면결의",
            "location": "트리거투자파트너스 회의실",
            "chair_name": "서원일",
            "document_number": "트리거-2026-07호",
            "report_year": 2025,
            "include_bylaw_amendment": True,
        },
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
    db_session.add(
        BizReport(
            fund_id=sample_fund_with_lps["id"],
            report_year=2025,
            status="작성중",
            total_commitment=10_000_000_000,
            total_paid_in=5_000_000_000,
            fund_nav=4_200_000_000,
            total_invested=3_000_000_000,
            market_overview="시장과 포트폴리오 상황을 검토했습니다.",
            portfolio_summary="주요 투자자산 현황을 정리했습니다.",
            key_issues="추가 납입과 준법 검토 사항이 있습니다.",
        )
    )
    db_session.commit()

    draft_response = client.post(
        f"/api/funds/{sample_fund_with_lps['id']}/meeting-packets/prepare",
        json={
            "fund_id": sample_fund_with_lps["id"],
            "packet_type": "fund_lp_regular_meeting_project",
            "meeting_date": "2026-03-30",
            "meeting_time": "13:00",
            "meeting_method": "서면결의",
            "location": "트리거투자파트너스 회의실",
            "chair_name": "서원일",
            "document_number": "트리거-2026-07호",
            "report_year": 2025,
            "include_bylaw_amendment": False,
        },
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
    assert "audit_report" in payload["missing_slots"]

    zip_response = client.get(f"/api/documents/{payload['zip_attachment_id']}/download")
    assert zip_response.status_code == 200
    assert zip_response.headers["content-type"].startswith("application/zip")
