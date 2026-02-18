def _create_account(
    client,
    *,
    fund_id: int | None,
    code: str,
    name: str,
    category: str = "자산",
    normal_side: str = "차변",
) -> dict:
    response = client.post(
        "/api/accounts",
        json={
            "fund_id": fund_id,
            "code": code,
            "name": name,
            "category": category,
            "normal_side": normal_side,
            "is_active": "true",
            "display_order": 1,
        },
    )
    assert response.status_code == 201
    return response.json()


class TestAccountingAccounts:
    def test_account_crud(self, client, sample_fund):
        account = _create_account(
            client,
            fund_id=sample_fund["id"],
            code="1110",
            name="보통예금",
        )
        account_id = account["id"]

        list_response = client.get("/api/accounts", params={"fund_id": sample_fund["id"]})
        assert list_response.status_code == 200
        assert any(row["id"] == account_id for row in list_response.json())

        update_response = client.put(
            f"/api/accounts/{account_id}",
            json={"name": "당좌예금"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["name"] == "당좌예금"

        delete_response = client.delete(f"/api/accounts/{account_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["ok"] is True

    def test_create_account_validation_error(self, client):
        response = client.post(
            "/api/accounts",
            json={"name": "누락"},
        )
        assert response.status_code == 422


class TestAccountingJournalEntries:
    def test_journal_entry_crud_and_trial_balance(self, client, sample_fund):
        debit_account = _create_account(
            client,
            fund_id=sample_fund["id"],
            code="1110",
            name="보통예금",
            category="자산",
            normal_side="차변",
        )
        credit_account = _create_account(
            client,
            fund_id=sample_fund["id"],
            code="2110",
            name="미지급금",
            category="부채",
            normal_side="대변",
        )

        create_response = client.post(
            "/api/journal-entries",
            json={
                "fund_id": sample_fund["id"],
                "entry_date": "2025-10-24",
                "entry_type": "일반분개",
                "description": "초기 분개",
                "lines": [
                    {"account_id": debit_account["id"], "debit": 1_000_000, "credit": 0},
                    {"account_id": credit_account["id"], "debit": 0, "credit": 1_000_000},
                ],
            },
        )
        assert create_response.status_code == 201
        entry = create_response.json()
        entry_id = entry["id"]
        assert len(entry["lines"]) == 2

        list_response = client.get("/api/journal-entries", params={"fund_id": sample_fund["id"]})
        assert list_response.status_code == 200
        assert any(row["id"] == entry_id for row in list_response.json())

        update_response = client.put(
            f"/api/journal-entries/{entry_id}",
            json={
                "description": "수정 분개",
                "lines": [
                    {"account_id": debit_account["id"], "debit": 1_500_000, "credit": 0},
                    {"account_id": credit_account["id"], "debit": 0, "credit": 1_500_000},
                ],
            },
        )
        assert update_response.status_code == 200
        assert update_response.json()["description"] == "수정 분개"

        trial_balance = client.get(
            "/api/accounts/trial-balance",
            params={"fund_id": sample_fund["id"], "as_of_date": "2025-12-31"},
        )
        assert trial_balance.status_code == 200
        items = trial_balance.json()
        debit_row = next(row for row in items if row["account_id"] == debit_account["id"])
        credit_row = next(row for row in items if row["account_id"] == credit_account["id"])
        assert debit_row["debit_total"] == 1_500_000
        assert credit_row["credit_total"] == 1_500_000

        delete_response = client.delete(f"/api/journal-entries/{entry_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["ok"] is True

        get_deleted = client.get(f"/api/journal-entries/{entry_id}")
        assert get_deleted.status_code == 404

    def test_journal_entry_unbalanced_returns_400(self, client, sample_fund):
        account1 = _create_account(
            client,
            fund_id=sample_fund["id"],
            code="1110",
            name="보통예금",
        )
        account2 = _create_account(
            client,
            fund_id=sample_fund["id"],
            code="2110",
            name="미지급금",
            category="부채",
            normal_side="대변",
        )
        response = client.post(
            "/api/journal-entries",
            json={
                "fund_id": sample_fund["id"],
                "entry_date": "2025-10-24",
                "lines": [
                    {"account_id": account1["id"], "debit": 1_000_000, "credit": 0},
                    {"account_id": account2["id"], "debit": 0, "credit": 900_000},
                ],
            },
        )
        assert response.status_code == 400

    def test_delete_account_in_use_returns_409(self, client, sample_fund):
        account1 = _create_account(
            client,
            fund_id=sample_fund["id"],
            code="1110",
            name="보통예금",
        )
        account2 = _create_account(
            client,
            fund_id=sample_fund["id"],
            code="2110",
            name="미지급금",
            category="부채",
            normal_side="대변",
        )
        entry_response = client.post(
            "/api/journal-entries",
            json={
                "fund_id": sample_fund["id"],
                "entry_date": "2025-10-24",
                "lines": [
                    {"account_id": account1["id"], "debit": 100_000, "credit": 0},
                    {"account_id": account2["id"], "debit": 0, "credit": 100_000},
                ],
            },
        )
        assert entry_response.status_code == 201

        delete_response = client.delete(f"/api/accounts/{account1['id']}")
        assert delete_response.status_code == 409
