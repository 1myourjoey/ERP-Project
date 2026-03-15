from pathlib import Path
import tempfile

from openpyxl import Workbook


def _create_workbook(path, sheet_names: list[str]) -> None:
    workbook = Workbook()
    first_sheet = workbook.active
    first_sheet.title = sheet_names[0]
    for sheet_name in sheet_names[1:]:
        workbook.create_sheet(sheet_name)
    workbook.save(path)


def test_create_template_version_imports_sheet_catalog_from_workbook(client):
    temp_file = tempfile.NamedTemporaryFile(
        suffix=".xlsx",
        dir=Path.cwd(),
        delete=False,
    )
    temp_file.close()
    workbook_path = Path(temp_file.name)
    _create_workbook(workbook_path, ["개요", "투자내역", "핵심인력"])

    try:
        template_response = client.post(
            "/api/proposal-templates",
            json={
                "code": "growth-finance-2026",
                "name": "성장금융 제안서",
                "institution_type": "growth",
                "legacy_template_type": "growth-finance",
            },
        )
        assert template_response.status_code == 201
        template_id = template_response.json()["id"]

        version_response = client.post(
            f"/api/proposal-templates/{template_id}/versions",
            json={
                "version_label": "2026-v1",
                "status": "draft",
                "source_path": str(workbook_path),
                "import_workbook_sheets": True,
            },
        )
        assert version_response.status_code == 201
        payload = version_response.json()

        assert payload["source_filename"] == workbook_path.name
        assert [sheet["sheet_name"] for sheet in payload["sheets"]] == ["개요", "투자내역", "핵심인력"]
        assert [sheet["sheet_code"] for sheet in payload["sheets"]] == ["sheet-1", "sheet-2", "sheet-3"]
        assert payload["sheet_count"] == 3
    finally:
        workbook_path.unlink(missing_ok=True)


def test_active_version_switches_previous_version_to_archived(client):
    template_response = client.post(
        "/api/proposal-templates",
        json={
            "code": "nong-template",
            "name": "농식품 모태펀드 양식",
            "institution_type": "nong",
        },
    )
    assert template_response.status_code == 201
    template_id = template_response.json()["id"]

    first_version = client.post(
        f"/api/proposal-templates/{template_id}/versions",
        json={
            "version_label": "2026-v1",
            "status": "active",
            "sheets": [
                {"sheet_code": "overview", "sheet_name": "개요", "sheet_kind": "scalar"},
            ],
            "field_mappings": [
                {
                    "sheet_code": "overview",
                    "field_key": "gp_name",
                    "target_cell": "B2",
                    "value_source": "selected_gp_entity.name",
                    "is_required": True,
                }
            ],
            "validation_rules": [
                {
                    "sheet_code": "overview",
                    "rule_code": "gp-name-required",
                    "rule_type": "required",
                    "severity": "error",
                    "target_ref": "B2",
                    "rule_payload": {"field_key": "gp_name"},
                    "message": "GP명은 필수입니다.",
                }
            ],
        },
    )
    assert first_version.status_code == 201
    first_version_id = first_version.json()["id"]
    assert first_version.json()["status"] == "active"
    assert first_version.json()["field_mappings"][0]["field_key"] == "gp_name"

    second_version = client.post(
        f"/api/proposal-templates/{template_id}/versions",
        json={
            "version_label": "2026-v2",
            "status": "draft",
            "sheets": [
                {"sheet_code": "overview", "sheet_name": "개요", "sheet_kind": "scalar"},
                {"sheet_code": "members", "sheet_name": "핵심인력", "sheet_kind": "table"},
            ],
            "table_mappings": [
                {
                    "sheet_code": "members",
                    "table_key": "core-managers",
                    "start_cell": "A5",
                    "row_source": "proposal_managers",
                    "columns": [
                        {"field_key": "manager_name", "target_column": "A"},
                        {"field_key": "position", "target_column": "B"},
                    ],
                    "append_mode": "insert",
                }
            ],
        },
    )
    assert second_version.status_code == 201
    second_version_id = second_version.json()["id"]
    assert second_version.json()["status"] == "draft"
    assert second_version.json()["table_mappings"][0]["table_key"] == "core-managers"

    activate_response = client.post(f"/api/proposal-template-versions/{second_version_id}/activate")
    assert activate_response.status_code == 200
    assert activate_response.json()["status"] == "active"

    refreshed_first = client.get(f"/api/proposal-template-versions/{first_version_id}")
    assert refreshed_first.status_code == 200
    assert refreshed_first.json()["status"] == "archived"

    template_detail = client.get(f"/api/proposal-templates/{template_id}")
    assert template_detail.status_code == 200
    detail_payload = template_detail.json()
    assert detail_payload["active_version_id"] == second_version_id
    assert detail_payload["active_version_label"] == "2026-v2"


