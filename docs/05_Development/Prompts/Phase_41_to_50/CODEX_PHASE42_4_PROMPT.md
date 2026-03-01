# Phase 42_4: 로그인 연관 서비스 전체 — 회원가입·프로필·비밀번호 찾기·초대·세션

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0 — Phase 42_3 후속 (인증 시스템 완성)  
**의존성:** Phase 42_3 완료 (JWT 로그인, Google OAuth, RBAC, 감사 로그 구현 완료)  
**핵심 원칙:**
1. **42_3에서 구현된 것:** 로그인(아이디/이메일 + 비밀번호), Google OAuth, 비밀번호 변경, JWT 토큰(Access+Refresh), 역할 기반 메뉴 권한, 감사 로그
2. **42_4에서 추가할 것:** 회원가입 흐름 + 비밀번호 찾기/재설정 + 내 프로필 페이지 + 초대 시스템 + 세션 관리 + 로그인 UX 마무리

---

## Part 0. 전수조사 (필수)

> **기존 42_3 구현 상태를 정확히 파악한 후 작업 시작.**

- [ ] `backend/routers/auth.py` — 현재 엔드포인트: login, google, me, change-password, refresh
- [ ] `backend/dependencies/auth.py` — get_current_user, require_master, hash_password, verify_password, create_access_token, create_refresh_token, validate_password
- [ ] `backend/models/user.py` — username, email, password_hash, role, google_id, avatar_url, allowed_routes, login_fail_count, locked_until, password_changed_at, is_active
- [ ] `backend/models/audit_log.py` — AuditLog 모델 (action, target_type, target_id, detail, ip_address, user_agent)
- [ ] `backend/routers/users.py` — list, create(require_master), update(require_master), deactivate
- [ ] `backend/schemas/user.py` — UserCreate(username, password 포함), UserUpdate, LoginRequest, GoogleLoginRequest, LoginResponse, ChangePasswordRequest
- [ ] `frontend/src/pages/LoginPage.tsx` — 아이디/이메일 로그인 + Google 로그인. 회원가입 링크 없음, 비밀번호 찾기 링크 없음
- [ ] `frontend/src/contexts/AuthContext.tsx` — AuthProvider (login, loginWithGoogle, logout, hasAccess, changePassword)
- [ ] `frontend/src/components/Layout.tsx` — 상단 바 사용자 드롭다운 (비밀번호 변경, 로그아웃)
- [ ] `frontend/src/pages/UsersPage.tsx` — 사용자 관리 (master 전용)
- [ ] `frontend/src/lib/api.ts` — 인증 헤더 자동 주입, 401 핸들링, 토큰 갱신

---

## Part 1. 회원가입 (Registration)

### 1-1. 회원가입 정책

> **ERP 시스템 특성:** 아무나 가입하면 안 됨. 두 가지 방식 지원:
> - **방식 A (기본):** 사용자가 직접 회원가입 신청 → master가 승인 → 계정 활성화
> - **방식 B (초대):** master가 초대 링크 생성 → 초대받은 사람이 가입 완료 (Part 5에서 상세)

### 1-2. 백엔드 API

#### `routers/auth.py` [MODIFY — 엔드포인트 추가]

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| POST | `/api/auth/register` | 불필요 | 회원가입 신청 |
| GET | `/api/auth/check-username?username=xxx` | 불필요 | 아이디 중복 확인 |
| GET | `/api/auth/check-email?email=xxx` | 불필요 | 이메일 중복 확인 |

**POST /api/auth/register:**
```python
# Request:
{
  "username": "park",             # 필수, 영문+숫자, 4~20자
  "name": "박대리",               # 필수
  "email": "park@company.com",    # 선택 (Google 연동용)
  "password": "securePass123!",   # 필수, 8자 이상, 영문+숫자
  "department": "투자팀"           # 선택
}

# 서버 처리:
# 1. username 유효성 검증 (영문소문자+숫자+언더스코어, 4~20자)
# 2. username 중복 확인 → 409 반환
# 3. email 중복 확인 (입력된 경우) → 409 반환
# 4. password 정책 검증 (validate_password)
# 5. User 생성:
#    - role = "viewer" (기본 역할)
#    - is_active = False  ← ⭐ 승인 전까지 비활성
#    - allowed_routes = null
#    - password_hash = hash_password(password)
# 6. AuditLog 기록: action="register"

# Response (201):
{
  "message": "가입 신청이 완료되었습니다. 관리자의 승인 후 로그인할 수 있습니다.",
  "user": {
    "id": 5,
    "username": "park",
    "name": "박대리",
    "is_active": false
  }
}
```

