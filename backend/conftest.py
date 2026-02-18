import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from seeds.document_templates import seed_document_templates

os.environ["AUTO_CREATE_TABLES"] = "false"

from main import app  # noqa: E402


@pytest.fixture(scope="function")
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        seed_document_templates(session)
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def sample_fund(client):
    response = client.post(
        "/api/funds",
        json={
            "name": "테스트 1호 조합",
            "type": "벤처투자조합",
            "status": "forming",
            "gp": "테스트파트너스(유)",
            "commitment_total": 10_000_000_000,
            "formation_date": "2025-10-24",
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def sample_fund_with_lps(client, sample_fund):
    fund_id = sample_fund["id"]
    lps = [
        {"name": "(주)한국투자", "type": "법인", "commitment": 5_000_000_000},
        {"name": "김철수", "type": "개인", "commitment": 500_000_000},
        {"name": "(주)미래에셋", "type": "법인", "commitment": 3_000_000_000},
    ]
    for lp in lps:
        response = client.post(f"/api/funds/{fund_id}/lps", json=lp)
        assert response.status_code == 201
    return sample_fund


@pytest.fixture
def sample_task(client):
    response = client.post(
        "/api/tasks",
        json={
            "title": "테스트 업무",
            "quadrant": "Q1",
            "estimated_time": "30m",
            "category": "fund_mgmt",
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def sample_company(client):
    response = client.post(
        "/api/companies",
        json={
            "name": "테스트기업(주)",
            "industry": "바이오",
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def sample_investment(client, sample_fund, sample_company):
    response = client.post(
        "/api/investments",
        json={
            "fund_id": sample_fund["id"],
            "company_id": sample_company["id"],
            "investment_date": "2025-06-15",
            "amount": 1_000_000_000,
            "instrument": "보통주",
            "status": "active",
        },
    )
    assert response.status_code == 201
    return response.json()