def test_clone_version_copies_registry_rows_into_new_draft(client):
    template_response = client.post(
        "/api/proposal-templates",
        json={
            "code": "clone-template",
            "name": "Clone Template",
            "institution_type": "growth",
        },
    )
    assert template_response.status_code == 201
    template_id = template_response.json()["id"]

    source_version = client.post(
        f"/api/proposal-templates/{template_id}/versions",
        json={
            "version_label": "2026-v1",
            "status": "active",
            "source_path": "C:/templates/source.xlsx",
            "effective_from": "2026-01-01",
            "sheets": [
                {"sheet_code": "overview", "sheet_name": "Overview", "sheet_kind": "scalar"},
                {"sheet_code": "members", "sheet_name": "Members", "sheet_kind": "table"},
            ],
            "field_mappings": [
                {
                    "sheet_code": "overview",
                    "field_key": "gp_name",
                    "target_cell": "B2",
                    "value_source": "selected_gp_entity.name",
                    "is_required": True,
                }
            ],
            "table_mappings": [
                {
                    "sheet_code": "members",
                    "table_key": "core-managers",
                    "start_cell": "A5",
                    "row_source": "proposal_managers",
                    "columns": [
                        {"field_key": "manager_name", "target_column": "A"},
                    ],
                }
            ],
            "validation_rules": [
                {
                    "sheet_code": "overview",
                    "rule_code": "gp-name-required",
                    "rule_type": "required",
                    "message": "GP name is required.",
                }
            ],
        },
    )
    assert source_version.status_code == 201
    source_version_id = source_version.json()["id"]

    clone_response = client.post(
        f"/api/proposal-template-versions/{source_version_id}/clone",
        json={
            "version_label": "2026-v2",
            "status": "draft",
            "notes": "cloned for 2027 adjustments",
        },
    )
    assert clone_response.status_code == 201
    payload = clone_response.json()

    assert payload["id"] != source_version_id
    assert payload["version_label"] == "2026-v2"
    assert payload["status"] == "draft"
    assert payload["source_path"] == "C:/templates/source.xlsx"
    assert payload["effective_from"] == "2026-01-01"
    assert payload["notes"] == "cloned for 2027 adjustments"
    assert [sheet["sheet_code"] for sheet in payload["sheets"]] == ["overview", "members"]
    assert payload["field_mappings"][0]["target_cell"] == "B2"
    assert payload["table_mappings"][0]["table_key"] == "core-managers"
    assert payload["validation_rules"][0]["rule_code"] == "gp-name-required"


def test_compare_versions_returns_only_changed_sheets_and_mappings(client):
    template_response = client.post(
        "/api/proposal-templates",
        json={
            "code": "compare-template",
            "name": "Compare Template",
            "institution_type": "growth",
        },
    )
    assert template_response.status_code == 201
    template_id = template_response.json()["id"]

    base_version = client.post(
        f"/api/proposal-templates/{template_id}/versions",
        json={
            "version_label": "2026-v1",
            "status": "draft",
            "sheets": [
                {"sheet_code": "overview", "sheet_name": "Overview", "sheet_kind": "scalar"},
                {"sheet_code": "members", "sheet_name": "Members", "sheet_kind": "table"},
            ],
            "field_mappings": [
                {
                    "sheet_code": "overview",
                    "field_key": "gp_name",
                    "target_cell": "B2",
                    "value_source": "selected_gp_entity.name",
                }
            ],
            "table_mappings": [
                {
                    "sheet_code": "members",
                    "table_key": "core-managers",
                    "start_cell": "A5",
                    "row_source": "proposal_managers",
                    "columns": [
                        {"field_key": "manager_name", "target_column": "A"},
                    ],
                }
            ],
            "validation_rules": [
                {
                    "sheet_code": "overview",
                    "rule_code": "gp-name-required",
                    "rule_type": "required",
                    "message": "GP name is required.",
                },
                {
                    "sheet_code": "members",
                    "rule_code": "max-core-rows",
                    "rule_type": "max_rows",
                    "rule_payload": {"max_rows": 10},
                    "message": "Core managers must be 10 rows or fewer.",
                },
            ],
        },
    )
    assert base_version.status_code == 201
    base_version_id = base_version.json()["id"]

    target_version = client.post(
        f"/api/proposal-templates/{template_id}/versions",
        json={
            "version_label": "2026-v2",
            "status": "draft",
            "sheets": [
                {"sheet_code": "overview", "sheet_name": "Overview", "sheet_kind": "scalar"},
                {"sheet_code": "members", "sheet_name": "Members v2", "sheet_kind": "table"},
                {"sheet_code": "audit", "sheet_name": "Audit", "sheet_kind": "table"},
            ],
            "field_mappings": [
                {
                    "sheet_code": "overview",
                    "field_key": "gp_name",
                    "target_cell": "C3",
                    "value_source": "selected_gp_entity.name",
                },
                {
                    "sheet_code": "overview",
                    "field_key": "gp_ceo",
                    "target_cell": "B4",
                    "value_source": "selected_gp_entity.representative",
                },
            ],
            "table_mappings": [
                {
                    "sheet_code": "members",
                    "table_key": "core-managers",
                    "start_cell": "A6",
                    "row_source": "proposal_managers",
                    "columns": [
                        {"field_key": "manager_name", "target_column": "A"},
                    ],
                }
            ],
            "validation_rules": [
                {
                    "sheet_code": "overview",
                    "rule_code": "gp-name-required",
                    "rule_type": "required",
                    "message": "GP name is mandatory.",
                }
            ],
        },
    )
    assert target_version.status_code == 201
    target_version_id = target_version.json()["id"]

    compare_response = client.get(
        f"/api/proposal-template-versions/compare?base_version_id={base_version_id}&target_version_id={target_version_id}"
    )
    assert compare_response.status_code == 200
    payload = compare_response.json()

    assert payload["base_version_label"] == "2026-v1"
    assert payload["target_version_label"] == "2026-v2"
    assert payload["changed_sheet_codes"] == ["audit", "members", "overview"]

    sheet_change_map = {item["key"]: item for item in payload["sheet_changes"]}
    assert sheet_change_map["audit"]["change_type"] == "added"
    assert sheet_change_map["members"]["change_type"] == "modified"
    assert "sheet_name" in sheet_change_map["members"]["changed_fields"]

    field_change_map = {item["key"]: item for item in payload["field_mapping_changes"]}
    assert field_change_map["overview:gp_name"]["change_type"] == "modified"
    assert "target_cell" in field_change_map["overview:gp_name"]["changed_fields"]
    assert field_change_map["overview:gp_ceo"]["change_type"] == "added"

    table_change_map = {item["key"]: item for item in payload["table_mapping_changes"]}
    assert table_change_map["members:core-managers"]["change_type"] == "modified"
    assert "start_cell" in table_change_map["members:core-managers"]["changed_fields"]

    validation_change_map = {item["key"]: item for item in payload["validation_rule_changes"]}
    assert validation_change_map["members:max-core-rows"]["change_type"] == "removed"
    assert validation_change_map["overview:gp-name-required"]["change_type"] == "modified"