**아이디 유효성 규칙:**
```python
import re

def validate_username(username: str) -> str | None:
    """아이디 유효성 검증. 문제 있으면 에러 메시지, 없으면 None."""
    if not username or len(username) < 4:
        return "아이디는 최소 4자 이상이어야 합니다"
    if len(username) > 20:
        return "아이디는 최대 20자까지 가능합니다"
    if not re.match(r'^[a-z0-9_]+$', username):
        return "아이디는 영문 소문자, 숫자, 밑줄(_)만 사용 가능합니다"
    return None
```

**GET /api/auth/check-username:**
```python
# Query: ?username=park
# Response: { "available": true } 또는 { "available": false, "message": "이미 사용 중인 아이디입니다" }
```

### 1-3. 가입 승인 (master 관리)

#### `routers/users.py` [MODIFY — 엔드포인트 추가]

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| GET | `/api/users/pending` | require_master | 승인 대기 사용자 목록 |
| PATCH | `/api/users/{id}/approve` | require_master | 사용자 승인 (is_active=True) |
| PATCH | `/api/users/{id}/reject` | require_master | 사용자 거절 (삭제 또는 is_active=False 유지) |

```python
# PATCH /api/users/{id}/approve
# - is_active = True 로 변경
# - AuditLog 기록: action="user_approve"
# Response: UserResponse (업데이트된 사용자)

# PATCH /api/users/{id}/reject
# - DB에서 해당 사용자 삭제 (또는 영구 비활성 마킹)
# - AuditLog 기록: action="user_reject"
```

### 1-4. 프론트엔드 — 회원가입 페이지

#### `pages/RegisterPage.tsx` [NEW]

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│              [V:ON 로고]                                  │
│                                                          │
│            V:ON ERP 회원가입                              │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │  👤 아이디 *                                  │       │
│  │  [park_invest      ]  [✓ 사용 가능]           │       │
│  │  영문 소문자, 숫자, _만 가능 (4~20자)          │       │
│  └──────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────┐       │
│  │  📛 이름 *                                    │       │
│  │  [박대리             ]                        │       │
│  └──────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────┐       │
│  │  📧 이메일 (선택)                             │       │
│  │  [park@company.com   ]                        │       │
│  └──────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────┐       │
│  │  🏢 부서 (선택)                               │       │
│  │  [투자팀             ]                        │       │
│  └──────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────┐       │
│  │  🔒 비밀번호 *                                │       │
│  │  [**************    ]                         │       │
│  │  8자 이상, 영문 + 숫자 포함                    │       │
│  └──────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────┐       │
│  │  🔒 비밀번호 확인 *                           │       │
│  │  [**************    ]  [✓ 일치]               │       │
│  └──────────────────────────────────────────────┘       │
│                                                          │
│  [=============== 가입 신청 ================]            │
│                                                          │
│  이미 계정이 있으신가요?  [로그인]                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**기능:**
1. 아이디 입력 시 실시간 중복 확인 (debounce 500ms → `GET /api/auth/check-username`)
2. 비밀번호 강도 표시 (약함/보통/강함 인디케이터)
3. 비밀번호 확인 필드 일치 여부 실시간 표시
4. 가입 완료 후 "관리자 승인 대기" 안내 화면 표시
5. ShaderBackground 배경 활용 (LoginPage와 동일 디자인)

**가입 완료 화면:**
```
┌──────────────────────────────────────────────────┐
│                                                  │
│              ✅ 가입 신청 완료                    │
│                                                  │
│  가입 신청이 정상적으로 접수되었습니다.            │
│  관리자 승인 후 로그인이 가능합니다.              │
│                                                  │
│  승인 대기 중에는 로그인할 수 없으며,             │
│  관리자가 승인하면 바로 사용할 수 있습니다.        │
│                                                  │
│           [로그인 페이지로 이동]                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 1-5. LoginPage.tsx 수정

#### `pages/LoginPage.tsx` [MODIFY]

기존 로그인 폼 하단에 링크 추가:

```tsx
// 기존: "로그인 문제 발생 시 관리자에게 문의하세요"
// 변경:
<div className="mt-4 text-center text-xs text-gray-500 space-y-1">
  <p>
    계정이 없으신가요? <Link to="/register" className="text-blue-600 hover:underline">회원가입</Link>
  </p>
  <p>
    비밀번호를 잊으셨나요? <Link to="/forgot-password" className="text-blue-600 hover:underline">비밀번호 찾기</Link>
  </p>
