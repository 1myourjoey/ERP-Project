from models.compliance import (
    ComplianceDocument,
    ComplianceDocumentChunk,
    ComplianceReviewEvidence,
    ComplianceReviewRun,
)


class _FakeIngestionService:
    def ingest(self, *args, **kwargs):
        return {
            "chunk_count": 2,
            "ocr_status": "completed",
            "extraction_quality": 0.91,
            "ingest_status": "indexed",
            "index_status": "indexed",
        }


def test_upload_investment_contract_stores_investment_scope(client, sample_fund, sample_investment, monkeypatch):
    from routers import legal_documents

    monkeypatch.setattr(legal_documents, "DocumentIngestionService", _FakeIngestionService)

    response = client.post(
        "/api/legal-documents/upload",
        data={
            "title": "Series A 투자계약서",
            "document_type": "agreements",
            "source_tier": "investment_contract",
            "fund_id": str(sample_fund["id"]),
            "investment_id": str(sample_investment["id"]),
            "document_role": "shareholders_agreement",
        },
        files={"file": ("series-a-contract.pdf", b"%PDF-1.4 test", "application/pdf")},
    )
    assert response.status_code == 200
    payload = response.json()
    document = payload["document"]
    assert document["source_tier"] == "investment_contract"
    assert document["scope"] == "investment"
    assert document["source_tier_label"] == "투자계약서"
    assert document["attribution_mode"] == "investment_contract"
    assert document["fund_id"] == sample_fund["id"]
    assert document["investment_id"] == sample_investment["id"]
    assert document["company_id"] == sample_investment["company_id"]
    assert document["ocr_status"] == "completed"
    assert document["index_status"] == "indexed"


def test_upload_fund_bylaw_requires_fund_id(client):
    response = client.post(
        "/api/legal-documents/upload",
        data={
            "title": "조합 규약",
            "document_type": "agreements",
            "source_tier": "fund_bylaw",
        },
        files={"file": ("fund-bylaw.pdf", b"%PDF-1.4 test", "application/pdf")},
    )
    assert response.status_code == 400


