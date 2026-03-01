# Phase 47~55 단계별 실행 프롬프트

> **사용법:** 각 Phase를 순서대로 복사하여 Codex에 붙여넣기.  
> 이전 Phase 완료 후 다음 Phase 진행.

---

## Phase 47: 서류 자동화 기반 구축

```
docs/05_Development/Prompts/Phase_31_to_latest/CODEX_PHASE47_PROMPT.md 를 읽고 그대로 구현하세요.

핵심:
1. python-docx 기반 서식보존 DOCX 치환 엔진 (backend/services/docx_replacement_engine.py)
2. GP 기업 프로필 모델 + CRUD API (backend/models/gp_profile.py, backend/routers/gp_profiles.py)
3. 통합 변수 리졸버 — Fund/LP/GP/Investment에서 {{마커}} 값 조회 (backend/services/variable_resolver.py)
4. 문서번호 자동 채번 (backend/models/document_number_seq.py, backend/services/document_numbering.py)
5. LP별 일괄 서류 생성 서비스 + API (backend/services/bulk_document_generator.py, backend/routers/document_generation.py)
6. 프론트엔드 서류 생성 위저드 (frontend/src/pages/TemplateManagementPage.tsx 수정)

기존 DocumentTemplate, GeneratedDocument 모델 삭제/변경 금지. 확장만.
반드시 docs/CODEX_RULES.md 먼저 읽고 규칙 준수.
```

---

## Phase 48: 코드리스 템플릿 등록 시스템

```
docs/05_Development/Prompts/Phase_31_to_latest/CODEX_PHASE48_PROMPT.md 를 읽고 그대로 구현하세요.

핵심:
1. TemplateVariable 모델 (backend/models/template_variable.py) + DocumentTemplate에 relationship 추가
2. DOCX/HWP 텍스트 추출기 (backend/services/text_extractor.py)
3. GPT-4o 기반 LLM 마커 자동 식별 (backend/services/llm_marker_identifier.py)
4. 템플릿 분석+등록 API (backend/routers/template_registration.py)
5. 프론트엔드 4단계 등록 위저드 (frontend/src/components/templates/RegistrationWizard.tsx)
6. 최근 입력값 캐싱 (backend/services/input_cache.py)

Phase 47에서 만든 치환 엔진, VariableResolver 활용.
반드시 docs/CODEX_RULES.md 먼저 읽고 규칙 준수.
```

---

## Phase 49: 준법감시 규칙 엔진 (L1~L5)

```
docs/05_Development/Prompts/Phase_31_to_latest/CODEX_PHASE49_PROMPT.md 를 읽고 그대로 구현하세요.

핵심:
1. 3개 모델: ComplianceDocument, FundComplianceRule, ComplianceCheck (backend/models/compliance.py)
2. L1~L5 규칙 평가 엔진 (backend/services/compliance_rule_engine.py)
   - L1 존재체크, L2 수치범위, L3 기한, L4 교차검증, L5 복합조건
3. ERP 이벤트 트리거 — investments.py, funds.py에 자동 체크 삽입
4. 위반 시 시정 Task 자동 생성 (auto_task=true인 규칙)
5. 기본 규칙 시드 (backend/seeds/compliance_rules.py)
6. UI: CompliancePage에 규칙관리+점검기록 탭

반드시 docs/CODEX_RULES.md 먼저 읽고 규칙 준수.
```

---

## Phase 50: 문서 수집 + 벡터DB (ChromaDB)

```
docs/05_Development/Prompts/Phase_31_to_latest/CODEX_PHASE50_PROMPT.md 를 읽고 그대로 구현하세요.

핵심:
1. ChromaDB PersistentClient + 5계층 컬렉션 (laws, regulations, guidelines, agreements, internal)
   (backend/services/vector_db.py)
2. 문서 수집 파이프라인 — PDF/DOCX → 텍스트 추출 → 법률 특화 청킹(조/항/호) → 벡터 저장
   (backend/services/document_ingestion.py)
3. API: 문서 업로드+인덱싱, 자연어 검색, 인덱싱 현황 (backend/routers/legal_documents.py)
4. UI: DocumentLibrary 컴포넌트 (frontend/src/components/compliance/DocumentLibrary.tsx)
5. requirements.txt에 chromadb, pdfplumber 추가

반드시 docs/CODEX_RULES.md 먼저 읽고 규칙 준수.
```

---

## Phase 51: RAG + LLM 법률 해석 엔진