def test_replace_version_registry_updates_sheets_and_mappings(client):
    template_response = client.post(
        "/api/proposal-templates",
        json={
            "code": "editable-template",
            "name": "Editable Template",
            "institution_type": "growth",
        },
    )
    assert template_response.status_code == 201
    template_id = template_response.json()["id"]

    version_response = client.post(
        f"/api/proposal-templates/{template_id}/versions",
        json={
            "version_label": "2026-v1",
            "status": "draft",
            "sheets": [
                {"sheet_code": "overview", "sheet_name": "Overview", "sheet_kind": "scalar"},
            ],
            "field_mappings": [
                {
                    "sheet_code": "overview",
                    "field_key": "gp_name",
                    "target_cell": "B2",
                    "value_source": "selected_gp_entity.name",
                }
            ],
        },
    )
    assert version_response.status_code == 201
    version_id = version_response.json()["id"]

    save_response = client.put(
        f"/api/proposal-template-versions/{version_id}/registry",
        json={
            "sheets": [
                {"sheet_code": "overview", "sheet_name": "Overview", "sheet_kind": "scalar", "display_order": 0, "is_required": True},
                {"sheet_code": "members", "sheet_name": "Members", "sheet_kind": "table", "display_order": 1, "is_required": True},
            ],
            "field_mappings": [
                {
                    "sheet_code": "overview",
                    "field_key": "gp_name",
                    "target_cell": "C3",
                    "value_source": "selected_gp_entity.name",
                    "is_required": True,
                    "display_order": 0,
                },
                {
                    "sheet_code": "overview",
                    "field_key": "gp_ceo",
                    "target_cell": "C4",
                    "value_source": "selected_gp_entity.representative",
                    "is_required": False,
                    "display_order": 1,
                },
            ],
            "table_mappings": [
                {
                    "sheet_code": "members",
                    "table_key": "core-managers",
                    "start_cell": "A5",
                    "row_source": "proposal_managers",
                    "columns": [
                        {"field_key": "manager_name", "target_column": "A"},
                        {"field_key": "position", "target_column": "B"},
                    ],
                }
            ],
            "validation_rules": [
                {
                    "sheet_code": "overview",
                    "rule_code": "gp-name-required",
                    "rule_type": "required",
                    "severity": "error",
                    "target_ref": "C3",
                    "rule_payload": {"field_key": "gp_name"},
                    "message": "GP name is required.",
                }
            ],
        },
    )
    assert save_response.status_code == 200
    payload = save_response.json()

    assert [sheet["sheet_code"] for sheet in payload["sheets"]] == ["overview", "members"]
    assert [row["field_key"] for row in payload["field_mappings"]] == ["gp_name", "gp_ceo"]
    assert payload["field_mappings"][0]["target_cell"] == "C3"
    assert payload["table_mappings"][0]["table_key"] == "core-managers"
    assert payload["validation_rules"][0]["rule_code"] == "gp-name-required"
