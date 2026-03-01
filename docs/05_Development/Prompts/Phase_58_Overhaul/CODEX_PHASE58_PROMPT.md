# Phase 58: Backend 안정화

> **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.
> **근거:** `docs/ERP_ANALYSIS_AND_STRATEGY.md` §2.2, §5.1

**Priority:** P0 — 이후 모든 Phase의 기반
**의존성:** 없음 (첫 번째 Phase)
**핵심 원칙:**
1. **기존 기능 무결성** — 모든 API 엔드포인트 정상 동작 유지
2. **점진적 정리** — 한 번에 다 바꾸지 않고, 파일 단위로 이관
3. **테스트 가능성** — 각 단계마다 서버 기동 확인

---

## Part 0. 전수조사 (필수)

- [ ] `backend/main.py` — startup 시 SQLite 호환 코드 전체 파악 (900줄+)
- [ ] `backend/database.py` — DB 연결 설정 확인
- [ ] `backend/services/workflow_service.py` — `_is_non_business_day()` 함수 위치/로직
- [ ] `backend/services/compliance_engine.py` — 영업일 계산 중복 코드 확인
- [ ] `backend/models/audit_log.py` — AuditLog 모델 필드 확인
- [ ] `backend/routers/` — 각 라우터에서 AuditLog 사용 여부 확인
- [ ] 환경변수 사용처 전체 검색 (`os.getenv`, `os.environ`)

---

## Part 1. main.py 호환 코드 → Alembic 마이그레이션 이관

### 1-1. 현재 main.py startup 코드 분석

main.py의 lifespan 함수 내 SQLite 호환 코드를 **기능별로 분류**:

```
[A] 테이블 자동 생성 (Base.metadata.create_all)
[B] 컬럼 추가 (ALTER TABLE ADD COLUMN 시뮬레이션)
[C] 테이블 재구축 (DROP → CREATE → INSERT)
[D] 기본값 채우기 (UPDATE SET WHERE IS NULL)
[E] 인덱스/유니크 제약 추가
```

### 1-2. 정리 전략

```
[유지] A — Base.metadata.create_all (신규 테이블 자동 생성)
[이관] B, C → 새로운 Alembic 마이그레이션 파일로 이관
[이관] D → seed 스크립트 또는 Alembic data migration으로 이관
[이관] E → Alembic 마이그레이션으로 이관
```

### 1-3. 실행

#### [MODIFY] `backend/main.py`

1. lifespan 함수에서 **A (create_all) 만 남기고** 나머지 호환 코드를 전부 제거
2. 제거 전에 각 코드 블록을 주석으로 "# Migrated to alembic version XXXX" 표시
3. 최종적으로 lifespan 함수가 50줄 이내가 되도록 정리

#### [NEW] `backend/alembic/versions/xxxx_consolidate_schema_patches.py`

main.py에서 제거한 모든 스키마 패치를 **단일 마이그레이션 파일**로 통합:

```python
"""Consolidate all SQLite compatibility patches from main.py startup"""

def upgrade():
    # 이미 적용된 스키마이므로 실제 ALTER는 조건부 실행
    # inspector.has_column() 체크 후 없으면 추가
    pass

def downgrade():
    pass
```

**주의:** 기존 DB에는 이미 모든 패치가 적용되어 있으므로, 마이그레이션은 **멱등성(idempotent)** 보장

---

## Part 2. 영업일 계산 유틸리티 통합

### 2-1. 중복 코드 현황 파악

다음 파일에서 영업일/공휴일 관련 함수를 모두 찾기:
- `backend/services/workflow_service.py`
- `backend/services/compliance_engine.py`
- `backend/services/compliance_rule_engine.py`
- 기타 `_is_non_business_day`, `shift_to_business_day`, `HOLIDAYS` 등

### 2-2. 공통 유틸리티 생성

#### [NEW] `backend/utils/business_days.py`

```python
"""영업일 계산 통합 유틸리티.

한국 공휴일 + ERP_EXTRA_HOLIDAYS 환경변수 기반.
모든 서비스에서 이 모듈만 import하여 사용.
"""

from datetime import date, timedelta
from typing import Set
import os

# 한국 법정 공휴일 (매년 업데이트 필요)
KOREAN_HOLIDAYS_2025: Set[date] = { ... }
KOREAN_HOLIDAYS_2026: Set[date] = { ... }

def get_holidays(year: int) -> Set[date]:
    """해당 연도 공휴일 목록 반환. ERP_EXTRA_HOLIDAYS 포함."""
    ...

def is_business_day(d: date) -> bool:
    """영업일 여부 (주말 + 공휴일 제외)."""
    ...

def shift_to_business_day(d: date, direction: int = 1) -> date:
    """비영업일이면 다음(direction=1) 또는 이전(direction=-1) 영업일로 이동.
    최대 30일 이동 제한 (무한루프 방지).
    """
    ...

def add_business_days(start: date, days: int) -> date:
    """start로부터 N 영업일 후의 날짜."""
    ...

def business_days_between(start: date, end: date) -> int:
    """두 날짜 사이 영업일 수."""
    ...
```