```
docs/05_Development/Prompts/Phase_31_to_latest/CODEX_PHASE51_PROMPT.md 를 읽고 그대로 구현하세요.

핵심:
1. LLMUsage 토큰 사용량 추적 모델 (backend/models/llm_usage.py)
2. 2단 법률 해석 서비스 (backend/services/legal_rag.py)
   - L1: 규칙 엔진(Phase 49) 우선 평가 → 매칭되면 LLM 없이 응답
   - L2: ChromaDB 벡터 검색 → GPT-4o 해석 → 근거 조항 포함 응답
3. 월간 토큰 한도 관리 (LLM_MONTHLY_LIMIT 환경변수)
4. API: POST /api/compliance/interpret, GET /api/compliance/llm-usage
5. UI: CompliancePage에 법률 질의 패널 + 토큰 현황

Phase 49(규칙엔진) + Phase 50(벡터DB) 활용.
반드시 docs/CODEX_RULES.md 먼저 읽고 규칙 준수.
```

---

## Phase 52: 사전 보고 검증 (4유형 교차검증)

```
docs/05_Development/Prompts/Phase_31_to_latest/CODEX_PHASE52_PROMPT.md 를 읽고 그대로 구현하세요.

핵심:
1. PreReportCheck 모델 (backend/models/pre_report_check.py)
2. 4유형 검증 서비스 (backend/services/pre_report_checker.py)
   - Type 1: 법적 오류 (투자한도 등)
   - Type 2: 교차 검증 (LP합계 정합성 등)
   - Type 3: 가이드라인 (미승인 보고서 등)
   - Type 4: 계약 일치성 (존속기한 등)
3. error 건 → 시정 Task 자동 생성
4. API: POST /api/reports/{id}/pre-check, GET /api/reports/{id}/pre-checks
5. UI: ReportsPage 보고서 상세에 사전 검증 영역

반드시 docs/CODEX_RULES.md 먼저 읽고 규칙 준수.
```

---

## Phase 53: 정기 스캔 + 법률 개정 감지

```
docs/05_Development/Prompts/Phase_31_to_latest/CODEX_PHASE53_PROMPT.md 를 읽고 그대로 구현하세요.

핵심:
1. APScheduler 설정 (backend/services/scheduler.py)
   - 일간 09:00 스캔(L1~L3), 주간 월요일 법률 개정 체크, 월간 전체 감사
2. 정기 스캐너 (backend/services/periodic_compliance_scanner.py) — 전체 조합 규칙 일괄 점검
3. 법률 개정 모니터 (backend/services/law_amendment_monitor.py) — 국가법령정보센터 API 연동
4. main.py에 startup/shutdown 이벤트로 스케줄러 관리
5. API: 스캔이력, 개정알림, 수동스캔
6. UI: CompliancePage에 스케줄+개정 탭
7. requirements.txt에 apscheduler, httpx 추가

반드시 docs/CODEX_RULES.md 먼저 읽고 규칙 준수.
```

---

## Phase 54: 히스토리 학습 + 업무 효율

```
docs/05_Development/Prompts/Phase_31_to_latest/CODEX_PHASE54_PROMPT.md 를 읽고 그대로 구현하세요.

핵심:
1. 이력 분석 서비스 (backend/services/compliance_history_analyzer.py)
   - 반복 위반 패턴 분석 (6개월 이력, 2회+ 반복 감지)
   - 규칙 조정 제안 (빈도 축소 / severity 격상)
   - 시정 Task 추적 통계 (완료율, 평균 소요일, 기한초과)
   - 월간 준법감시 리포트 자동 생성
2. API: patterns, suggestions, remediation, monthly report
3. UI: ViolationPatterns, RuleSuggestions, RemediationTracker, MonthlyReport 컴포넌트

Phase 49(규칙엔진) + Phase 53(정기스캔) 이력 데이터 활용.
반드시 docs/CODEX_RULES.md 먼저 읽고 규칙 준수.
```

---

## Phase 55: 통합 준법감시 대시보드

```
docs/05_Development/Prompts/Phase_31_to_latest/CODEX_PHASE55_PROMPT.md 를 읽고 그대로 구현하세요.

핵심:
1. 통합 대시보드 API — GET /api/compliance/dashboard
   summary, fund_status, recent_checks, amendment_alerts, document_stats, llm_usage 통합 반환
2. 조합별 현황 위젯 (FundComplianceGrid.tsx) — 준수율, 위반건수, 마지막점검
3. 감사 로그 타임라인 (AuditTimeline.tsx) — 스케줄/이벤트 점검 기록
4. 법률 개정 알림 패널 (AmendmentAlerts.tsx) — D-day 표시
5. CompliancePage에 대시보드 탭 최상단 배치

Phase 49~54 전체 데이터를 통합 표시.
반드시 docs/CODEX_RULES.md 먼저 읽고 규칙 준수.
```
