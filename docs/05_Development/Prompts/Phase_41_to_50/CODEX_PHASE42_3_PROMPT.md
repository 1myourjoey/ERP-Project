# Phase 42_3: 로그인 시스템 + 역할 기반 접근 제어 (RBAC) + 보안

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0 — 배포 전 필수  
**의존성:** Phase 36 이후 독립 적용 가능  
**핵심 원칙:**
1. **기존 User 모델 확장** — users 테이블에 username 추가, 이메일 또는 아이디로 로그인
2. **Google OAuth 연동** — 사내 Google Workspace 계정으로 간편 로그인
3. **마스터 관리자가 탭/항목별 권한 제어** — 사용자별로 네비게이션 그룹 및 개별 메뉴 표시/숨김
4. **배포 수준 보안** — 비밀번호 암호화, JWT 보안, API 보호, 감사 로그

---

## Part 0. 전수조사 (필수)

- [ ] `models/user.py` — User 모델 확인 (email, password_hash, role, department, is_active, last_login_at)
- [ ] `schemas/user.py` — UserCreate(password 없음!), UserUpdate, UserResponse 스키마 확인
- [ ] `routers/users.py` — 기존 CRUD (list/create/update/deactivate) 확인, 로그인 API 없음
- [ ] `frontend/src/App.tsx` — 27개 라우트, auth guard 없음, 모두 `<Layout>` 안에 위치
- [ ] `frontend/src/components/Layout.tsx` — DROPDOWN_GROUPS 구조 확인:
  - 대시보드: `/dashboard`
  - 업무 그룹: `/tasks`, `/worklogs`
  - 조합·투자 그룹: `/fund-overview`, `/funds`, `/investments`, `/investment-reviews`, `/workflows`, `/exits`
  - 재무 그룹: `/transactions`, `/valuations`, `/accounting`, `/fee-management`
  - 관리 그룹: `/lp-management`, `/users`, `/compliance`, `/biz-reports`, `/vics`, `/internal-reviews`, `/reports`, `/fund-operations`, `/documents`, `/templates`
- [ ] `lib/api.ts` — 기존 API 함수들의 인증 헤더 처리 여부 확인
- [ ] `main.py` — FastAPI 앱 설정, 미들웨어 확인

---

## Part 1. 백엔드 — 인증 시스템

### 1-1. User 모델 확장

#### `models/user.py` [MODIFY]

```python
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False, index=True)   # [NEW] 로그인 아이디
    email = Column(String, unique=True, nullable=True, index=True)       # [MODIFY] nullable → True (구글 연동 시 자동 채움)
    name = Column(String, nullable=False)                                # 표시 이름
    password_hash = Column(String, nullable=True)                        # 기존 유지 (구글 로그인 시 null)
    role = Column(String, nullable=False, default="viewer")
    department = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # [NEW] 권한 제어
    allowed_routes = Column(Text, nullable=True, default=None)
    # JSON: ["/dashboard","/tasks","/worklogs",...] 또는 null (null=전체 접근)

    # [NEW] Google OAuth
    google_id = Column(String, unique=True, nullable=True, index=True)
    avatar_url = Column(String, nullable=True)

    # [NEW] 보안
    login_fail_count = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)    # 잠금 해제 시각
    password_changed_at = Column(DateTime, nullable=True)
```

### 1-2. 역할(Role) 체계

| role | 설명 | 권한 |
|------|------|------|
| `master` | 마스터 관리자 | 모든 기능 + 사용자 관리 + 권한 설정 + 감사 로그 |
| `admin` | 관리자 | 모든 기능 (사용자 권한 설정 불가) |
| `manager` | 매니저 | allowed_routes에 따른 접근 |
| `viewer` | 열람자 | allowed_routes에 따른 접근 (읽기 위주) |

### 1-3. 로그인 방식 2가지

#### **방식 A: 아이디 + 비밀번호 로그인 (기본)**

사용자가 `username`(일반 아이디) 또는 `email`로 로그인:

```
로그인 입력: "hong" 또는 "hong@company.com"
→ users 테이블에서 username="hong" OR email="hong@company.com" 조회
→ password_hash 비교 → JWT 발급
```