</div>
```

### 1-6. 가입 승인 대기자 관리 UI

#### `pages/UsersPage.tsx` [MODIFY]

기존 사용자 목록 상단에 탭 또는 배지 추가:

```
┌──────────────────────────────────────────────────────────────┐
│  👥 사용자 관리                                              │
│                                                              │
│  [활성 사용자 (12)]  [승인 대기 (3) 🔴]  [비활성 (2)]        │
├──────────────────────────────────────────────────────────────┤
│  (승인 대기 탭 선택 시)                                       │
│                                                              │
│  이름     │ 아이디   │ 이메일              │ 부서  │ 신청일  │ 액션       │
│───────────┼─────────┼────────────────────┼──────┼────────┼───────────│
│  박대리   │ park    │ park@company.com   │ 투자팀│ 02-25  │ [승인] [거절] │
│  이사원   │ leesa   │ —                  │ 경영지원│ 02-25 │ [승인] [거절] │
│  최인턴   │ choi    │ choi@company.com   │ —    │ 02-24  │ [승인] [거절] │
└──────────────────────────────────────────────────────────────┘
```

**승인 시:**
- [승인] 클릭 → `PATCH /api/users/{id}/approve` → 역할/권한 설정 모달 표시 (role 및 allowed_routes 설정)
- 권한 설정 후 사용자 활성화 완료

**거절 시:**
- [거절] 클릭 → 확인 모달 → `PATCH /api/users/{id}/reject` → 목록에서 제거

---

## Part 2. 비밀번호 찾기 / 재설정

### 2-1. 비밀번호 재설정 방식

> **사내 ERP 특성:** 이메일 발송 인프라가 없을 수 있음. 두 가지 방식 동시 지원:
> - **방식 A (관리자 재설정):** master가 직접 해당 사용자 비밀번호 초기화
> - **방식 B (토큰 기반 셀프):** 임시 재설정 토큰 생성 → 사용자가 직접 재설정

### 2-2. 백엔드 API

#### `routers/auth.py` [MODIFY]

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| POST | `/api/auth/forgot-password` | 불필요 | 재설정 요청 (관리자에게 알림) |
| POST | `/api/auth/reset-password` | 불필요 | 재설정 토큰으로 비밀번호 변경 |

#### `routers/users.py` [MODIFY]

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| POST | `/api/users/{id}/reset-password` | require_master | 관리자가 임시 비밀번호 설정 |
| POST | `/api/users/{id}/generate-reset-token` | require_master | 재설정 토큰 생성 (URL 전달용) |

**관리자 비밀번호 초기화:**
```python
# POST /api/users/{id}/reset-password
# Request: { "new_password": "TempPass123!" }
# - password_hash 업데이트
#   (임시 비밀번호를 관리자가 직접 전달 → 사용자가 로그인 후 변경)
# - AuditLog 기록: action="admin_password_reset"
```

**재설정 토큰 생성:**
```python
# POST /api/users/{id}/generate-reset-token
# - 30분 유효 JWT 생성 (type="password_reset", sub=user_id)
# - Response: { "reset_token": "eyJ...", "reset_url": "/reset-password?token=eyJ...", "expires_in_minutes": 30 }
# - 관리자가 이 URL을 사용자에게 전달 (메신저/채팅 등)
```

**토큰 기반 비밀번호 재설정:**
```python
# POST /api/auth/reset-password
# Request: { "token": "eyJ...", "new_password": "newSecurePass!" }
# - token 검증 (type="password_reset", 만료 확인)
# - password_hash 업데이트 + password_changed_at 갱신
# - login_fail_count=0, locked_until=null 초기화 (잠금 해제)
# - AuditLog 기록: action="password_reset"
```

### 2-3. Password Reset Token 모델 (선택 구현)

> 간단한 구현: JWT 자체를 재설정 토큰으로 사용 (별도 테이블 불필요). JWT payload에 `type: "password_reset"`, `sub: user_id`, `exp: 30분` 저장.

### 2-4. 프론트엔드 — 비밀번호 찾기 페이지

#### `pages/ForgotPasswordPage.tsx` [NEW]

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│              [V:ON 로고]                              │
│                                                      │
│            비밀번호 찾기                              │
│                                                      │
│  ┌────────────────────────────────────────────┐      │
│  │  아이디 또는 이메일                        │      │
│  │  [hong                 ]                   │      │
│  └────────────────────────────────────────────┘      │
│                                                      │
│  [============ 재설정 요청 ==============]            │
│                                                      │
│  "관리자에게 비밀번호 재설정 요청이 전달됩니다."       │
│                                                      │
│  [← 로그인으로 돌아가기]                              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**요청 후 화면:**
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│              📩 요청 완료                             │
│                                                      │
│  비밀번호 재설정 요청이 접수되었습니다.                │
│  관리자가 확인 후 임시 비밀번호 또는                   │
│  재설정 링크를 전달해 드릴 예정입니다.                 │
│                                                      │
│  [로그인 페이지로 이동]                               │
│                                                      │
└──────────────────────────────────────────────────────┘
```

