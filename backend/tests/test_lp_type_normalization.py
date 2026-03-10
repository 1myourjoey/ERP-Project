from services.lp_types import LP_TYPE_SPECIAL_OTHER_POLICY


def test_lp_address_book_create_normalizes_legacy_type_alias(client):
    response = client.post(
        "/api/lp-address-books",
        json={
            "name": "정책 LP",
            "type": "government",
            "business_number": "123-45-67890",
            "is_active": 1,
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["type"] == LP_TYPE_SPECIAL_OTHER_POLICY


def test_lp_transfer_completion_normalizes_new_lp_type_alias(client, sample_fund_with_lps):
    fund_id = sample_fund_with_lps["id"]
    lps = client.get(f"/api/funds/{fund_id}/lps").json()
    from_lp = next(lp for lp in lps if int(lp.get("commitment") or 0) > 0)

    create_response = client.post(
        f"/api/funds/{fund_id}/lp-transfers",
        json={
            "from_lp_id": from_lp["id"],
            "to_lp_name": "정책 신규 LP",
            "to_lp_type": "government",
            "transfer_amount": min(int(from_lp.get("commitment") or 0), 100_000_000),
            "transfer_date": "2026-04-15",
        },
    )
    assert create_response.status_code == 201
    created_transfer = create_response.json()
    assert created_transfer["to_lp_type"] == LP_TYPE_SPECIAL_OTHER_POLICY

    complete_response = client.post(
        f"/api/funds/{fund_id}/lp-transfers/{created_transfer['id']}/complete",
        json={},
    )
    assert complete_response.status_code == 200

    updated_lps = client.get(f"/api/funds/{fund_id}/lps").json()
    new_lp = next(lp for lp in updated_lps if lp["name"] == "정책 신규 LP")
    assert new_lp["type"] == LP_TYPE_SPECIAL_OTHER_POLICY
