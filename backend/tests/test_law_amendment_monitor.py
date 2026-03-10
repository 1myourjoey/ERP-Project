import pytest

from models.compliance import ComplianceDocument


def test_extract_law_text_from_xml_prefers_article_nodes():
    from services.law_amendment_monitor import LawAmendmentMonitor

    xml = """
    <법령>
      <법령명한글>벤처투자법</법령명한글>
      <조문단위>
        <조문번호>제1조</조문번호>
        <조문제목>목적</조문제목>
        <조문내용>이 법은 벤처투자를 촉진한다.</조문내용>
      </조문단위>
      <조문단위>
        <조문번호>제2조</조문번호>
        <조문제목>정의</조문제목>
        <조문내용>정의에 관한 내용이다.</조문내용>
      </조문단위>
    </법령>
    """

    text = LawAmendmentMonitor._extract_law_text_from_xml(xml)
    assert "벤처투자법" in text
    assert "제1조" in text
    assert "이 법은 벤처투자를 촉진한다." in text
    assert "제2조" in text


@pytest.mark.asyncio
async def test_sync_amended_law_documents_upserts_indexed_document(db_session, monkeypatch):
    from services import law_amendment_monitor as monitor_module

    class _FakeIngestionService:
        def ingest_text(self, **kwargs):
            assert kwargs["collection_name"] == "laws"
            assert kwargs["document_id"] > 0
            return {
                "chunk_count": 3,
                "ocr_status": "not_needed",
                "extraction_quality": 0.98,
                "ingest_status": "indexed",
                "index_status": "indexed",
            }

    async def _fake_fetch(self, *, client, mst: str, oc_key: str):
        assert mst == "007361"
        assert oc_key == "valid-oc"
        return "제1조 목적\n벤처투자를 촉진한다."

    monkeypatch.setenv("LAW_API_OC", "valid-oc")
    monkeypatch.setattr(monitor_module, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(monitor_module, "DocumentIngestionService", _FakeIngestionService)
    monkeypatch.setattr(monitor_module.LawAmendmentMonitor, "_fetch_law_full_text", _fake_fetch)

    monitor = monitor_module.LawAmendmentMonitor()
    synced_count = await monitor._sync_amended_law_documents(
        [
            {
                "law_name": "벤처투자 촉진에 관한 법률",
                "mst": "007361",
                "amendment_date": "20260311",
                "effective_date": "20260311",
            }
        ]
    )

    assert synced_count == 1
    row = (
        db_session.query(ComplianceDocument)
        .filter(ComplianceDocument.source_tier == "law", ComplianceDocument.document_role == "007361")
        .one()
    )
    assert row.title == "벤처투자 촉진에 관한 법률"
    assert row.ingest_status == "indexed"
    assert row.index_status == "indexed"
    assert row.content_summary == "Indexed 3 chunks from law.go.kr"