#### **방식 B: Google OAuth 로그인 (선택)**

사내 Google Workspace 계정으로 간편 로그인:

```
[Google로 로그인] 버튼 클릭
→ Google OAuth 인증 → google_id + email + name 수신
→ users 테이블에서 google_id 또는 email 매칭
→ 기존 사용자면 로그인, 미등록이면 "관리자에게 등록 요청" 안내
→ JWT 발급
```

> **⚠️ 중요:** Google 로그인은 기존에 master가 사용자를 먼저 등록한 경우에만 허용. 아무 Google 계정이나 로그인되면 안 됨. email 또는 google_id가 일치하는 기존 `User`가 있어야 로그인 성공.

### 1-4. 인증 API

#### `routers/auth.py` [NEW]

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/auth/login` | 아이디/이메일 + 비밀번호 → JWT 토큰 |
| POST | `/api/auth/google` | Google OAuth 토큰 → JWT 토큰 |
| GET | `/api/auth/me` | 현재 로그인 사용자 정보 |
| POST | `/api/auth/change-password` | 비밀번호 변경 |
| POST | `/api/auth/refresh` | 토큰 갱신 (만료 전 연장) |

**POST /api/auth/login:**
```python
# Request:
{
  "login_id": "hong",           # username 또는 email
  "password": "securePass123!"
}

# Response (성공):
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",     # 리프레시 토큰
  "token_type": "bearer",
  "expires_in": 3600,            # 초 단위 (1시간)
  "user": {
    "id": 1,
    "username": "hong",
    "email": "hong@company.com",
    "name": "홍길동",
    "role": "master",
    "department": "투자팀",
    "avatar_url": null,
    "allowed_routes": null
  }
}

# Response (실패 — 5회 초과 잠금):
{
  "detail": "로그인 시도가 5회 초과되어 계정이 30분간 잠금되었습니다."
}
```

**POST /api/auth/google:**
```python
# Request:
{
  "credential": "eyJ..."   # Google에서 받은 ID Token
}

# 서버에서:
# 1. google-auth 라이브러리로 토큰 검증
# 2. google_id 또는 email로 User 조회
# 3. 미등록 사용자면 400 반환: "등록된 사용자가 아닙니다. 관리자에게 문의하세요."
# 4. 등록된 사용자면 JWT 발급 + last_login_at 업데이트
```

### 1-5. JWT 토큰 보안

#### `dependencies/auth.py` [NEW]

```python
import os
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext

# 환경변수 기반 시크릿 키 (하드코딩 금지)
SECRET_KEY = os.environ.get("VON_SECRET_KEY", "dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60      # 액세스 토큰: 1시간
REFRESH_TOKEN_EXPIRE_DAYS = 7         # 리프레시 토큰: 7일
MAX_LOGIN_FAILURES = 5                # 최대 로그인 실패 횟수
LOCK_DURATION_MINUTES = 30            # 잠금 시간

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expire, "type": "access"}, SECRET_KEY, ALGORITHM)

def create_refresh_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire, "type": "refresh"}, SECRET_KEY, ALGORITHM)

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="비활성화된 계정입니다")
    return user

def require_master(user: User = Depends(get_current_user)) -> User:
    if user.role != "master":
        raise HTTPException(status_code=403, detail="마스터 관리자만 접근 가능합니다")
    return user
```

### 1-6. 비밀번호 정책

| 규칙 | 설명 |
|------|------|
| 최소 길이 | 8자 이상 |
| 구성 | 영문 + 숫자 포함 (특수문자 선택) |
| 실패 잠금 | 5회 연속 실패 → 30분 잠금 |
| 강제 변경 | 없음 (나중에 추가 가능) |

```python
def validate_password(password: str) -> str | None:
    """비밀번호 유효성 검증. 문제 있으면 에러 메시지 반환, 없으면 None."""
    if len(password) < 8:
        return "비밀번호는 최소 8자 이상이어야 합니다"
    if not any(c.isalpha() for c in password):
        return "비밀번호에 영문자가 포함되어야 합니다"
    if not any(c.isdigit() for c in password):
        return "비밀번호에 숫자가 포함되어야 합니다"
    return None