def test_upload_special_guideline_uses_fund_scope(client, sample_fund, monkeypatch):
    from routers import legal_documents

    monkeypatch.setattr(legal_documents, "DocumentIngestionService", _FakeIngestionService)

    response = client.post(
        "/api/legal-documents/upload",
        data={
            "title": "모태 수시보고 가이드",
            "document_type": "guidelines",
            "source_tier": "special_guideline",
            "fund_id": str(sample_fund["id"]),
            "document_role": "모태",
        },
        files={"file": ("special-guideline.pdf", b"%PDF-1.4 test", "application/pdf")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["document"]["source_tier"] == "special_guideline"
    assert payload["document"]["scope"] == "fund"
    assert payload["document"]["document_role"] == "모태"
    assert payload["document"]["ownership_label"].endswith("/ 모태")


def test_run_compliance_review_persists_evidence_for_fund_and_investment(
    client,
    db_session,
    sample_fund,
    sample_investment,
    monkeypatch,
):
    from services import compliance_evidence_engine

    law_doc = ComplianceDocument(
        title="벤처투자법",
        document_type="laws",
        source_tier="law",
        scope="global",
        content_summary="law",
        file_path="law.pdf",
        ingest_status="indexed",
        ocr_status="not_needed",
        index_status="indexed",
        is_active=True,
    )
    contract_doc = ComplianceDocument(
        title="Series A 투자계약서",
        document_type="agreements",
        source_tier="investment_contract",
        scope="investment",
        fund_id=sample_fund["id"],
        investment_id=sample_investment["id"],
        company_id=sample_investment["company_id"],
        content_summary="contract",
        file_path="contract.pdf",
        ingest_status="indexed",
        ocr_status="completed",
        index_status="indexed",
        is_active=True,
    )
    db_session.add_all([law_doc, contract_doc])
    db_session.flush()

    db_session.add_all(
        [
            ComplianceDocumentChunk(
                document_id=law_doc.id,
                chunk_key="law-chunk-1",
                page_no=1,
                section_ref="제1조",
                chunk_index=0,
                text="벤처투자법 제1조 관련 조항",
                metadata_json={"document_id": law_doc.id, "source_tier": "law", "scope": "global", "page_no": 1, "section_ref": "제1조"},
            ),
            ComplianceDocumentChunk(
                document_id=contract_doc.id,
                chunk_key="contract-chunk-1",
                page_no=3,
                section_ref="보호조항",
                chunk_index=0,
                text="투자계약서 보호조항 관련 문구",
                metadata_json={
                    "document_id": contract_doc.id,
                    "source_tier": "investment_contract",
                    "scope": "investment",
                    "investment_id": sample_investment["id"],
                    "page_no": 3,
                    "section_ref": "보호조항",
                },
            ),
        ]
    )
    db_session.commit()

    def _fake_search_with_scope(self, query, fund_id=None, fund_type=None, investment_id=None, n_results=10):
        assert fund_id == sample_fund["id"]
        assert investment_id == sample_investment["id"]
        return [
            {
                "id": "law-chunk-1",
                "text": "벤처투자법 제1조 관련 조항",
                "metadata": {"document_id": law_doc.id, "source_tier": "law", "scope": "global", "page_no": 1, "section_ref": "제1조"},
                "distance": 0.1,
                "collection": "laws",
            },
            {
                "id": "contract-chunk-1",
                "text": "투자계약서 보호조항 관련 문구",
                "metadata": {
                    "document_id": contract_doc.id,
                    "source_tier": "investment_contract",
                    "scope": "investment",
                    "investment_id": sample_investment["id"],
                    "page_no": 3,
                    "section_ref": "보호조항",
                },
                "distance": 0.2,
                "collection": "agreements",
            },
        ]

    monkeypatch.setattr(compliance_evidence_engine.VectorDBService, "search_with_scope", _fake_search_with_scope)
    monkeypatch.setattr(compliance_evidence_engine.ComplianceEvidenceEngine, "_get_client", lambda self: None)

    response = client.post(
        "/api/compliance/reviews/run",
        json={
            "fund_id": sample_fund["id"],
            "investment_id": sample_investment["id"],
            "scenario": "investment_precheck",
            "query": "이 투자 실행이 허용되는지 검토해줘",
            "run_rule_engine": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["review"]["target_type"] == "investment"
    assert payload["review"]["investment_id"] == sample_investment["id"]
    assert payload["review"]["result"] == "needs_review"
    assert len(payload["review"]["evidence"]) == 2
    assert {row["source_tier"] for row in payload["review"]["evidence"]} == {"law", "investment_contract"}

    assert db_session.query(ComplianceReviewRun).count() == 1
    assert db_session.query(ComplianceReviewEvidence).count() == 2


def test_officer_brief_summarizes_documents_reviews_and_notice_schedule(client, db_session, sample_fund, sample_investment):
    db_session.add_all(
        [
            ComplianceDocument(
                title="조합 규약",
                document_type="agreements",
                source_tier="fund_bylaw",
                scope="fund",
                fund_id=sample_fund["id"],
                document_role="조합규약",
                file_path="bylaw.pdf",
                ingest_status="indexed",
                ocr_status="completed",
                index_status="indexed",
                is_active=True,
            ),
            ComplianceDocument(
                title="모태 수시보고 가이드",
                document_type="guidelines",
                source_tier="special_guideline",
                scope="fund",
                fund_id=sample_fund["id"],
                document_role="모태",
                file_path="special.pdf",
                ingest_status="indexed",
                ocr_status="completed",
                index_status="indexed",
                is_active=True,
            ),
            ComplianceReviewRun(
                fund_id=sample_fund["id"],
                investment_id=sample_investment["id"],
                company_id=sample_investment["company_id"],
                target_type="investment",
                scenario="investment_precheck",
                query="test",
                trigger_type="event",
                result="conflict",
                prevailing_tier="law",
                summary="계약서와 규약 간 통지 조항 충돌",
                review_status="completed",
            ),
        ]
    )
    db_session.commit()

    response = client.get(f"/api/compliance/funds/{sample_fund['id']}/officer-brief")
    assert response.status_code == 200
    payload = response.json()
    assert payload["fund_id"] == sample_fund["id"]
    assert payload["document_tiers"]["fund_bylaw"] == 1
    assert payload["document_tiers"]["special_guideline"] == 1
    assert payload["review_summary"]["conflict"] == 1
    assert isinstance(payload["notice_schedule"], list) and len(payload["notice_schedule"]) > 0