> 실제 이메일 발송은 구현하지 않음. 대신 관리자 대시보드(UsersPage)에 알림 표시.

#### `pages/ResetPasswordPage.tsx` [NEW]

재설정 토큰(URL의 query param)을 사용한 비밀번호 변경 페이지:

```
접속 URL: /reset-password?token=eyJ...

┌──────────────────────────────────────────────────────┐
│                                                      │
│              [V:ON 로고]                              │
│                                                      │
│            비밀번호 재설정                             │
│                                                      │
│  ┌────────────────────────────────────────────┐      │
│  │  🔒 새 비밀번호                            │      │
│  │  [**************    ]                      │      │
│  │  8자 이상, 영문 + 숫자 포함                 │      │
│  └────────────────────────────────────────────┘      │
│  ┌────────────────────────────────────────────┐      │
│  │  🔒 새 비밀번호 확인                       │      │
│  │  [**************    ]  [✓ 일치]            │      │
│  └────────────────────────────────────────────┘      │
│                                                      │
│  [============ 비밀번호 변경 ==============]          │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**변경 완료 후:** "비밀번호가 변경되었습니다." + "로그인 페이지로 이동" 버튼

### 2-5. 관리자 비밀번호 관리 UI

#### `pages/UsersPage.tsx` [MODIFY]

사용자 목록의 각 사용자 행에 컨텍스트 메뉴 또는 버튼 추가:

```
사용자 편집 모달 내:
┌── 비밀번호 관리 ──────────────────────────────────┐
│                                                    │
│  [임시 비밀번호로 초기화]                           │
│  → 모달: 임시 비밀번호 입력 → 저장                  │
│                                                    │
│  [재설정 링크 생성]                                 │
│  → 30분 유효 링크 생성 → 복사 버튼                  │
│  → 관리자가 해당 사용자에게 전달                     │
│                                                    │
│  [계정 잠금 해제]    (잠금 상태일 때만 표시)         │
│  → login_fail_count=0, locked_until=null            │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Part 3. 내 프로필 페이지 (My Profile)

### 3-1. 프로필 API

#### `routers/auth.py` [MODIFY]

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| PUT | `/api/auth/profile` | get_current_user | 내 프로필 수정 |

```python
# PUT /api/auth/profile
# Request:
{
  "name": "홍길동",             # 표시 이름 변경
  "email": "new@company.com",   # 이메일 변경 (중복 확인)
  "department": "경영지원팀",    # 부서 변경
  "avatar_url": "..."           # 프로필 이미지 URL (선택)
}

# 변경 불가 필드: username, role, allowed_routes (master만 변경 가능)
# Response: UserResponse
```

### 3-2. 프론트엔드 — 프로필 페이지

#### `pages/MyProfilePage.tsx` [NEW]