### 2-3. 기존 서비스 리팩토링

#### [MODIFY] `backend/services/workflow_service.py`
- 자체 `_is_non_business_day()`, `shift_to_business_day()` 제거
- `from utils.business_days import is_business_day, shift_to_business_day, add_business_days` 로 교체

#### [MODIFY] `backend/services/compliance_engine.py`
- 동일하게 자체 영업일 함수 제거 → `utils.business_days` import

#### [MODIFY] 기타 영업일 사용 파일
- 같은 패턴으로 교체

---

## Part 3. 감사 로그 (Audit Trail) 미들웨어

### 3-1. 감사 로그 미들웨어 생성

#### [NEW] `backend/middleware/audit_log.py`

```python
"""CRUD 작업 자동 감사 로그 미들웨어.

모든 POST/PUT/PATCH/DELETE 요청에 대해 AuditLog 레코드 자동 생성.
GET 요청은 기록하지 않음.
"""

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            # 성공 응답 (2xx)만 기록
            if 200 <= response.status_code < 300:
                await self._log_action(request, response)

        return response

    async def _log_action(self, request: Request, response: Response):
        """
        기록 항목:
        - user_id: JWT에서 추출 (없으면 null)
        - action: HTTP method (POST=create, PUT/PATCH=update, DELETE=delete)
        - target_type: URL 경로에서 추출 (예: /api/funds → 'fund')
        - target_id: URL의 마지막 숫자 (예: /api/funds/3 → 3)
        - detail: 요청 바디 요약 (최대 500자)
        - ip_address: request.client.host
        - user_agent: request.headers.get("user-agent")
        """
        ...
```

### 3-2. 미들웨어 등록

#### [MODIFY] `backend/main.py`

```python
from middleware.audit_log import AuditLogMiddleware

app.add_middleware(AuditLogMiddleware)
```

---

## Part 4. 환경변수 정리

### 4-1. .env.example 생성

#### [NEW] `backend/.env.example`

```env
# === Database ===
DATABASE_URL=sqlite:///./erp.db

# === CORS ===
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# === Authentication ===
# VON_AUTH_DISABLED=false   # true로 설정 시 인증 비활성화 (개발 전용)
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# === Google OAuth ===
# GOOGLE_CLIENT_ID=your-google-client-id

# === LLM (OpenAI) ===
# OPENAI_API_KEY=your-openai-api-key
# LLM_MONTHLY_LIMIT=500000

# === Business Days ===
# ERP_EXTRA_HOLIDAYS=2026-03-01,2026-05-05  # 추가 휴일 (쉼표 구분)

# === Auto-Configuration ===
AUTO_CREATE_TABLES=true
```

### 4-2. 환경변수 중앙 관리

#### [NEW] `backend/config.py`

```python
"""환경변수 중앙 관리 모듈.

모든 서비스/라우터에서 직접 os.getenv() 대신 이 모듈 import.
"""

import os
from pathlib import Path

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{Path(__file__).parent / 'erp.db'}")
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    AUTH_DISABLED: bool = os.getenv("VON_AUTH_DISABLED", "").lower() in ("1", "true", "yes", "y", "on")
    AUTO_CREATE_TABLES: bool = os.getenv("AUTO_CREATE_TABLES", "true").lower() == "true"
    LLM_MONTHLY_LIMIT: int = int(os.getenv("LLM_MONTHLY_LIMIT", "500000"))
    EXTRA_HOLIDAYS: list[str] = [h.strip() for h in os.getenv("ERP_EXTRA_HOLIDAYS", "").split(",") if h.strip()]

settings = Settings()
```

---

## Part 5. 소프트 삭제 기반 Mixin (선택적, 향후 적용 기반)

### 5-1. Mixin 생성

#### [NEW] `backend/models/mixins.py`

```python
"""공통 모델 Mixin.

SoftDeleteMixin: is_deleted, deleted_at 필드 + 쿼리 헬퍼.
향후 주요 모델에 점진적 적용.
"""

from datetime import datetime
from sqlalchemy import Column, Boolean, DateTime


class SoftDeleteMixin:
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = datetime.utcnow()

    def restore(self):
        self.is_deleted = False
        self.deleted_at = None
```

**주의:** 이 Phase에서는 Mixin 생성만. 기존 모델에 적용은 Phase 67에서 점진적으로.

---

## 검증 체크리스트

- [ ] `python -m uvicorn main:app --port 8000` 정상 기동
- [ ] main.py lifespan 함수가 50줄 이내로 축소됨
- [ ] 기존 API 엔드포인트 정상 동작 (대시보드, 태스크 CRUD, 펀드 CRUD)
- [ ] `utils/business_days.py` import 후 workflow_service, compliance_engine 정상 동작
- [ ] AuditLog 미들웨어 등록 후 POST/PUT/DELETE 요청 시 audit_logs 테이블에 기록 확인
- [ ] `.env.example` 파일 존재
- [ ] `config.py` settings 객체 정상 동작
- [ ] git commit: `refactor: Phase 58 backend stabilization`
