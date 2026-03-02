#!/bin/bash
# run_overhaul.sh — Phase 58~70 자동 실행

PROJECT="C:/Users/1llal/Desktop/ERP-Project"
PROMPTS="$PROJECT/docs/05_Development/Prompts/Phase_58_Overhaul"
LOG="$PROJECT/overhaul_log.txt"

echo "=== Overhaul 시작: $(date) ===" | tee "$LOG"

COMMON_RULES='
규칙:
1. 각 Phase의 CODEX_PHASE{N}_PROMPT.md를 읽고 명세대로 구현
2. git commit, git push 절대 하지 말 것 — 코드 변경만 수행
3. 기존 기능을 깨뜨리지 말 것 — import 경로, API 응답 구조 유지
4. 새 파일은 기존 패턴을 따를 것
5. pip/npm 패키지 필요시 requirements.txt / package.json에 추가 후 설치
6. 프론트엔드는 기존 index.css 디자인 토큰 사용
'

# --- 세션 1: Phase 58~61 (코드 안정화) ---
echo ">>> 세션 1: Phase 58~61 시작 $(date)" | tee -a "$LOG"
claude -p --max-turns 50 "
$PROJECT 에서 작업합니다.
$PROMPTS/EXECUTION_GUIDE_58_70.md 를 먼저 읽으세요.

Phase 58 → 59 → 60 → 61 순서대로 구현하세요.
각 Phase: CODEX_PHASE{N}_PROMPT.md 를 읽고 구현.
$COMMON_RULES
Phase 61 완료 후 변경된 파일 목록을 출력하고 끝내세요.
" 2>&1 | tee -a "$LOG"

echo ">>> 세션 1 완료: $(date)" | tee -a "$LOG"

# --- 세션 2: Phase 62~64 (UX 전반) ---
echo ">>> 세션 2: Phase 62~64 시작 $(date)" | tee -a "$LOG"
claude -p --max-turns 50 "
$PROJECT 에서 작업합니다.
$PROMPTS/EXECUTION_GUIDE_58_70.md 를 먼저 읽으세요.
Phase 58~61은 이미 완료되었습니다. git diff --stat으로 확인하세요.

Phase 62 → 63 → 64 순서대로 구현하세요.
각 Phase: CODEX_PHASE{N}_PROMPT.md 를 읽고 구현.
$COMMON_RULES
Phase 64 완료 후 변경된 파일 목록을 출력하고 끝내세요.
" 2>&1 | tee -a "$LOG"

echo ">>> 세션 2 완료: $(date)" | tee -a "$LOG"

# --- 세션 3: Phase 65~66 (UX 후반) ---
echo ">>> 세션 3: Phase 65~66 시작 $(date)" | tee -a "$LOG"
claude -p --max-turns 50 "
$PROJECT 에서 작업합니다.
$PROMPTS/EXECUTION_GUIDE_58_70.md 를 먼저 읽으세요.
Phase 58~64는 이미 완료되었습니다. git diff --stat으로 확인하세요.

Phase 65 → 66 순서대로 구현하세요.
각 Phase: CODEX_PHASE{N}_PROMPT.md 를 읽고 구현.
$COMMON_RULES
Phase 66 완료 후 변경된 파일 목록을 출력하고 끝내세요.
" 2>&1 | tee -a "$LOG"

echo ">>> 세션 3 완료: $(date)" | tee -a "$LOG"

# --- 세션 4: Phase 67~68 (데이터 연계) ---
echo ">>> 세션 4: Phase 67~68 시작 $(date)" | tee -a "$LOG"
claude -p --max-turns 50 "
$PROJECT 에서 작업합니다.
$PROMPTS/EXECUTION_GUIDE_58_70.md 를 먼저 읽으세요.
Phase 58~66은 이미 완료되었습니다. git diff --stat으로 확인하세요.

Phase 67 → 68 순서대로 구현하세요.
각 Phase: CODEX_PHASE{N}_PROMPT.md 를 읽고 구현.
$COMMON_RULES
Phase 68 완료 후 변경된 파일 목록을 출력하고 끝내세요.
" 2>&1 | tee -a "$LOG"

echo ">>> 세션 4 완료: $(date)" | tee -a "$LOG"

# --- 세션 5: Phase 69~70 (보고서 + 알림) ---
echo ">>> 세션 5: Phase 69~70 시작 $(date)" | tee -a "$LOG"
claude -p --max-turns 50 "
$PROJECT 에서 작업합니다.
$PROMPTS/EXECUTION_GUIDE_58_70.md 를 먼저 읽으세요.
Phase 58~68은 이미 완료되었습니다. git diff --stat으로 확인하세요.

Phase 69 → 70 순서대로 구현하세요.
각 Phase: CODEX_PHASE{N}_PROMPT.md 를 읽고 구현.
$COMMON_RULES
Phase 70 완료 후 전체 변경된 파일 목록을 출력하고 끝내세요.
" 2>&1 | tee -a "$LOG"

echo ">>> 세션 5 완료: $(date)" | tee -a "$LOG"
echo "=== 전체 완료: $(date) ===" | tee -a "$LOG"