```
┌── 내 프로필 ──────────────────────────────────────────────┐
│                                                            │
│  ┌──── 프로필 정보 ──────────────────────────────┐         │
│  │                                                │        │
│  │  [👤 아바타]    홍길동                         │        │
│  │               hong@company.com                 │        │
│  │               투자팀 · master                  │        │
│  │               아이디: admin                    │        │
│  │               가입일: 2026-02-25               │        │
│  │                                                │        │
│  └────────────────────────────────────────────────┘        │
│                                                            │
│  ┌──── 정보 수정 ────────────────────────────────┐         │
│  │                                                │        │
│  │  이름:  [홍길동           ]                    │        │
│  │  이메일: [hong@company.com ]                   │        │
│  │  부서:  [투자팀           ]                    │        │
│  │                                                │        │
│  │  * 아이디(username)와 역할은 변경할 수 없습니다 │        │
│  │    역할 변경은 관리자에게 문의하세요             │        │
│  │                                                │        │
│  │                              [저장]            │        │
│  └────────────────────────────────────────────────┘        │
│                                                            │
│  ┌──── 비밀번호 변경 ────────────────────────────┐         │
│  │                                                │        │
│  │  현재 비밀번호:  [**************]              │        │
│  │  새 비밀번호:    [**************]              │        │
│  │  비밀번호 확인:  [**************]  [✓ 일치]    │        │
│  │                                                │        │
│  │                       [비밀번호 변경]          │        │
│  └────────────────────────────────────────────────┘        │
│                                                            │
│  ┌──── Google 연동 ──────────────────────────────┐         │
│  │                                                │        │
│  │  ✅ Google 계정이 연동되어 있습니다             │        │
│  │  hong@gmail.com                                │        │
│  │                                                │        │
│  │  [Google 연동 해제]                            │        │
│  │  또는                                          │        │
│  │  ⚠️ Google 계정이 연동되지 않았습니다           │        │
│  │  [Google 계정 연동하기]                        │        │
│  └────────────────────────────────────────────────┘        │
│                                                            │
│  ┌──── 활성 세션 ────────────────────────────────┐         │
│  │                                                │        │
│  │  현재 기기 · Windows · Chrome                  │        │
│  │  마지막 활동: 방금 전                          │        │
│  │                                                │        │
│  │  (다른 기기에서 로그인된 세션이 있을 경우 표시)  │        │
│  │  [모든 기기에서 로그아웃]                       │        │
│  └────────────────────────────────────────────────┘        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 3-3. 프로필 접근 방식

- Layout.tsx 상단 바 사용자 드롭다운에 **"내 프로필"** 메뉴 추가
- 라우트: `/profile` (모든 로그인 사용자 접근 가능 — `allowed_routes` 체크 불필요)

#### `App.tsx` [MODIFY]

```tsx
<Route path="/profile" element={<MyProfilePage />} />
// /profile은 RouteGuard 불필요 — 로그인된 모든 사용자 접근 가능
```

#### `components/Layout.tsx` [MODIFY]

```
사용자 드롭다운 메뉴:
├─ 내 프로필        [추가]
├─ 비밀번호 변경    [제거 → 프로필 페이지로 통합]
├─ 로그아웃
```

### 3-4. Google 연동/해제 API

#### `routers/auth.py` [MODIFY]

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| POST | `/api/auth/link-google` | get_current_user | Google 계정 연동 |
| POST | `/api/auth/unlink-google` | get_current_user | Google 연동 해제 |

```python
# POST /api/auth/link-google
# Request: { "credential": "eyJ..." }  ← Google ID Token
# - 토큰 검증 → google_id + email 추출
# - 현재 사용자의 google_id, avatar_url 업데이트
# - AuditLog 기록: action="google_link"

# POST /api/auth/unlink-google
# - google_id = null, avatar_url = null 으로 변경
# - password_hash가 반드시 설정되어 있어야 해제 가능 (Google-only 사용자 보호)
# - AuditLog 기록: action="google_unlink"
```

---

## Part 4. 세션 관리

### 4-1. 모든 기기 로그아웃

현재 JWT는 stateless여서 서버 측에서 개별 세션을 무효화할 수 없음. 간단한 해결책:

#### `models/user.py` [MODIFY]

```python
# [NEW] 토큰 무효화 시점 — 이 시각 이전에 발급된 토큰은 모두 무효
token_invalidated_at = Column(DateTime, nullable=True)
```

#### `dependencies/auth.py` [MODIFY]

```python
def get_current_user(...) -> User:
    ...
    # 토큰 발급 시각이 token_invalidated_at 이전이면 거부
    token_iat = payload.get("iat")
    if user.token_invalidated_at and token_iat:
        if datetime.utcfromtimestamp(token_iat) < user.token_invalidated_at:
            raise HTTPException(status_code=401, detail="세션이 만료되었습니다. 다시 로그인해 주세요.")
    ...
```

#### `routers/auth.py` [MODIFY]

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| POST | `/api/auth/logout-all` | get_current_user | 모든 기기에서 로그아웃 |

```python
# POST /api/auth/logout-all
# - user.token_invalidated_at = datetime.utcnow()
# - 현재 기기도 포함하여 모든 토큰 무효화
# - 프론트엔드에서 새로 로그인 필요
```

### 4-2. JWT 토큰에 iat(발급시각) 추가

#### `dependencies/auth.py` [MODIFY]

```python
def create_access_token(user_id: int) -> str:
    now = datetime.utcnow()
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({
        "sub": str(user_id),
        "exp": expire,
        "iat": now.timestamp(),   # [NEW] 발급 시각
        "type": "access",
    }, SECRET_KEY, ALGORITHM)
