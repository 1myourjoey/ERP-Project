from datetime import date, timedelta


def _create_task(client, title: str, category: str, fund_id: int | None = None, investment_id: int | None = None):
    payload = {
        "title": title,
        "quadrant": "Q1",
        "estimated_time": "30m",
        "category": category,
    }
    if fund_id is not None:
        payload["fund_id"] = fund_id
    if investment_id is not None:
        payload["investment_id"] = investment_id
    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 201
    return response.json()


def _create_worklog(client, task_id: int, title: str, category: str, lesson: str, days_ago: int = 0):
    target_date = (date.today() - timedelta(days=days_ago)).isoformat()
    response = client.post(
        "/api/worklogs",
        json={
            "date": target_date,
            "category": category,
            "title": title,
            "content": "test",
            "status": "completed",
            "estimated_time": "30m",
            "actual_time": "30m",
            "task_id": task_id,
            "details": [],
            "lessons": [{"content": lesson}],
            "follow_ups": [],
        },
    )
    assert response.status_code == 201
    return response.json()


def test_worklog_lessons_supports_extended_matching(client, sample_fund, sample_company, sample_investment):
    category = "invest"

    high_match_task = _create_task(
        client,
        title="high-match",
        category=category,
        fund_id=sample_fund["id"],
        investment_id=sample_investment["id"],
    )
    low_match_task = _create_task(client, title="low-match", category=category)

    _create_worklog(
        client,
        task_id=high_match_task["id"],
        title="high",
        category=category,
        lesson="same investment lesson",
        days_ago=1,
    )
    _create_worklog(
        client,
        task_id=low_match_task["id"],
        title="low",
        category=category,
        lesson="generic lesson",
        days_ago=0,
    )

    response = client.get(
        "/api/worklogs/lessons",
        params={
            "category": category,
            "fund_id": sample_fund["id"],
            "investment_id": sample_investment["id"],
            "company_name": sample_company["name"],
            "limit": 5,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 1

    top = payload[0]
    assert "match_score" in top
    assert "match_flags" in top
    assert top["investment_id"] == sample_investment["id"]
    assert top["company_name"] == sample_company["name"]
    assert "same_investment" in top["match_flags"]


def test_worklog_lessons_backward_compatible_category_only(client):
    category = "ops"
    task = _create_task(client, title="ops-task", category=category)
    _create_worklog(
        client,
        task_id=task["id"],
        title="ops-log",
        category=category,
        lesson="ops lesson",
    )

    response = client.get("/api/worklogs/lessons", params={"category": category, "limit": 5})
    assert response.status_code == 200

    payload = response.json()
    assert len(payload) >= 1
    row = payload[0]
    assert row["task_id"] == task["id"]
    assert "match_score" in row
    assert "match_flags" in row
