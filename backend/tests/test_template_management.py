import json
import re
from io import BytesIO
from zipfile import ZipFile


def _extract_document_xml(docx_bytes: bytes) -> str:
    with ZipFile(BytesIO(docx_bytes)) as archive:
        content = archive.read("word/document.xml")
    return content.decode("utf-8", errors="ignore")


def _template_list(client) -> list[dict]:
    response = client.get("/api/document-templates")
    assert response.status_code == 200
    templates = response.json()
    assert isinstance(templates, list)
    assert templates
    return templates


def test_update_template_custom_data(client):
    templates = _template_list(client)
    template_id = templates[0]["id"]

    payload = {
        "custom_data": {
            "body_text": "CUSTOM_SAVE_MARKER",
            "greeting": "CUSTOM_SAVE_GREETING",
            "introduction_text": "CUSTOM_SAVE_INTRO",
            "agendas": ["CUSTOM_SAVE_AGENDA"],
        }
    }
    response = client.put(f"/api/document-templates/{template_id}/custom", json=payload)
    assert response.status_code == 200

    saved = response.json()
    assert saved["id"] == template_id
    loaded = json.loads(saved["custom_data"])
    assert loaded["agendas"] == ["CUSTOM_SAVE_AGENDA"]
    assert loaded["body_text"] == "CUSTOM_SAVE_MARKER"


def test_preview_template_uses_inline_custom_data(client):
    templates = _template_list(client)
    markers = [
        "INLINE_CUSTOM_BODY",
        "INLINE_CUSTOM_GREETING",
        "INLINE_CUSTOM_INTRO",
        "INLINE_CUSTOM_AGENDA",
    ]
    inline_custom = {
        "body_text": markers[0],
        "greeting": markers[1],
        "introduction_text": markers[2],
        "agendas": [markers[3]],
    }

    matched_any = False
    for template in templates:
        response = client.post(
            f"/api/document-templates/{template['id']}/preview",
            json={"custom_data": inline_custom},
        )
        assert response.status_code == 200
        assert "openxmlformats" in response.headers.get("content-type", "")
        xml = _extract_document_xml(response.content)
        if any(marker in xml for marker in markers):
            matched_any = True
            break

    assert matched_any, "No template reflected inline custom_data in preview output."


def test_generate_template_uses_saved_custom_data(client, sample_fund):
    templates = _template_list(client)
    markers = [
        "SAVED_CUSTOM_BODY",
        "SAVED_CUSTOM_GREETING",
        "SAVED_CUSTOM_INTRO",
        "SAVED_CUSTOM_AGENDA",
    ]
    saved_custom = {
        "body_text": markers[0],
        "greeting": markers[1],
        "introduction_text": markers[2],
        "agendas": [markers[3]],
    }

    matched_any = False
    for template in templates:
        save_response = client.put(
            f"/api/document-templates/{template['id']}/custom",
            json={"custom_data": saved_custom},
        )
        assert save_response.status_code == 200

        generate_response = client.post(
            f"/api/document-templates/{template['id']}/generate",
            params={"fund_id": sample_fund["id"]},
        )
        assert generate_response.status_code == 200
        assert "openxmlformats" in generate_response.headers.get("content-type", "")

        xml = _extract_document_xml(generate_response.content)
        if any(marker in xml for marker in markers):
            matched_any = True
            break

    assert matched_any, "No template reflected saved custom_data in generated output."


def test_preview_template_layout_fit_applies_balanced_margins(client):
    templates = _template_list(client)
    template = templates[0]

    response = client.post(
        f"/api/document-templates/{template['id']}/preview",
        json={
            "custom_data": {
                "__layout_fit__": {
                    "enabled": True,
                    "scale": 0.82,
                    "balanced": True,
                }
            }
        },
    )
    assert response.status_code == 200
    xml = _extract_document_xml(response.content)

    # Word uses twips for page margin values in <w:pgMar>.
    left_match = re.search(r'w:left="(\d+)"', xml)
    right_match = re.search(r'w:right="(\d+)"', xml)
    assert left_match and right_match, "Expected page margin info in generated document XML."

    left = int(left_match.group(1))
    right = int(right_match.group(1))
    assert left == right, "A4 optimization should keep left/right margins balanced."
    assert left < 1418, "A4 fit margin should be tighter than the default 2.5cm margin."