```

### 1-7. 기존 API에 인증 적용

#### 모든 `routers/*.py` [MODIFY — 일괄 적용]

```python
# 모든 엔드포인트에 추가:
current_user: User = Depends(get_current_user)

# 예외:
# - POST /api/auth/login → 인증 불필요
# - POST /api/auth/google → 인증 불필요
# - POST /api/users, PUT /api/users/{id} → require_master 적용
```

> **기존 API 시그니처(입력/출력) 절대 변경 금지. 의존성만 추가.**

### 1-8. 감사 로그 (Audit Log)

#### `models/audit_log.py` [NEW]

```python
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String, nullable=False)       # "login", "login_fail", "logout", "password_change", "user_create", "user_update", "permission_change"
    target_type = Column(String, nullable=True)    # "user", "task", "fund", ...
    target_id = Column(Integer, nullable=True)
    detail = Column(Text, nullable=True)           # JSON 상세 정보
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
```

**기록 대상 (보안 관련 이벤트만):**
- 로그인 성공/실패
- 로그아웃
- 비밀번호 변경
- 사용자 생성/수정/비활성화
- 권한(allowed_routes) 변경

> **일반 업무 CRUD는 감사 로그 대상이 아님.** 보안 이벤트만 기록.

### 1-9. schemas/user.py 확장

#### `schemas/user.py` [MODIFY]

```python
class UserCreate(BaseModel):
    username: str              # [NEW] 로그인 아이디
    email: Optional[str] = None
    name: str
    password: str              # [NEW]
    role: str = "viewer"
    department: Optional[str] = None
    is_active: bool = True
    allowed_routes: Optional[list[str]] = None  # [NEW]
    google_id: Optional[str] = None             # [NEW] 구글 연동 시

class UserUpdate(BaseModel):
    username: Optional[str] = None   # [NEW]
    email: Optional[str] = None
    name: Optional[str] = None
    password: Optional[str] = None   # [NEW]
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
    allowed_routes: Optional[list[str]] = None  # [NEW]
    google_id: Optional[str] = None             # [NEW]

class UserResponse(BaseModel):
    id: int
    username: str              # [NEW]
    email: Optional[str] = None
    name: str
    role: str
    department: Optional[str] = None
    is_active: bool
    avatar_url: Optional[str] = None    # [NEW]
    allowed_routes: Optional[list[str]] = None  # [NEW]
    last_login_at: Optional[datetime] = None
    created_at: datetime
    model_config = {"from_attributes": True}

class LoginRequest(BaseModel):           # [NEW]
    login_id: str     # username 또는 email
    password: str

class GoogleLoginRequest(BaseModel):     # [NEW]
    credential: str   # Google ID Token

class LoginResponse(BaseModel):          # [NEW]
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse

class ChangePasswordRequest(BaseModel):  # [NEW]
    current_password: str
    new_password: str
```

### 1-10. 초기 마스터 계정

#### `seed_master.py` [NEW]

```python
"""
최초 실행 시 마스터 관리자 계정을 생성.
이미 master 계정이 존재하면 스킵.

실행: python seed_master.py
"""
# username: admin
# password: VonAdmin2026!
# email: (빈값 또는 원하는 이메일)
# role: master
# allowed_routes: null (전체 접근)
```

---

## Part 2. 프론트엔드 — 인증 시스템

### 2-1. 인증 컨텍스트

#### `contexts/AuthContext.tsx` [NEW]

```typescript
interface AuthUser {
  id: number
  username: string
  email: string | null
  name: string
  role: "master" | "admin" | "manager" | "viewer"
  department: string | null
  avatar_url: string | null
  allowed_routes: string[] | null  // null = 전체 접근
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  isMaster: boolean
  login: (loginId: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  logout: () => void
  hasAccess: (routeKey: string) => boolean
  changePassword: (currentPw: string, newPw: string) => Promise<void>
}
```

**동작:**
1. 앱 시작 → `localStorage`에서 `von_access_token` 확인
2. 있으면 `GET /api/auth/me` 호출 → 유효하면 로그인 유지
3. 만료(401) → `von_refresh_token`으로 `POST /api/auth/refresh` → 재발급
4. refresh도 실패 → 로그인 페이지로 리다이렉트
5. `hasAccess(routeKey)`: `user.allowed_routes == null` → `true`, 배열이면 포함 여부

### 2-2. API 클라이언트 보안 강화

#### `lib/api.ts` [MODIFY]

```typescript
// 1. 모든 API 호출에 Authorization 헤더 자동 주입
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("von_access_token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// 2. 401 응답 시 자동 토큰 갱신 또는 로그인 리다이렉트
async function apiRequest(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...options.headers },
  })
  if (response.status === 401) {
    // refresh 시도 → 실패 시 /login으로 리다이렉트
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      // 원래 요청 재시도
      return fetch(url, {
        ...options,
        headers: { ...getAuthHeaders(), ...options.headers },
      })
    }
    window.location.href = "/login"
    throw new Error("인증이 만료되었습니다")
  }
  return response
}
```

### 2-3. 로그인 페이지

#### `pages/LoginPage.tsx` [NEW]

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│              [V:ON 로고]                              │
│                                                      │
│         V:ON ERP에 오신 것을 환영합니다               │
│                                                      │
│     ┌────────────────────────────────────┐           │
│     │  👤 아이디 또는 이메일              │           │
│     │  hong                              │           │
│     └────────────────────────────────────┘           │
│     ┌────────────────────────────────────┐           │
│     │  🔒 비밀번호                       │           │
│     │  ********                          │           │
│     └────────────────────────────────────┘           │
│                                                      │
│     [=============== 로그인 ================]        │
│                                                      │
│     ──────────── 또는 ────────────                    │
│                                                      │
│     [  G  Google 계정으로 로그인    ]                 │
│                                                      │
│     로그인 문제 발생 시 관리자에게 문의하세요          │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**디자인:**
- 전체 화면 중앙 배치, ShaderBackground 활용
- 기존 V:ON 테마 일관성 유지
- 오류 메시지 한글 표시 ("아이디 또는 비밀번호가 올바르지 않습니다")
- 계정 잠금 시 메시지 ("계정이 잠금되었습니다. 30분 후 다시 시도해 주세요.")
- Enter 키 제출 가능

**Google 로그인 버튼:**
```typescript
// Google Identity Services (GIS) SDK 사용
// <script src="https://accounts.google.com/gsi/client" async defer>
// Google Client ID는 환경변수로 관리: VITE_GOOGLE_CLIENT_ID
```

### 2-4. Google OAuth 프론트엔드 연동

#### `components/GoogleLoginButton.tsx` [NEW]

```typescript
interface GoogleLoginButtonProps {
  onSuccess: (credential: string) => void
  onError?: () => void
}

// Google Identity Services (GIS) 라이브러리 사용
// 1. 로그인 페이지 로드 시 google.accounts.id.initialize({ client_id, callback })
// 2. 사용자가 Google 버튼 클릭 → Google 팝업
// 3. 인증 성공 → credential(ID Token) 반환
// 4. POST /api/auth/google { credential } → JWT 발급
```

#### `index.html` [MODIFY]

```html
<!-- Google Identity Services SDK 로드 -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

### 2-5. App.tsx + Layout.tsx 변경

#### `App.tsx` [MODIFY]

```tsx
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            {/* 기존 27개 라우트 모두 유지, 각각 RouteGuard 래핑 */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tasks" element={<RouteGuard routeKey="/tasks"><TaskBoardPage /></RouteGuard>} />
            {/* ... 나머지 라우트 동일 패턴 ... */}
            <Route path="/users" element={<RouteGuard routeKey="/users"><UsersPage /></RouteGuard>} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}
