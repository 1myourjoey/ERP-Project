import pytest


class TestDocumentTemplates:
    def test_list_templates(self, client):
        response = client.get("/api/document-templates")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_list_templates_by_category(self, client):
        response = client.get("/api/document-templates", params={"category": "결성총회"})
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_template(self, client):
        templates = client.get("/api/document-templates").json()
        if not templates:
            pytest.skip("템플릿 시드가 없습니다.")

        response = client.get(f"/api/document-templates/{templates[0]['id']}")
        assert response.status_code == 200
        assert response.json()["id"] == templates[0]["id"]


class TestDocumentGeneration:
    def test_generate_official_letter(self, client, sample_fund_with_lps):
        templates = client.get("/api/document-templates").json()
        if not templates:
            pytest.skip("템플릿 시드가 없습니다.")

        official = next((template for template in templates if "공문" in template["name"]), templates[0])
        response = client.post(
            f"/api/document-templates/{official['id']}/generate",
            params={
                "fund_id": sample_fund_with_lps["id"],
                "assembly_date": "2025-10-24",
                "document_number": "트리거-2025-TEST",
            },
        )
        assert response.status_code == 200
        assert "openxmlformats" in response.headers.get("content-type", "")
        assert len(response.content) > 0

    def test_generate_with_invalid_fund(self, client):
        templates = client.get("/api/document-templates").json()
        if not templates:
            pytest.skip("템플릿 시드가 없습니다.")

        response = client.post(
            f"/api/document-templates/{templates[0]['id']}/generate",
            params={"fund_id": 99999},
        )
        assert response.status_code == 404

    def test_generate_with_invalid_template(self, client, sample_fund):
        response = client.post(
            "/api/document-templates/99999/generate",
            params={"fund_id": sample_fund["id"]},
        )
        assert response.status_code == 404

    def test_generate_validation_error(self, client):
        templates = client.get("/api/document-templates").json()
        if not templates:
            pytest.skip("템플릿 시드가 없습니다.")

        response = client.post(f"/api/document-templates/{templates[0]['id']}/generate")
        assert response.status_code == 422