```

---

## Part 5. 초대 시스템

### 5-1. 초대 흐름

```
master가 초대 링크 생성 → 링크를 직원에게 전달 (메신저/이메일 등)
→ 직원이 링크 클릭 → 초대 가입 페이지 → 아이디/비밀번호 설정
→ 즉시 활성화 (승인 불필요)
```

### 5-2. 초대 모델

#### `models/invitation.py` [NEW]

```python
class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String, unique=True, nullable=False, index=True)  # UUID 또는 랜덤 문자열
    email = Column(String, nullable=True)       # 초대 이메일 (선택)
    name = Column(String, nullable=True)        # 초대 대상 이름 (선택)
    role = Column(String, nullable=False, default="viewer")    # 부여할 역할
    department = Column(String, nullable=True)
    allowed_routes = Column(Text, nullable=True)  # JSON 형태의 접근 권한
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # 생성한 master
    used_by = Column(Integer, ForeignKey("users.id"), nullable=True)      # 사용한 사용자
    used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)  # 만료 시각
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
```

### 5-3. 초대 API

#### `routers/invitations.py` [NEW]

| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| POST | `/api/invitations` | require_master | 초대 생성 |
| GET | `/api/invitations` | require_master | 초대 목록 |
| DELETE | `/api/invitations/{id}` | require_master | 초대 취소 |
| GET | `/api/invitations/verify?token=xxx` | 불필요 | 초대 토큰 유효성 확인 |
| POST | `/api/auth/register-with-invite` | 불필요 | 초대 기반 회원가입 |

**POST /api/invitations:**
```python
# Request:
{
  "email": "newuser@company.com",  # 선택
  "name": "신입사원",               # 선택
  "role": "manager",               # 부여할 역할
  "department": "투자팀",           # 선택
  "allowed_routes": ["/dashboard", "/tasks", "/worklogs"],  # 선택
  "expires_in_days": 7             # 만료 기간 (기본 7일)
}

# Response:
{
  "id": 1,
  "token": "abc123def456",
  "invite_url": "/register?invite=abc123def456",
  "expires_at": "2026-03-04T07:19:25Z",
  ...
}
```

**POST /api/auth/register-with-invite:**
```python
# Request:
{
  "token": "abc123def456",
  "username": "newuser",
  "password": "SecurePass123!",
  "name": "김신입"                  # 초대에 이름이 없으면 필수
}

# 서버 처리:
# 1. 초대 토큰 유효성 확인 (미사용 + 미만료)
# 2. username 중복 확인
# 3. User 생성:
#    - role = invitation.role
#    - allowed_routes = invitation.allowed_routes
#    - is_active = True  ← 초대 기반이므로 즉시 활성화!
# 4. invitation.used_by = user.id, used_at = now
# 5. AuditLog 기록: action="register_with_invite"
# 6. JWT 발급 → 바로 로그인 상태로 진입
```

### 5-4. 프론트엔드 — 초대 관리 UI

#### `pages/UsersPage.tsx` [MODIFY]

사용자 관리 페이지에 **초대** 탭 추가:

```
[활성 사용자 (12)]  [승인 대기 (3)]  [초대 관리 🔗]  [비활성 (2)]

(초대 관리 탭 선택 시)
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  [+ 새 초대 생성]                                            │
│                                                              │
│  대상       │ 역할     │ 만료일     │ 상태   │ 링크        │ 액션  │
│─────────────┼─────────┼───────────┼───────┼─────────────┼──────│
│  김신입     │ manager │ 03-04     │ 대기중│ [링크 복사]  │ [취소] │
│  —          │ viewer  │ 03-01     │ 대기중│ [링크 복사]  │ [취소] │
│  박사원     │ manager │ 02-28     │ 사용됨│ —           │ —     │
│  —          │ viewer  │ 02-20     │ 만료  │ —           │ —     │
└──────────────────────────────────────────────────────────────┘
```

**새 초대 생성 모달:**
```
┌─ 초대 링크 생성 ──────────────────────────────────────┐
│                                                        │
│  이름 (선택):   [김신입           ]                    │
│  이메일 (선택): [kim@company.com  ]                    │
│  역할:         [manager ▾        ]                    │
│  부서 (선택):   [투자팀           ]                    │
│  만료 기간:     [7일 ▾           ]                    │
│                                                        │
│  ── 접근 권한 (manager/viewer일 때만 표시) ──          │
│  ☑ 대시보드   ☑ 업무 보드   ☑ 워크플로우 ...         │
│                                                        │
│                         [취소]  [초대 생성]             │
└────────────────────────────────────────────────────────┘
```

**생성 후:**
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ✅ 초대 링크 생성 완료                               │
│                                                      │
│  아래 링크를 전달해 주세요:                            │
│  ┌──────────────────────────────────────────┐        │
│  │ https://erp.von.com/register?invite=abc  │ [복사] │
│  └──────────────────────────────────────────┘        │
│                                                      │
│  * 이 링크는 7일간 유효합니다                          │
│  * 1회만 사용 가능합니다                               │
│                                                      │
│                              [닫기]                   │
└──────────────────────────────────────────────────────┘
```