```

#### `components/Layout.tsx` [MODIFY]

기존 `DROPDOWN_GROUPS`를 `hasAccess()`로 필터링 + **상단 바 사용자 영역 추가:**

```
┌─── 상단 네비게이션 바 ────────────────────────────────────────────┐
│ [V:ON 로고]  대시보드  업무▾  조합·투자▾  재무▾  관리▾           │
│                                           [테마] [검색] [👤 홍길동 ▾] │
│                                                    ├─ 비밀번호 변경  │
│                                                    ├─ 로그아웃       │
│                                                    └────────────────│
└───────────────────────────────────────────────────────────────────┘
```

- `avatar_url`이 있으면 프로필 이미지 표시 (Google 연동 시)
- 없으면 이름 첫 글자 아바타 표시

---

## Part 3. 마스터 관리자 — 사용자 권한 관리 UI

### 3-1. UsersPage 확장

#### `pages/UsersPage.tsx` [MODIFY — 대폭 확장]

**사용자 목록:**
```
┌──────────────────────────────────────────────────────────────────┐
│  👥 사용자 관리                                       [+ 추가]  │
├──────────────────────────────────────────────────────────────────┤
│  이름     │ 아이디   │ 이메일              │ 역할   │ 상태│ 액션│
│───────────┼─────────┼────────────────────┼───────┼─────┼────│
│  홍길동   │ admin   │ hong@company.com   │ master│ 활성│[편집]│
│  김이사   │ kimisa  │ kim@company.com    │ admin │ 활성│[편집]│
│  박대리   │ park    │ — (Google 연동)     │ manager│활성│[편집]│
│  이인턴   │ leeintern│                   │ viewer│ 활성│[편집]│
└──────────────────────────────────────────────────────────────────┘
```

**사용자 추가/편집 모달:**
```
┌─ 사용자 편집 ──────────────────────────────────────────────────┐
│                                                                │
│  [기본 정보]                                                    │
│  아이디: [park          ]    (* 변경 불가 — 생성 시에만 설정)  │
│  이름:   [박대리        ]    이메일: [park@company.com    ]    │
│  역할:   [manager ▾     ]    부서:   [투자팀             ]    │
│  비밀번호: [**********  ]    (비우면 기존 유지)                 │
│                                                                │
│  [Google 연동]                                                  │
│  ☐ Google 계정 연동 허용                                       │
│  Google 이메일: [park@company.com]  (일치하는 Google 계정만 가능) │
│                                                                │
│  ── 접근 권한 설정 ──────────────────────────────────────────  │
│  (* master/admin은 전체 접근 — 설정 불필요)                     │
│                                                                │
│  ☑ 대시보드                             ← 해제 불가            │
│                                                                │
│  ▼ 업무                                [그룹 전체 선택/해제]   │
│    ☑ 업무 보드 (/tasks)                                       │
│    ☑ 업무 기록 (/worklogs)                                    │
│                                                                │
│  ▼ 조합·투자                           [그룹 전체 선택/해제]   │
│    ☑ 조합 개요     ☑ 조합 관리                                │
│    ☑ 투자 관리     ☐ 투자 심의                                │
│    ☑ 워크플로우    ☐ 회수 관리                                │
│                                                                │
│  ▼ 재무                                [그룹 전체 선택/해제]   │
│    ☐ 거래원장      ☐ 가치평가                                 │
│    ☐ 회계 관리     ☐ 보수 관리                                │
│                                                                │
│  ▼ 관리                                [그룹 전체 선택/해제]   │
│    ☑ LP 관리       ☐ 컴플라이언스                             │
│    ☐ 사용자 관리   ☐ 영업보고                                 │
│    ...                                                          │
│                                                                │
│  [전체 선택]  [전체 해제]                                       │
│                                                                │
│                                   [취소]  [저장]                │
└────────────────────────────────────────────────────────────────┘
```

### 3-2. 접근 불가 페이지

#### `pages/AccessDeniedPage.tsx` [NEW]

```
┌──────────────────────────────────────┐
│                                      │
│         🚫 접근 권한이 없습니다       │
│                                      │
│  이 페이지는 접근 권한이 없습니다.    │
│  필요한 경우 관리자에게 문의하세요.   │
│                                      │
│         [대시보드로 이동]             │
│                                      │
└──────────────────────────────────────┘
```

---

## Part 4. 계정별 기능 연동

### 4-1. 모델 확장

| 모델 | 추가 필드 | 용도 |
|------|----------|------|
| `Task` | `created_by = Column(Integer, FK("users.id"), nullable=True)` | 업무 생성자 |
| `Attachment` | `uploaded_by = Column(Integer, FK("users.id"), nullable=True)` | 업로더 |
| `WorkflowInstance` | `created_by` 이미 없으면 추가 | 워크플로 생성자 |

> **원칙:** `nullable=True` — 기존 데이터 호환성 유지. 새 데이터만 자동 연결.

### 4-2. API에서 자동 주입

```python
# 예: Task 생성 시
new_task = Task(..., created_by=current_user.id)

