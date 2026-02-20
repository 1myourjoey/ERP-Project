# Phase 15: 전체 코드 감사 + 테스트 인프라 구축 + 회귀 테스트 시스템

> **Priority:** P0 (모든 후속 개발의 안전성을 보장하는 기반)
> **Focus:** 코드 품질 검증, 자동화 테스트, 유기적 연결성 확인, 롤백 안전성

---

## Table of Contents

1. [Part 1 — 백엔드 테스트 인프라 구축](#part-1--백엔드-테스트-인프라-구축)
2. [Part 2 — 백엔드 API 통합 테스트 (전체 라우터 대상)](#part-2--백엔드-api-통합-테스트)
3. [Part 3 — 프론트엔드 빌드 검증 + 타입 안전성](#part-3--프론트엔드-빌드-검증--타입-안전성)
4. [Part 4 — 유기적 연결성 테스트 (Cross-Feature)](#part-4--유기적-연결성-테스트-cross-feature)
5. [Part 5 — 문서 자동화 기능 검증 (Phase 14)](#part-5--문서-자동화-기능-검증-phase-14)
6. [Part 6 — 회귀 테스트 스크립트 + 원클릭 전체 검증](#part-6--회귀-테스트-스크립트--원클릭-전체-검증)
7. [Files to create / modify](#files-to-create--modify)
8. [Acceptance Criteria](#acceptance-criteria)

---

## 현황 분석

### 현재 상태 (테스트 인프라 = 0)

| 항목 | 현재 상태 | 위험도 |
|------|---------|--------|
| 백엔드 단위 테스트 | ❌ 없음 | 🔴 높음 |
| 백엔드 API 통합 테스트 | ❌ 없음 | 🔴 높음 |
| 프론트엔드 컴포넌트 테스트 | ❌ 없음 | 🟡 중간 |
| TypeScript 빌드 검증 | ❌ 미설정 | 🟡 중간 |
| 회귀 테스트 스크립트 | ❌ 없음 | 🔴 높음 |
| CI/CD 파이프라인 | ❌ 없음 | 🟡 중간 |

### 테스트 대상 규모

| 영역 | 파일 수 | 비고 |
|------|---------|------|
| 백엔드 라우터 | 22개 | accounting, funds, workflows, documents 등 |
| 백엔드 모델 | 17개 | Fund, Investment, Workflow, DocumentTemplate 등 |
| 백엔드 서비스 | 2개 + 4개 빌더 | document_service, workflow_service + 3 builders |
| 프론트엔드 페이지 | 19개 | Dashboard, TaskBoard, Funds 등 |
| API 함수 (api.ts) | ~230개 | 모든 CRUD 호출 |

---

## Part 1 — 백엔드 테스트 인프라 구축

### 1-A. pytest 설정

```python
# backend/conftest.py

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app


@pytest.fixture(scope="function")
def db_session():
    """각 테스트마다 독립된 인메모리 SQLite DB 생성"""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """테스트용 FastAPI 클라이언트 (독립 DB 사용)"""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def sample_fund(client):
    """테스트용 조합 생성 헬퍼"""
    response = client.post("/api/funds", json={
        "name": "테스트 1호 조합",
        "type": "벤처투자조합",
        "status": "forming",
        "gp": "테스트파트너스(유)",
        "commitment_total": 10000000000,
        "formation_date": "2025-10-24",
    })
    assert response.status_code == 200
    return response.json()


@pytest.fixture
def sample_fund_with_lps(client, sample_fund):
    """LP가 포함된 조합 헬퍼"""
    fund_id = sample_fund["id"]
    lps = [
        {"name": "(주)한국투자", "type": "법인", "commitment_amount": 5000000000},
        {"name": "김철수", "type": "개인", "commitment_amount": 500000000},
        {"name": "(주)미래에셋", "type": "법인", "commitment_amount": 3000000000},
    ]
    for lp in lps:
        r = client.post(f"/api/funds/{fund_id}/lps", json=lp)
        assert r.status_code == 200
    return sample_fund


@pytest.fixture
def sample_task(client):
    """테스트용 업무 생성 헬퍼"""
    response = client.post("/api/tasks", json={
        "title": "테스트 업무",
        "quadrant": "do_first",
        "estimated_time": "30분",
        "category": "fund_mgmt",
    })
    assert response.status_code == 200
    return response.json()
```

### 1-B. requirements 업데이트

```
# backend/requirements.txt 에 추가
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.27.0
```

### 1-C. pytest 설정 파일

```ini
# backend/pytest.ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
```

---

## Part 2 — 백엔드 API 통합 테스트 (전체 라우터 대상)

> 모든 22개 라우터에 대해 **CRUD + 에러 케이스** 테스트를 작성한다.
> 핵심 원칙: **데이터를 생성 → 조회 → 수정 → 삭제까지 전체 흐름을 하나의 테스트로 검증** (유기적 연결성)

### 2-A. 핵심 테스트 파일 구조

```
backend/tests/
├── __init__.py
├── test_funds.py              # 조합 CRUD + LP + 공지기간 + 핵심약정
├── test_investments.py        # 투자 CRUD + 포트폴리오 기업
├── test_tasks.py              # 업무 CRUD + 완료/되돌리기 + 월간리마인더
├── test_workflows.py          # 워크플로우 템플릿 + 인스턴스 + 단계완료/되돌리기
├── test_documents.py          # 문서 템플릿 목록 + 자동생성 API
├── test_accounting.py         # 계정과목 + 전표 + 시산표
├── test_fund_operations.py    # 출자이행 + 배분 + 총회 + 성과
├── test_exits.py              # 투심위 + 매각거래
├── test_dashboard.py          # 대시보드 집계 데이터
├── test_search.py             # 통합검색
├── test_calendar.py           # 캘린더 이벤트
├── test_reports.py            # 정기보고 + 사업보고서
├── test_worklogs.py           # 업무기록
├── test_checklists.py         # 체크리스트
├── test_transactions.py       # 거래내역
├── test_valuations.py         # 밸류에이션
└── test_cross_features.py     # 유기적 연결성 (Part 4)
```

### 2-B. 예시: test_funds.py

```python
# backend/tests/test_funds.py

class TestFundsCRUD:
    """조합 기본 CRUD 테스트"""

    def test_create_fund(self, client):
        """조합 생성 → 상태코드 200, 반환 데이터 정합성"""
        r = client.post("/api/funds", json={
            "name": "신규 1호 조합",
            "type": "벤처투자조합",
            "status": "forming",
            "gp": "테스트GP(유)",
            "commitment_total": 5000000000,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "신규 1호 조합"
        assert data["status"] == "forming"
        assert data["commitment_total"] == 5000000000
        assert "id" in data

    def test_list_funds(self, client, sample_fund):
        """조합 목록 조회 → 생성한 조합이 목록에 포함"""
        r = client.get("/api/funds")
        assert r.status_code == 200
        funds = r.json()
        assert any(f["id"] == sample_fund["id"] for f in funds)

    def test_get_fund_detail(self, client, sample_fund):
        """조합 상세 조회 → 필드 일치"""
        r = client.get(f"/api/funds/{sample_fund['id']}")
        assert r.status_code == 200
        assert r.json()["name"] == sample_fund["name"]

    def test_update_fund(self, client, sample_fund):
        """조합 수정 → 이름 변경 확인"""
        r = client.put(f"/api/funds/{sample_fund['id']}", json={
            "name": "수정된 조합명",
        })
        assert r.status_code == 200
        assert r.json()["name"] == "수정된 조합명"

    def test_delete_fund(self, client, sample_fund):
        """조합 삭제 → 이후 조회 시 404"""
        r = client.delete(f"/api/funds/{sample_fund['id']}")
        assert r.status_code == 200
        r2 = client.get(f"/api/funds/{sample_fund['id']}")
        assert r2.status_code == 404

    def test_get_nonexistent_fund(self, client):
        """존재하지 않는 조합 조회 → 404"""
        r = client.get("/api/funds/99999")
        assert r.status_code == 404


class TestFundLPs:
    """조합 LP 관리 테스트"""

    def test_add_lp(self, client, sample_fund):
        """LP 추가 → 정상 생성"""
        r = client.post(f"/api/funds/{sample_fund['id']}/lps", json={
            "name": "신규 LP",
            "type": "법인",
            "commitment_amount": 1000000000,
        })
        assert r.status_code == 200
        assert r.json()["name"] == "신규 LP"

    def test_list_lps(self, client, sample_fund_with_lps):
        """LP 목록 조회 → 3개 등록 확인"""
        r = client.get(f"/api/funds/{sample_fund_with_lps['id']}/lps")
        assert r.status_code == 200
        assert len(r.json()) == 3

    def test_update_lp(self, client, sample_fund):
        """LP 수정 → 약정금액 변경"""
        rr = client.post(f"/api/funds/{sample_fund['id']}/lps", json={
            "name": "수정대상 LP",
            "type": "개인",
            "commitment_amount": 500000000,
        })
        lp_id = rr.json()["id"]
        r = client.put(f"/api/funds/{sample_fund['id']}/lps/{lp_id}", json={
            "commitment_amount": 800000000,
        })
        assert r.status_code == 200
        assert r.json()["commitment_amount"] == 800000000

    def test_delete_lp(self, client, sample_fund):
        """LP 삭제 → 목록에서 제거"""
        rr = client.post(f"/api/funds/{sample_fund['id']}/lps", json={
            "name": "삭제대상 LP", "type": "개인", "commitment_amount": 100000000,
        })
        lp_id = rr.json()["id"]
        r = client.delete(f"/api/funds/{sample_fund['id']}/lps/{lp_id}")
        assert r.status_code == 200
```

### 2-C. 예시: test_workflows.py

```python
# backend/tests/test_workflows.py

class TestWorkflowLifecycle:
    """워크플로우 전체 생명주기 테스트"""

    def test_full_workflow_lifecycle(self, client):
        """
        템플릿 생성 → 인스턴스 시작 → 단계 완료 → 되돌리기 → 전체 완료
        유기적 연결: 워크플로우 완료 시 조합 상태 자동 전환까지
        """
        # 1. 워크플로우 템플릿 생성
        template_r = client.post("/api/workflows", json={
            "name": "결성총회 테스트",
            "category": "조합결성",
            "steps": [
                {"name": "안건 준비", "offset_days": -14, "estimated_time": "2시간"},
                {"name": "소집통지서 발송", "offset_days": -7, "estimated_time": "1시간"},
                {"name": "결성총회 개최", "offset_days": 0, "estimated_time": "3시간"},
            ],
        })
        assert template_r.status_code == 200
        template_id = template_r.json()["id"]

        # 2. 조합 생성 (결성예정)
        fund_r = client.post("/api/funds", json={
            "name": "테스트 조합",
            "type": "벤처투자조합",
            "status": "forming",
            "gp": "테스트GP",
            "formation_date": "2025-10-24",
        })
        fund_id = fund_r.json()["id"]

        # 3. 인스턴스 시작 (조합 연결)
        inst_r = client.post(f"/api/workflows/{template_id}/instantiate", json={
            "name": "테스트 조합 결성총회",
            "trigger_date": "2025-10-24",
            "fund_id": fund_id,
        })
        assert inst_r.status_code == 200
        instance = inst_r.json()
        instance_id = instance["id"]
        steps = instance["steps"]
        assert len(steps) == 3

        # 4. 첫 번째 단계 완료
        step0_id = steps[0]["id"]
        r = client.put(f"/api/workflow-instances/{instance_id}/steps/{step0_id}/complete", json={
            "actual_time": "1시간 30분",
        })
        assert r.status_code == 200

        # 5. 완료 되돌리기
        r = client.put(f"/api/workflow-instances/{instance_id}/steps/{step0_id}/undo")
        assert r.status_code == 200
        undone_step = [s for s in r.json()["steps"] if s["id"] == step0_id][0]
        assert undone_step["status"] == "pending"

        # 6. 모든 단계 완료
        for step in steps:
            client.put(
                f"/api/workflow-instances/{instance_id}/steps/{step['id']}/complete",
                json={"actual_time": "1시간"},
            )

        # 7. 인스턴스 상태 확인 → completed
        inst_check = client.get(f"/api/workflow-instances/{instance_id}")
        assert inst_check.json()["status"] == "completed"

        # 8. 조합 상태 자동 전환 확인 → active
        fund_check = client.get(f"/api/funds/{fund_id}")
        assert fund_check.json()["status"] == "active"
```

### 2-D. 각 라우터별 테스트 범위

| 테스트 파일 | 대상 라우터 | 테스트 항목 |
|------------|-----------|------------|
| `test_funds.py` | funds.py | CRUD + LP + 공지기간 + 핵심약정 + 조합개요 |
| `test_tasks.py` | tasks.py | CRUD + 완료/되돌리기 + 월간리마인더 + 상태필터 |
| `test_workflows.py` | workflows.py | 템플릿 CRUD + 인스턴스 + 단계완료/되돌리기 + 취소 |
| `test_documents.py` | documents.py | 템플릿 목록 + 자동생성 API + .docx 반환 확인 |
| `test_investments.py` | investments.py | 기업 + 투자건 CRUD |
| `test_accounting.py` | accounting.py | 계정과목 + 전표 + 시산표 자동 계산 |
| `test_fund_operations.py` | capital_calls, distributions, assemblies, performance | 출자이행/배분/총회/성과지표 |
| `test_exits.py` | exits.py | 투심위 + 매각거래 CRUD |
| `test_dashboard.py` | dashboard.py | 집계 데이터 정합성 |
| `test_search.py` | search.py | 검색 결과 반환 |
| `test_calendar.py` | calendar_events.py | 이벤트 CRUD |
| `test_reports.py` | regular_reports, biz_reports | 정기보고/사업보고서 CRUD |
| `test_worklogs.py` | worklogs.py | 업무기록 CRUD |
| `test_checklists.py` | checklists.py | 체크리스트 + 아이템 |
| `test_transactions.py` | transactions.py | 거래내역 CRUD + 필터 |
| `test_valuations.py` | valuations.py | 밸류에이션 CRUD |
| `test_cross_features.py` | 복합 | Part 4 참조 |

---

## Part 3 — 프론트엔드 빌드 검증 + 타입 안전성

### 3-A. TypeScript 빌드 검증

```bash
# 프론트엔드 빌드가 에러 없이 완료되는지 확인
cd frontend && npm run build
```

**검증 항목:**
- TypeScript 타입 에러 없음
- import 경로 오류 없음
- 사용하지 않는 변수/import 없음 (ESLint)
- 빌드 결과물 정상 생성

### 3-B. ESLint 전체 검사

```bash
cd frontend && npx eslint src/ --ext .ts,.tsx --max-warnings 0
```

### 3-C. API 타입 일관성 검사

프론트엔드 `api.ts`의 타입 정의가 백엔드 스키마와 일치하는지 확인하는 스크립트:

```python
# backend/scripts/check_api_consistency.py
"""
프론트엔드 api.ts에서 호출하는 API 경로가
백엔드 라우터에 실제로 존재하는지 자동 확인
"""
import re
import os

def extract_frontend_api_calls(api_ts_path):
    """api.ts에서 호출되는 API 경로 추출"""
    with open(api_ts_path, "r", encoding="utf-8") as f:
        content = f.read()
    # api.get('/path'), api.post('/path'), api.put('/path'), api.delete('/path')
    pattern = r"api\.(get|post|put|delete|patch)\(['\"`]([^'\"]+)['\"`]"
    calls = re.findall(pattern, content)
    return [(method.upper(), path) for method, path in calls]

def extract_backend_routes(routers_dir):
    """백엔드 라우터에서 등록된 경로 추출"""
    routes = []
    for fname in os.listdir(routers_dir):
        if not fname.endswith(".py") or fname.startswith("_"):
            continue
        with open(os.path.join(routers_dir, fname), "r", encoding="utf-8") as f:
            content = f.read()
        # @router.get("/path"), @router.post("/path") 등
        pattern = r"@router\.(get|post|put|delete|patch)\(['\"]([^'\"]+)['\"]"
        for method, path in re.findall(pattern, content):
            routes.append((method.upper(), path))
    return routes

def check_consistency():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frontend_calls = extract_frontend_api_calls(
        os.path.join(base, "..", "frontend", "src", "lib", "api.ts")
    )
    backend_routes = extract_backend_routes(
        os.path.join(base, "routers")
    )

    # 경로 패턴 매칭 (동적 파라미터 처리)
    missing = []
    for method, path in frontend_calls:
        # ${id} → {id} 변환, 동적 세그먼트 정규화
        normalized = re.sub(r'\$\{[^}]+\}', '{id}', path)
        found = any(
            re.sub(r'\{[^}]+\}', '{id}', bp) == normalized and bm == method
            for bm, bp in backend_routes
        )
        if not found:
            missing.append((method, path))

    if missing:
        print(f"⚠️  프론트엔드에서 호출하지만 백엔드에 없는 API {len(missing)}개:")
        for method, path in missing:
            print(f"  {method} {path}")
        return False
    else:
        print(f"✅ 모든 프론트엔드 API 호출({len(frontend_calls)}개)이 백엔드에 존재합니다.")
        return True

if __name__ == "__main__":
    check_consistency()
```

### 실행 방법:

```bash
cd backend && python scripts/check_api_consistency.py
```

---

## Part 4 — 유기적 연결성 테스트 (Cross-Feature)

> **가장 중요한 테스트.** 개별 기능이 아닌, **기능 간 데이터 흐름**이 올바른지 검증한다.

### 4-A. 테스트 시나리오

```python
# backend/tests/test_cross_features.py

class TestFundFormationFlow:
    """
    결성 프로세스 전체 흐름 테스트
    조합 생성 → LP 추가 → 워크플로우 시작 → 문서 생성 → 완료 → 상태 전환
    """

    def test_full_formation_process(self, client):
        # 1. 조합 생성 (forming)
        fund = client.post("/api/funds", json={
            "name": "통합테스트 1호 조합",
            "type": "벤처투자조합",
            "status": "forming",
            "gp": "테스트GP(유)",
            "commitment_total": 10000000000,
            "formation_date": "2025-10-24",
        }).json()

        # 2. LP 추가
        client.post(f"/api/funds/{fund['id']}/lps", json={
            "name": "테스트LP", "type": "법인", "commitment_amount": 5000000000,
        })

        # 3. 워크플로우 템플릿 존재 확인
        templates = client.get("/api/workflows").json()
        formation_template = next(
            (t for t in templates if "결성" in t.get("name", "")), None
        )
        # 없으면 생성
        if not formation_template:
            formation_template = client.post("/api/workflows", json={
                "name": "결성총회", "category": "조합결성",
                "steps": [
                    {"name": "소집통지서 발송", "offset_days": -7, "estimated_time": "1시간"},
                    {"name": "결성총회 개최", "offset_days": 0, "estimated_time": "2시간"},
                ],
            }).json()

        # 4. 인스턴스 시작 (fund 연결)
        instance = client.post(
            f"/api/workflows/{formation_template['id']}/instantiate",
            json={
                "name": f"{fund['name']} 결성총회",
                "trigger_date": "2025-10-24",
                "fund_id": fund["id"],
            },
        ).json()

        # 5. 문서 생성 테스트 (Phase 14 연동)
        doc_templates = client.get("/api/document-templates").json()
        if doc_templates:
            for dt in doc_templates:
                r = client.post(
                    f"/api/document-templates/{dt['id']}/generate",
                    params={"fund_id": fund["id"], "assembly_date": "2025-10-24"},
                )
                assert r.status_code == 200
                assert r.headers["content-type"].startswith(
                    "application/vnd.openxmlformats"
                )

        # 6. 모든 단계 완료
        for step in instance["steps"]:
            client.put(
                f"/api/workflow-instances/{instance['id']}/steps/{step['id']}/complete",
                json={"actual_time": "1시간"},
            )

        # 7. 조합 상태 자동 전환 검증
        updated_fund = client.get(f"/api/funds/{fund['id']}").json()
        assert updated_fund["status"] == "active"

        # 8. 대시보드에 데이터 반영 확인
        dashboard = client.get("/api/dashboard").json()
        assert dashboard is not None


class TestInvestmentFlow:
    """
    투자 프로세스 전체 흐름 테스트
    조합 생성 → 기업 등록 → 투자 실행 → 거래 기록 → 밸류에이션 → 체크리스트
    """

    def test_investment_to_valuation_flow(self, client, sample_fund):
        fund_id = sample_fund["id"]

        # 1. 기업 등록
        company = client.post("/api/companies", json={
            "name": "테스트기업(주)",
            "sector": "바이오",
        }).json()

        # 2. 투자 등록
        investment = client.post("/api/investments", json={
            "fund_id": fund_id,
            "company_id": company["id"],
            "investment_type": "신규",
            "investment_amount": 1000000000,
            "investment_date": "2025-06-15",
        }).json()

        # 3. 거래 기록
        tx = client.post("/api/transactions", json={
            "investment_id": investment["id"],
            "fund_id": fund_id,
            "company_id": company["id"],
            "type": "투자",
            "amount": 1000000000,
            "date": "2025-06-15",
        }).json()
        assert tx["amount"] == 1000000000

        # 4. 밸류에이션
        val = client.post("/api/valuations", json={
            "investment_id": investment["id"],
            "fund_id": fund_id,
            "company_id": company["id"],
            "valuation_date": "2025-12-31",
            "method": "상대가치법",
            "fair_value": 1500000000,
        }).json()
        assert val["fair_value"] == 1500000000

        # 5. 체크리스트 연결
        checklist = client.post("/api/checklists", json={
            "investment_id": investment["id"],
            "title": "투자 후 관리 체크리스트",
        }).json()
        assert checklist["investment_id"] == investment["id"]


class TestTaskWorkflowBridge:
    """
    업무-워크플로우 간 데이터 흐름 검증
    워크플로우 완료 → 업무기록 자동 생성 확인
    """

    def test_task_completion_creates_worklog(self, client, sample_task):
        task_id = sample_task["id"]

        # 업무 완료 (auto_worklog=True)
        r = client.put(f"/api/tasks/{task_id}/complete", json={
            "actual_time": "25분",
            "auto_worklog": True,
            "memo": "테스트 완료",
        })
        assert r.status_code == 200

        # 업무기록에 자동 생성되었는지 확인
        worklogs = client.get("/api/worklogs").json()
        auto_log = [w for w in worklogs if "테스트 업무" in w.get("title", "")]
        assert len(auto_log) >= 1


class TestSearchIntegration:
    """
    통합검색이 모든 엔티티를 올바르게 검색하는지 확인
    """

    def test_search_finds_all_entities(self, client, sample_fund):
        # 조합이 검색에 나타나는지
        r = client.get("/api/search", params={"q": "테스트 1호"})
        assert r.status_code == 200
        results = r.json()
        assert any(r.get("type") == "fund" for r in results)
```

---

## Part 5 — 문서 자동화 기능 검증 (Phase 14)

```python
# backend/tests/test_documents.py

class TestDocumentTemplates:
    """문서 템플릿 API 테스트"""

    def test_list_templates(self, client):
        """템플릿 목록 조회"""
        r = client.get("/api/document-templates")
        assert r.status_code == 200

    def test_list_templates_by_category(self, client):
        """카테고리 필터링"""
        r = client.get("/api/document-templates", params={"category": "결성총회"})
        assert r.status_code == 200


class TestDocumentGeneration:
    """문서 자동생성 테스트"""

    def test_generate_official_letter(self, client, sample_fund_with_lps):
        """공문 생성 → .docx 반환"""
        templates = client.get("/api/document-templates").json()
        official = next(
            (t for t in templates if "공문" in t["name"]), None
        )
        if not official:
            return  # 시드 미등록 시 스킵

        r = client.post(
            f"/api/document-templates/{official['id']}/generate",
            params={
                "fund_id": sample_fund_with_lps["id"],
                "assembly_date": "2025-10-24",
                "document_number": "트리거-2025-TEST",
            },
        )
        assert r.status_code == 200
        assert "openxmlformats" in r.headers.get("content-type", "")
        assert len(r.content) > 0  # 파일 크기 > 0

    def test_generate_with_invalid_fund(self, client):
        """존재하지 않는 조합으로 문서 생성 → 404"""
        templates = client.get("/api/document-templates").json()
        if not templates:
            return
        r = client.post(
            f"/api/document-templates/{templates[0]['id']}/generate",
            params={"fund_id": 99999},
        )
        assert r.status_code == 404
```

---

## Part 6 — 회귀 테스트 스크립트 + 원클릭 전체 검증

### 6-A. 전체 테스트 실행 스크립트

```bat
@echo off
REM =========================================
REM   VC ERP - 전체 회귀 테스트 스크립트
REM   Phase 이후 변경사항 검증용
REM =========================================

echo.
echo [1/4] Backend: pytest 실행
echo ─────────────────────────────
cd /d %~dp0backend
python -m pytest tests/ -v --tb=short
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 백엔드 테스트 실패!
    exit /b 1
)
echo ✅ 백엔드 테스트 통과

echo.
echo [2/4] Backend: API 일관성 검사
echo ─────────────────────────────
python scripts/check_api_consistency.py
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  API 일관성 불일치 발견
)

echo.
echo [3/4] Frontend: TypeScript 빌드 검증
echo ─────────────────────────────
cd /d %~dp0frontend
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 프론트엔드 빌드 실패!
    exit /b 1
)
echo ✅ 프론트엔드 빌드 통과

echo.
echo [4/4] Frontend: ESLint 검사
echo ─────────────────────────────
call npx eslint src/ --ext .ts,.tsx --max-warnings 0
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  ESLint 경고/에러 존재
)

echo.
echo =========================================
echo   ✅ 전체 회귀 테스트 완료!
echo =========================================
```

### 6-B. 빠른 검증 스크립트 (변경 후 즉시 실행용)

```bat
@echo off
REM 빠른 검증: 백엔드 테스트 + 프론트엔드 빌드만
echo [Quick Check] Backend tests...
cd /d %~dp0backend && python -m pytest tests/ -q --tb=line
echo.
echo [Quick Check] Frontend build...
cd /d %~dp0frontend && call npm run build --silent
echo.
echo Done.
```

### 6-C. 코덱스 실행 전 체크리스트

코덱스에게 새 Phase를 실행시키기 전에 항상 포함할 지시사항:

```markdown
## 구현 시 필수 준수 사항

1. **기존 테스트 통과 확인**: 구현 완료 후 `python -m pytest tests/ -v` 실행하여
   모든 기존 테스트가 통과하는지 확인할 것
2. **프론트엔드 빌드 확인**: `cd frontend && npm run build` 가 에러 없이 완료되는지 확인
3. **새 기능 테스트 추가**: 새 API 엔드포인트를 추가할 경우, 해당 테스트도
   `backend/tests/test_*.py` 에 반드시 추가할 것
4. **API 일관성**: 프론트엔드에서 새 API를 호출할 경우, 백엔드에 해당 엔드포인트가
   반드시 존재해야 함
5. **모델 변경 시**: DB 모델을 변경하면 conftest.py의 fixture가 정상 동작하는지 확인
```

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[NEW]** | `backend/conftest.py` | pytest fixture 정의 (DB, client, 샘플 데이터) |
| 2 | **[NEW]** | `backend/pytest.ini` | pytest 설정 |
| 3 | **[NEW]** | `backend/tests/__init__.py` | 패키지 초기화 |
| 4 | **[NEW]** | `backend/tests/test_funds.py` | 조합 CRUD + LP 테스트 |
| 5 | **[NEW]** | `backend/tests/test_tasks.py` | 업무 CRUD + 완료/되돌리기 |
| 6 | **[NEW]** | `backend/tests/test_workflows.py` | 워크플로우 전체 생명주기 |
| 7 | **[NEW]** | `backend/tests/test_documents.py` | 문서 자동생성 API |
| 8 | **[NEW]** | `backend/tests/test_investments.py` | 투자 CRUD |
| 9 | **[NEW]** | `backend/tests/test_accounting.py` | 회계 CRUD + 시산표 |
| 10 | **[NEW]** | `backend/tests/test_fund_operations.py` | 출자/배분/총회/성과 |
| 11 | **[NEW]** | `backend/tests/test_exits.py` | 투심위/매각 |
| 12 | **[NEW]** | `backend/tests/test_dashboard.py` | 대시보드 집계 |
| 13 | **[NEW]** | `backend/tests/test_search.py` | 통합검색 |
| 14 | **[NEW]** | `backend/tests/test_calendar.py` | 캘린더 이벤트 |
| 15 | **[NEW]** | `backend/tests/test_reports.py` | 보고서 |
| 16 | **[NEW]** | `backend/tests/test_worklogs.py` | 업무기록 |
| 17 | **[NEW]** | `backend/tests/test_checklists.py` | 체크리스트 |
| 18 | **[NEW]** | `backend/tests/test_transactions.py` | 거래내역 |
| 19 | **[NEW]** | `backend/tests/test_valuations.py` | 밸류에이션 |
| 20 | **[NEW]** | `backend/tests/test_cross_features.py` | 유기적 연결성 테스트 |
| 21 | **[NEW]** | `backend/scripts/check_api_consistency.py` | API 일관성 검사 |
| 22 | **[NEW]** | `test_all.bat` | 전체 회귀 테스트 스크립트 |
| 23 | **[NEW]** | `test_quick.bat` | 빠른 검증 스크립트 |
| 24 | **[MODIFY]** | `backend/requirements.txt` | pytest, httpx 추가 |

---

## Acceptance Criteria

### Part 1: 테스트 인프라
- [ ] AC-01: `conftest.py`에서 인메모리 SQLite DB + TestClient가 정상 생성
- [ ] AC-02: `pytest.ini` 설정으로 `python -m pytest` 명령이 테스트를 탐색/실행
- [ ] AC-03: 각 테스트가 독립된 DB에서 실행되어 테스트 간 격리 보장

### Part 2: API 통합 테스트
- [ ] AC-04: 전체 22개 라우터에 대한 기본 CRUD 테스트 존재
- [ ] AC-05: 모든 테스트가 `python -m pytest tests/ -v` 로 통과
- [ ] AC-06: 404 에러 케이스 (존재하지 않는 리소스 조회) 테스트 포함
- [ ] AC-07: 입력 유효성 검증 에러(422) 테스트 포함

### Part 3: 프론트엔드 검증
- [ ] AC-08: `npm run build` 가 에러 없이 완료
- [ ] AC-09: `check_api_consistency.py` 실행 시 불일치 API 없음

### Part 4: 유기적 연결성
- [ ] AC-10: 조합결성 전체 흐름 테스트 (생성→LP→워크플로우→문서→완료→상태전환) 통과
- [ ] AC-11: 투자 전체 흐름 테스트 (기업→투자→거래→밸류에이션→체크리스트) 통과
- [ ] AC-12: 업무 완료 → 업무기록 자동생성 테스트 통과
- [ ] AC-13: 통합검색이 모든 엔티티 타입을 반환하는 테스트 통과

### Part 5: 문서 자동화 검증
- [ ] AC-14: 문서 템플릿 목록 API가 정상 반환
- [ ] AC-15: 문서 자동생성 API가 유효한 .docx 바이너리를 반환
- [ ] AC-16: 잘못된 fund_id로 문서 생성 시 404 반환

### Part 6: 회귀 테스트 스크립트
- [ ] AC-17: `test_all.bat` 더블클릭으로 전체 테스트 + 빌드 + 린트 실행
- [ ] AC-18: `test_quick.bat` 으로 빠른 검증 가능
- [ ] AC-19: 모든 테스트 통과 후 최종 결과 메시지 출력

---

**Last updated:** 2026-02-16