### 5-5. 초대 기반 가입 페이지

#### `pages/RegisterPage.tsx` [MODIFY]

URL에 `?invite=xxx` 쿼리가 있으면 초대 기반 가입 모드:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│              [V:ON 로고]                              │
│                                                      │
│         V:ON ERP 초대 가입                            │
│  초대자: 홍길동 (master)  |  역할: manager            │
│                                                      │
│  아이디: [newuser         ]  [✓ 사용 가능]           │
│  이름:   [김신입          ]  ← 초대에서 가져옴       │
│  비밀번호: [**************]                           │
│  비밀번호 확인: [**********]                          │
│                                                      │
│  [=============== 가입 완료 ================]        │
│                                                      │
│  * 이메일/부서/역할은 초대 시 설정된 값이 적용됩니다  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- 초대 기반 가입 → 즉시 활성화 → 바로 로그인 상태로 대시보드 이동

---

## Part 6. 비밀번호 재설정 요청 알림 (관리자)

### 6-1. 관리자 알림

비밀번호 재설정을 요청한 사용자가 있을 때, UsersPage에 알림:

#### `models/user.py` [MODIFY]

```python
# [NEW] 비밀번호 재설정 요청 시각
password_reset_requested_at = Column(DateTime, nullable=True)
```

#### `routers/auth.py` [MODIFY]

`POST /api/auth/forgot-password`:
```python
# Request: { "login_id": "park" }
# - username 또는 email로 User 조회
# - 존재하면 password_reset_requested_at = now 갱신
#   (존재하지 않아도 같은 응답 반환 — 사용자 존재 여부 노출 방지)
# - Response: { "message": "요청이 접수되었습니다." }
```

#### `pages/UsersPage.tsx` [MODIFY]

```
비밀번호 재설정 요청 알림:
┌──────────────────────────────────────────────────────┐
│  ⚠️ 비밀번호 재설정 요청 (2건)                        │
│  • 박대리 (park) — 요청 시각: 07:15                  │  [초기화] [링크 생성]
│  • 이사원 (leesa) — 요청 시각: 06:50                 │  [초기화] [링크 생성]
└──────────────────────────────────────────────────────┘
```

---

## Part 7. 라우트 구성

#### `App.tsx` [MODIFY]