# 예: Attachment 업로드 시
new_attachment = Attachment(..., uploaded_by=current_user.id)
```

---

## Part 5. 보안 강화

### 5-1. 환경변수 관리

#### `.env.example` [NEW]

```env
# JWT 시크릿 (반드시 변경!)
VON_SECRET_KEY=change-this-to-a-random-64-char-string

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# 서버 설정
CORS_ORIGINS=http://localhost:5173,http://192.168.0.100:5173
```

#### `main.py` [MODIFY]

```python
# CORS 설정 — 환경변수 기반
origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 5-2. 보안 헤더

```python
# main.py에 보안 미들웨어 추가
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response
```

### 5-3. Rate Limiting (선택)

로그인 API에 속도 제한:
- `/api/auth/login`: 같은 IP에서 분당 10회 제한 (선택적 구현)

---

## Part 6. 마이그레이션

#### `migrations/versions/xxx_phase42_3_auth.py` [NEW]

```python
# 변경사항:
# 1. users: username(unique), google_id(unique, nullable), avatar_url, allowed_routes,
#    login_fail_count, locked_until, password_changed_at 추가
#    email을 nullable=True로 변경
# 2. tasks: created_by 추가
# 3. attachments: uploaded_by 추가
# 4. audit_logs 테이블 생성
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [MODIFY] | `backend/models/user.py` | username, google_id, avatar_url, allowed_routes, 보안 필드 추가 |
| 2 | [NEW] | `backend/models/audit_log.py` | 감사 로그 모델 |
| 3 | [MODIFY] | `backend/models/task.py` | created_by 추가 |
| 4 | [MODIFY] | `backend/models/attachment.py` | uploaded_by 추가 |
| 5 | [MODIFY] | `backend/schemas/user.py` | username, password, Login/Google/ChangePassword 스키마 |
| 6 | [NEW] | `backend/routers/auth.py` | login, google, me, change-password, refresh API |
| 7 | [NEW] | `backend/dependencies/auth.py` | JWT, bcrypt, get_current_user, require_master |
| 8 | [MODIFY] | `backend/routers/users.py` | password 해싱, allowed_routes, username 처리, require_master |
| 9 | [MODIFY] | `backend/routers/*.py` (전체) | get_current_user 의존성 추가 |
| 10 | [MODIFY] | `backend/main.py` | auth 라우터, CORS 환경변수, 보안 헤더 |
| 11 | [NEW] | `backend/seed_master.py` | 초기 마스터 계정 (username: admin) |
| 12 | [NEW] | `backend/migrations/versions/xxx_phase42_3_auth.py` | DB 마이그레이션 |
| 13 | [NEW] | `backend/.env.example` | 환경변수 템플릿 |
| 14 | [NEW] | `frontend/src/contexts/AuthContext.tsx` | 인증 컨텍스트 |
| 15 | [NEW] | `frontend/src/pages/LoginPage.tsx` | 로그인 페이지 (아이디 + Google) |
| 16 | [NEW] | `frontend/src/pages/AccessDeniedPage.tsx` | 접근 불가 페이지 |
| 17 | [NEW] | `frontend/src/components/RequireAuth.tsx` | 인증 라우트 가드 |
| 18 | [NEW] | `frontend/src/components/RouteGuard.tsx` | 권한 라우트 가드 |
| 19 | [NEW] | `frontend/src/components/GoogleLoginButton.tsx` | Google 로그인 버튼 |
| 20 | [MODIFY] | `frontend/src/App.tsx` | AuthProvider + /login + RequireAuth + RouteGuard |
| 21 | [MODIFY] | `frontend/src/components/Layout.tsx` | 메뉴 필터링 + 사용자 드롭다운 + 로그아웃 |
| 22 | [MODIFY] | `frontend/src/pages/UsersPage.tsx` | 사용자 권한 관리 UI (username + Google + 라우트 체크박스) |
| 23 | [MODIFY] | `frontend/src/lib/api.ts` | 인증 헤더 + 401 핸들링 + 로그인/Google API 함수 |
| 24 | [MODIFY] | `frontend/index.html` | Google GIS SDK 스크립트 태그 |

---

## Acceptance Criteria

### 인증 — 아이디 로그인
- [ ] **AC-01:** 아이디(username) 또는 이메일로 로그인할 수 있다.
- [ ] **AC-02:** 로그인하지 않은 상태에서 접근 시 로그인 페이지로 리다이렉트된다.
- [ ] **AC-03:** JWT 토큰이 localStorage에 저장되고 새로고침 후에도 로그인 유지된다.
- [ ] **AC-04:** 액세스 토큰 만료 시 리프레시 토큰으로 자동 갱신된다.
- [ ] **AC-05:** 로그아웃 시 토큰 삭제 + 로그인 페이지로 이동한다.
- [ ] **AC-06:** 비밀번호를 변경할 수 있다 (8자 이상, 영문+숫자).

### 인증 — Google 로그인
- [ ] **AC-07:** Google 계정으로 로그인할 수 있다 (사전에 관리자가 등록한 사용자만).
- [ ] **AC-08:** 미등록 Google 계정 로그인 시 "관리자에게 문의하세요" 메시지 표시.
- [ ] **AC-09:** Google 프로필 이미지가 상단 바에 표시된다.

### 보안
- [ ] **AC-10:** 비밀번호가 bcrypt로 해싱되어 저장된다.
- [ ] **AC-11:** 5회 연속 로그인 실패 시 30분간 계정이 잠긴다.
- [ ] **AC-12:** 로그인/비밀번호 변경/사용자 관리 이벤트가 audit_logs에 기록된다.
- [ ] **AC-13:** JWT SECRET_KEY가 환경변수로 관리된다 (하드코딩 아님).

### 권한
- [ ] **AC-14:** master가 사용자별 접근 라우트를 체크박스로 설정할 수 있다.
- [ ] **AC-15:** 접근 권한이 없는 메뉴가 네비게이션에 보이지 않는다.
- [ ] **AC-16:** 접근 권한이 없는 URL 직접 입력 시 접근 불가 페이지 표시.
- [ ] **AC-17:** master/admin은 모든 메뉴 접근 가능 (allowed_routes=null).
- [ ] **AC-18:** /users는 master만 접근 가능.
- [ ] **AC-19:** /dashboard는 모든 사용자에게 항상 접근 가능.

### 계정 연동
- [ ] **AC-20:** Task 생성 시 created_by에 로그인 사용자 ID 자동 기록.
- [ ] **AC-21:** 파일 첨부 시 uploaded_by에 로그인 사용자 ID 자동 기록.
- [ ] **AC-22:** Phase 31~42_2의 모든 기능이 로그인 후 정상 동작.

### 초기 세팅
- [ ] **AC-23:** `python seed_master.py` 실행 시 마스터 계정(username: admin) 생성.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 API의 입력/출력 구조 — 유지 (인증 헤더만 추가)
3. 기존 데이터베이스 컬럼 — 삭제/이름변경 금지 (새 컬럼만 추가)
4. Layout.tsx의 `DROPDOWN_GROUPS` 상수 구조 — 유지 (필터링만 추가)
5. Phase 31~42_2의 기존 구현 — 보강만, 삭제/재구성 금지

## ⚠️ 의존성 설치 필요

```bash
pip install python-jose[cryptography] passlib[bcrypt] google-auth
```

`requirements.txt`에 추가:
```
python-jose[cryptography]
passlib[bcrypt]
google-auth
```