```tsx
// 비인증 라우트 (로그인 불필요)
<Route path="/login" element={<LoginPage />} />
<Route path="/register" element={<RegisterPage />} />
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/reset-password" element={<ResetPasswordPage />} />

// 인증 라우트
<Route element={<RequireAuth />}>
  <Route element={<Layout />}>
    <Route path="/profile" element={<MyProfilePage />} />
    {/* 기존 라우트 유지 */}
  </Route>
</Route>
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `frontend/src/pages/RegisterPage.tsx` | 회원가입 페이지 (일반 + 초대 기반) |
| 2 | [NEW] | `frontend/src/pages/ForgotPasswordPage.tsx` | 비밀번호 찾기 페이지 |
| 3 | [NEW] | `frontend/src/pages/ResetPasswordPage.tsx` | 비밀번호 재설정 페이지 (토큰 기반) |
| 4 | [NEW] | `frontend/src/pages/MyProfilePage.tsx` | 내 프로필 페이지 (정보 수정 + 비밀번호 + Google 연동 + 세션) |
| 5 | [NEW] | `backend/models/invitation.py` | 초대 모델 |
| 6 | [NEW] | `backend/routers/invitations.py` | 초대 CRUD + 토큰 검증 |
| 7 | [MODIFY] | `backend/routers/auth.py` | register, forgot-password, reset-password, profile, link-google, unlink-google, logout-all 추가 |
| 8 | [MODIFY] | `backend/routers/users.py` | pending, approve, reject, reset-password, generate-reset-token, unlock 추가 |
| 9 | [MODIFY] | `backend/schemas/user.py` | RegisterRequest, ForgotPasswordRequest, ResetPasswordRequest, ProfileUpdateRequest 추가 |
| 10 | [MODIFY] | `backend/models/user.py` | token_invalidated_at, password_reset_requested_at 추가 |
| 11 | [MODIFY] | `backend/dependencies/auth.py` | create_access_token에 iat 추가, token_invalidated_at 검증 |
| 12 | [MODIFY] | `frontend/src/pages/LoginPage.tsx` | 회원가입/비밀번호 찾기 링크 추가 |
| 13 | [MODIFY] | `frontend/src/pages/UsersPage.tsx` | 승인 대기/초대 관리 탭, 비밀번호 관리 UI, 재설정 요청 알림 |
| 14 | [MODIFY] | `frontend/src/App.tsx` | /register, /forgot-password, /reset-password, /profile 라우트 추가 |
| 15 | [MODIFY] | `frontend/src/components/Layout.tsx` | 드롭다운에 "내 프로필" 추가, "비밀번호 변경" 제거 |
| 16 | [MODIFY] | `frontend/src/contexts/AuthContext.tsx` | updateProfile, linkGoogle, unlinkGoogle, logoutAll 추가 |
| 17 | [MODIFY] | `frontend/src/lib/api.ts` | register, checkUsername, forgotPassword, resetPassword, profileUpdate, invitation, linkGoogle, unlinkGoogle, logoutAll API 함수 |
| 18 | [MODIFY] | `backend/models/__init__.py` | Invitation import 추가 |
| 19 | [MODIFY] | `backend/main.py` | invitations 라우터 등록 |

---

## Acceptance Criteria

### 회원가입
- [ ] **AC-01:** 회원가입 페이지에서 아이디/이름/비밀번호를 입력하여 가입 신청할 수 있다.
- [ ] **AC-02:** 아이디 입력 시 실시간 중복 확인이 표시된다.
- [ ] **AC-03:** 가입 후 "관리자 승인 대기" 안내가 표시된다.
- [ ] **AC-04:** master가 승인 대기 사용자를 승인/거절할 수 있다.
- [ ] **AC-05:** 승인된 사용자만 로그인이 가능하다.
- [ ] **AC-06:** 로그인 페이지에서 회원가입 링크 클릭 시 가입 페이지로 이동한다.

### 비밀번호 찾기/재설정
- [ ] **AC-07:** 비밀번호 찾기 페이지에서 아이디/이메일로 재설정 요청을 보낼 수 있다.
- [ ] **AC-08:** master가 사용자의 비밀번호를 임시 비밀번호로 초기화할 수 있다.
- [ ] **AC-09:** master가 재설정 링크를 생성하고 복사할 수 있다.
- [ ] **AC-10:** 재설정 링크를 통해 새 비밀번호를 설정할 수 있다.
- [ ] **AC-11:** 재설정 토큰이 30분 후 만료된다.
- [ ] **AC-12:** 비밀번호 재설정 시 계정 잠금이 자동 해제된다.
- [ ] **AC-13:** 사용자 관리에 재설정 요청 알림이 표시된다.

### 프로필
- [ ] **AC-14:** 내 프로필 페이지에서 이름/이메일/부서를 수정할 수 있다.
- [ ] **AC-15:** 내 프로필에서 비밀번호를 변경할 수 있다.
- [ ] **AC-16:** Google 계정을 연동/해제할 수 있다.
- [ ] **AC-17:** 상단 바 드롭다운에서 "내 프로필"로 이동할 수 있다.

### 초대 시스템
- [ ] **AC-18:** master가 초대 링크를 생성할 수 있다 (역할/권한 사전 설정).
- [ ] **AC-19:** 초대 링크를 클립보드에 복사할 수 있다.
- [ ] **AC-20:** 초대 링크로 접속한 사용자가 아이디/비밀번호만 설정하면 즉시 가입 + 활성화된다.
- [ ] **AC-21:** 사용된 초대 링크는 재사용이 불가하다.
- [ ] **AC-22:** 만료된 초대 링크는 사용 불가 → 안내 메시지 표시.
- [ ] **AC-23:** master가 미사용 초대를 취소할 수 있다.

### 세션 관리
- [ ] **AC-24:** "모든 기기에서 로그아웃" 시 모든 토큰이 무효화된다.
- [ ] **AC-25:** 무효화된 토큰으로 API 호출 시 401 → 로그인 페이지 리다이렉트.

### 기타
- [ ] **AC-26:** Phase 31~42_3의 모든 기존 기능이 정상 동작한다.
- [ ] **AC-27:** 모든 보안 이벤트(가입, 승인, 거절, 초대, 비밀번호 변경/초기화, 연동)가 audit_logs에 기록된다.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 API의 입력/출력 구조 — 유지
3. 기존 데이터베이스 컬럼 — 삭제/이름변경 금지 (새 컬럼만 추가)
4. Layout.tsx의 `DROPDOWN_GROUPS` 상수 구조 — 유지
5. Phase 31~42_3의 기존 로그인/인증 인프라 — 보강만, 삭제/재구성 금지
6. AuthContext.tsx의 기존 인터페이스 — 유지하고 확장만
