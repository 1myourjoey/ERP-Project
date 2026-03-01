# Phase 70: 알림 시스템 & 대시보드 고도화

> **의존성:** Phase 67 완료 (데이터 연계 자동화)
> **근거:** `docs/ERP_ANALYSIS_AND_STRATEGY.md` §4.1 핵심 누락, §6 VC 관리자 효율화

**Priority:** P1 — 1인 관리자 효율성의 핵심
**핵심 원칙:**
1. **푸시 알림 아님** — 브라우저 내 알림 센터 (폴링 or SSE)
2. **액션 가능한 알림** — 알림에서 바로 처리 가능 (원클릭 액션)
3. **과도한 알림 방지** — 중요도별 필터링, 묶음 처리

---

## Part 1. 알림 모델 & 서비스

### 1-1. 알림 모델

#### [NEW] `backend/models/notification.py`

```python
"""인앱 알림 모델.

알림 유형:
- task_due: 태스크 마감 임박/경과
- workflow_step: 워크플로우 단계 완료/대기
- compliance_due: 컴플라이언스 의무사항 마감 임박
- capital_call_due: 자본금 콜 납입 마감 임박
- document_expiry: 서류 만료 임박
- approval_needed: 승인 대기 (분개, 배분 등)
- system: 시스템 공지
"""

class Notification(Base):
    __tablename__ = 'notifications'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)

    # 알림 분류
    category = Column(String(30), nullable=False)  # task | workflow | compliance | capital | document | approval | system
    severity = Column(String(10), default='info')   # info | warning | urgent
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=True)

    # 연결 대상 (다형성 참조)
    target_type = Column(String(30), nullable=True)  # 'task' | 'workflow_instance' | 'capital_call' | ...
    target_id = Column(Integer, nullable=True)

    # 원클릭 액션
    action_type = Column(String(30), nullable=True)   # 'navigate' | 'approve' | 'dismiss'
    action_url = Column(String(500), nullable=True)    # 프론트엔드 라우트 (예: '/funds/1/capital-calls')
    action_payload = Column(JSON, nullable=True)       # API 호출에 필요한 데이터

    # 상태
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())

    # 관계
    user = relationship('User', backref='notifications')
```

#### Alembic 마이그레이션

```python
op.create_table('notifications',
    sa.Column('id', sa.Integer, primary_key=True),
    sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id'), nullable=False),
    sa.Column('category', sa.String(30), nullable=False),
    sa.Column('severity', sa.String(10), default='info'),
    sa.Column('title', sa.String(200), nullable=False),
    sa.Column('message', sa.Text, nullable=True),
    sa.Column('target_type', sa.String(30), nullable=True),
    sa.Column('target_id', sa.Integer, nullable=True),
    sa.Column('action_type', sa.String(30), nullable=True),
    sa.Column('action_url', sa.String(500), nullable=True),
    sa.Column('action_payload', sa.JSON, nullable=True),
    sa.Column('is_read', sa.Boolean, default=False),
    sa.Column('read_at', sa.DateTime, nullable=True),
    sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
)
op.create_index('ix_notifications_user_read', 'notifications', ['user_id', 'is_read'])
op.create_index('ix_notifications_created', 'notifications', ['created_at'])
```

### 1-2. 알림 생성 서비스

#### [NEW] `backend/services/notification_service.py`

```python
"""알림 생성 & 조회 서비스.

다른 서비스/라우터에서 호출하여 알림을 생성.
중복 방지: 동일 target_type + target_id + category 조합이
24시간 내 존재하면 생성하지 않음.
"""

async def create_notification(
    db: Session,
    user_id: int,
    category: str,
    severity: str,
    title: str,
    message: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    action_type: str = 'navigate',
    action_url: str | None = None,
    action_payload: dict | None = None,
) -> Notification:
    """알림 생성 (중복 방지 포함)."""
    # 24시간 내 동일 알림 체크
    existing = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.target_type == target_type,
        Notification.target_id == target_id,
        Notification.category == category,
        Notification.created_at >= datetime.now() - timedelta(hours=24),
    ).first()
    if existing:
        return existing

    notification = Notification(
        user_id=user_id,
        category=category,
        severity=severity,
        title=title,
        message=message,
        target_type=target_type,
        target_id=target_id,
        action_type=action_type,
        action_url=action_url,
        action_payload=action_payload,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


async def get_unread_count(db: Session, user_id: int) -> int:
    """읽지 않은 알림 수."""
    return db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.is_read == False,
    ).count()


async def get_notifications(
    db: Session,
    user_id: int,
    category: str | None = None,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[Notification]:
    """알림 목록 조회."""
    query = db.query(Notification).filter(Notification.user_id == user_id)
    if category:
        query = query.filter(Notification.category == category)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    return query.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()


async def mark_as_read(db: Session, notification_id: int, user_id: int) -> bool:
    """알림 읽음 처리."""
    ...

async def mark_all_as_read(db: Session, user_id: int) -> int:
    """전체 읽음 처리. Returns: 처리된 알림 수."""
    ...

async def cleanup_old_notifications(db: Session, days: int = 90) -> int:
    """90일 이상 된 읽은 알림 삭제."""
    ...
```

### 1-3. 알림 API

#### [NEW] `backend/routers/notifications.py`

```python
@router.get("/notifications")
async def list_notifications(
    category: str | None = None,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 사용자의 알림 목록."""
    notifications = await get_notifications(db, current_user.id, category, unread_only, limit, offset)
    unread_count = await get_unread_count(db, current_user.id)
    return {
        "notifications": notifications,
        "unread_count": unread_count,
    }

@router.get("/notifications/unread-count")
async def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """읽지 않은 알림 수 (헤더 뱃지용)."""
    return { "count": await get_unread_count(db, current_user.id) }

@router.patch("/notifications/{notification_id}/read")
async def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """알림 읽음 처리."""
    await mark_as_read(db, notification_id, current_user.id)
    return { "success": True }

@router.patch("/notifications/read-all")
async def read_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전체 읽음 처리."""
    count = await mark_all_as_read(db, current_user.id)
    return { "marked_count": count }
```

---

## Part 2. 알림 트리거 (이벤트별 알림 생성)

### 2-1. 정기 스캔 서비스

#### [NEW] `backend/services/notification_scanner.py`

```python
"""정기 스캔으로 알림 생성.

매일 오전 9시 실행 (스케줄러 연동).
각 도메인별 마감/경고 조건을 스캔하여 알림 생성.
"""

async def scan_task_deadlines(db: Session) -> int:
    """태스크 마감 임박/경과 스캔.

    조건:
    - D-1 이내 마감 (severity: warning)
    - 마감 경과 (severity: urgent)
    - 완료되지 않은 태스크만

    알림 생성:
    - title: "태스크 마감 {D-day}: {task_title}"
    - action_url: "/tasks"
    - target_type: "task", target_id: task.id
    """
    ...

async def scan_compliance_deadlines(db: Session) -> int:
    """컴플라이언스 의무사항 마감 임박 스캔.

    조건:
    - D-7 이내 마감 (severity: info)
    - D-3 이내 마감 (severity: warning)
    - 마감 경과 (severity: urgent)

    알림 생성:
    - title: "의무사항 마감 {D-day}: {obligation_name}"
    - action_url: "/compliance"
    """
    ...

async def scan_capital_call_deadlines(db: Session) -> int:
    """자본금 콜 납입 마감 임박 스캔.

    조건:
    - D-5 이내 미납 LP 존재 (severity: warning)
    - 마감 경과 미납 (severity: urgent)

    알림 생성:
    - title: "{fund_name} 콜 납입 마감 {D-day} ({unpaid_count}건 미납)"
    - action_url: "/funds/{fund_id}/capital-calls"
    """
    ...

async def scan_document_expiry(db: Session) -> int:
    """서류 만료 임박 스캔.

    조건:
    - D-30 이내 만료 (severity: info)
    - D-7 이내 만료 (severity: warning)
    - 만료됨 (severity: urgent)
    """
    ...

async def scan_pending_approvals(db: Session) -> int:
    """승인 대기 항목 스캔.

    대상:
    - JournalEntry (status='미결재')
    - Distribution (status='draft')
    - ManagementFee (status='calculated')

    알림 생성:
    - title: "승인 대기: {type} {count}건"
    - action_url: 각 도메인 페이지
    """
    ...

async def run_all_scans(db: Session) -> dict:
    """전체 스캔 실행.

    Returns: {
      task_alerts: int,
      compliance_alerts: int,
      capital_call_alerts: int,
      document_alerts: int,
      approval_alerts: int,
      total: int,
    }
    """
    results = {}
    results['task_alerts'] = await scan_task_deadlines(db)
    results['compliance_alerts'] = await scan_compliance_deadlines(db)
    results['capital_call_alerts'] = await scan_capital_call_deadlines(db)
    results['document_alerts'] = await scan_document_expiry(db)
    results['approval_alerts'] = await scan_pending_approvals(db)
    results['total'] = sum(results.values())
    return results
```

### 2-2. 스케줄러 등록

#### [MODIFY] `backend/services/scheduler.py`

```python
# 매일 오전 9시 알림 스캔
scheduler.add_job(
    run_all_scans,
    trigger='cron',
    hour=9,
    minute=0,
    args=[get_db_session()],
    id='daily_notification_scan',
)

# 매일 자정 오래된 알림 정리
scheduler.add_job(
    cleanup_old_notifications,
    trigger='cron',
    hour=0,
    minute=0,
    args=[get_db_session(), 90],
    id='notification_cleanup',
)
```

### 2-3. 이벤트 기반 알림 (즉시)

기존 라우터에서 특정 이벤트 발생 시 즉시 알림 생성:

#### [MODIFY] `backend/routers/workflows.py`

```python
# 워크플로우 단계 완료 시
await create_notification(
    db, user_id=current_user.id,
    category='workflow',
    severity='info',
    title=f'워크플로우 단계 완료: {step_instance.name}',
    message=f'{workflow_instance.name}의 다음 단계를 진행해주세요.',
    target_type='workflow_instance',
    target_id=workflow_instance.id,
    action_url=f'/workflows?instanceId={workflow_instance.id}',
)
```

#### [MODIFY] `backend/routers/exits.py`

```python
# 엑시트 정산 완료 시
await create_notification(
    db, user_id=current_user.id,
    category='approval',
    severity='info',
    title=f'엑시트 정산 완료: {exit_trade.company_name}',
    message='배분 초안이 생성되었습니다. 검토해주세요.',
    target_type='distribution',
    target_id=distribution_id,
    action_url=f'/funds/{exit_trade.fund_id}/distributions',
)
```

---

## Part 3. 프론트엔드: 알림 센터

### 3-1. 알림 API 연동

#### [MODIFY] `frontend/src/lib/api.ts` (또는 분리된 api/notifications.ts)

```typescript
export async function getNotifications(params?: {
  category?: string;
  unread_only?: boolean;
  limit?: number;
  offset?: number;
}) {
  const { data } = await client.get('/api/notifications', { params });
  return data;
}

export async function getUnreadCount() {
  const { data } = await client.get('/api/notifications/unread-count');
  return data.count;
}

export async function markNotificationRead(id: number) {
  await client.patch(`/api/notifications/${id}/read`);
}

export async function markAllNotificationsRead() {
  await client.patch('/api/notifications/read-all');
}
```

### 3-2. 헤더 알림 벨 아이콘

#### [MODIFY] `frontend/src/components/Layout.tsx`

헤더 우측에 알림 벨 아이콘 + 읽지 않은 수 뱃지:

```typescript
import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

function NotificationBell() {
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,  // 1분마다 폴링
  });

  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="icon-btn relative"
        onClick={() => setPanelOpen(!panelOpen)}
        aria-label={`알림 ${unreadCount}건`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {panelOpen && (
        <NotificationPanel onClose={() => setPanelOpen(false)} />
      )}
    </div>
  );
}
```

### 3-3. 알림 패널 (드롭다운)

#### [NEW] `frontend/src/components/NotificationPanel.tsx`

```typescript
/**
 * 헤더 벨 클릭 시 표시되는 알림 드롭다운 패널.
 *
 * 구성:
 * - 상단: 카테고리 탭 (전체 | 업무 | 승인 | 마감)
 * - 중앙: 알림 목록 (스크롤, 최대 50건)
 * - 하단: "전체 읽음" 버튼
 *
 * 각 알림 항목:
 * ┌─────────────────────────────────────────────┐
 * │ 🔴 태스크 마감 D-1: 투심위 자료 준비          │
 * │    2026-03-01 09:00                          │
 * │    [바로가기]                                 │
 * └─────────────────────────────────────────────┘
 *
 * severity별 아이콘:
 * - urgent: 빨간 점 (●)
 * - warning: 주황 점 (●)
 * - info: 파란 점 (●)
 *
 * 읽은 알림: 배경 투명, 읽지 않은 알림: 배경 하이라이트
 */

interface NotificationPanelProps {
  onClose: () => void;
}

export default function NotificationPanel({ onClose }: NotificationPanelProps) {
  const [activeTab, setActiveTab] = useState<string>('all');

  const { data } = useQuery({
    queryKey: ['notifications', activeTab],
    queryFn: () => getNotifications({
      category: activeTab === 'all' ? undefined : activeTab,
      limit: 50,
    }),
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const tabs = [
    { key: 'all', label: '전체' },
    { key: 'task', label: '업무' },
    { key: 'approval', label: '승인' },
    { key: 'compliance', label: '마감' },
  ];

  return (
    <div className="absolute right-0 top-full mt-2 w-96 card-base shadow-xl z-50 max-h-[480px] flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)]">
        <span className="font-semibold text-sm">알림</span>
        <button
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          onClick={() => markAllMutation.mutate()}
        >
          전체 읽음
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 px-4 py-2 border-b border-[var(--border-default)]">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`text-xs px-2 py-1 rounded ${
              activeTab === tab.key
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)]'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 알림 목록 */}
      <div className="flex-1 overflow-y-auto">
        {data?.notifications?.map(notification => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onClose={onClose}
          />
        ))}
        {data?.notifications?.length === 0 && (
          <div className="py-12 text-center text-[var(--text-tertiary)] text-sm">
            알림이 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
```

### 3-4. 알림 아이템 컴포넌트

#### [NEW] `frontend/src/components/NotificationItem.tsx`

```typescript
/**
 * 개별 알림 항목.
 *
 * 클릭 시:
 * 1. 읽음 처리 (markNotificationRead)
 * 2. action_url로 네비게이션 (navigate)
 * 3. 패널 닫기 (onClose)
 */

const SEVERITY_COLORS = {
  urgent: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

const CATEGORY_ICONS = {
  task: ListTodo,
  workflow: GitBranch,
  compliance: ShieldCheck,
  capital: Banknote,
  document: FileText,
  approval: CheckCircle,
  system: Info,
};

export default function NotificationItem({
  notification,
  onClose,
}: {
  notification: Notification;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const markReadMutation = useMutation({
    mutationFn: () => markNotificationRead(notification.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleClick = () => {
    if (!notification.is_read) {
      markReadMutation.mutate();
    }
    if (notification.action_url) {
      navigate(notification.action_url);
    }
    onClose();
  };

  const Icon = CATEGORY_ICONS[notification.category] || Info;
  const timeAgo = formatRelativeTime(notification.created_at);

  return (
    <button
      className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-[var(--bg-hover)] transition-colors ${
        !notification.is_read ? 'bg-[var(--bg-active)]/30' : ''
      }`}
      onClick={handleClick}
    >
      {/* severity 점 */}
      <div className="mt-1.5 flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${
          notification.is_read ? 'bg-transparent' : SEVERITY_COLORS[notification.severity]
        }`} />
      </div>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon size={14} className="text-[var(--text-secondary)]" />
          <span className="text-sm font-medium truncate">{notification.title}</span>
        </div>
        {notification.message && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{notification.message}</p>
        )}
        <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block">{timeAgo}</span>
      </div>
    </button>
  );
}
```

---

## Part 4. 대시보드 고도화

### 4-1. 모닝 브리핑 알림 통합

#### [MODIFY] `frontend/src/pages/DashboardPage.tsx`

Phase 62에서 개선한 모닝 브리핑 뷰에 알림 요약 카드 추가:

```
┌─ 오늘의 브리핑 ─────────────────────────────────────────┐
│                                                          │
│ ⚠ 긴급 알림 3건                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 🔴 투심위 자료 준비 (D-1)                [바로가기]  │ │
│ │ 🔴 1호 펀드 콜 미납 2건                  [바로가기]  │ │
│ │ 🟡 사업보고서 제출 마감 (D-3)            [바로가기]  │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│ │ 오늘     │ │ 승인     │ │ 마감     │ │ 서류     │       │
│ │ 태스크   │ │ 대기     │ │ 임박     │ │ 만료     │       │
│ │   5건    │ │   3건    │ │   2건    │ │   1건    │       │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│                                                          │
│ 예상 작업시간: 약 4시간                                   │
└──────────────────────────────────────────────────────────┘
```

### 4-2. 정기업무 예고 (주간 캘린더 미리보기)

대시보드에 이번 주 주요 일정 타임라인 추가:

```
┌─ 이번 주 주요 일정 ──────────────────────────────────────┐
│                                                          │
│ 월  화  수  목  금                                        │
│  │   │   │   │   │                                       │
│  │   │   ●   │   │  수: 투심위 (14:00)                   │
│  │   │   │   │   │                                       │
│  │   │   │   ●   │  목: 1Q 사업보고서 마감               │
│  │   │   │   │   │                                       │
│  │   │   │   │   ●  금: 관리보수 청구                    │
│                                                          │
│ 다음 주 예고: 2호 펀드 콜 납입 마감 (3/10)                │
└──────────────────────────────────────────────────────────┘
```

구현: 기존 CalendarEvent API + 태스크 마감일 + 컴플라이언스 마감일 조합.

```typescript
// 이번 주 이벤트 조회 훅
function useWeeklyPreview() {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  const { data: events } = useQuery({
    queryKey: ['calendar', 'weekly-preview'],
    queryFn: () => getCalendarEvents({
      start_date: format(weekStart, 'yyyy-MM-dd'),
      end_date: format(weekEnd, 'yyyy-MM-dd'),
    }),
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'weekly-due'],
    queryFn: () => getTasks({
      due_before: format(weekEnd, 'yyyy-MM-dd'),
      status: 'in_progress,todo',
    }),
  });

  // 통합 + 날짜별 그룹핑
  return mergeAndGroupByDate(events, tasks, weekStart, weekEnd);
}
```

### 4-3. 원클릭 액션 카드

대시보드에 "빠른 처리" 섹션 추가:

```
┌─ 빠른 처리 ──────────────────────────────────────────────┐
│                                                          │
│ 승인 대기 (3건)                                          │
│ ┌────────────────────────────┐ ┌──────────────────────┐ │
│ │ 분개 미결재 2건             │ │ 배분 초안 1건         │ │
│ │ 총액: ₩15,000,000         │ │ 1호 펀드 엑시트 배분  │ │
│ │ [일괄 결재]  [상세보기]    │ │ [검토]  [상세보기]    │ │
│ └────────────────────────────┘ └──────────────────────┘ │
│                                                          │
│ 미처리 서류 (4건)                                        │
│ ┌────────────────────────────┐                           │
│ │ BizReport 서류 미수신 4건   │                           │
│ │ A사(2), B사(1), C사(1)     │                           │
│ │ [발송 요청]  [상세보기]     │                           │
│ └────────────────────────────┘                           │
└──────────────────────────────────────────────────────────┘
```

구현: 각 도메인별 "pending" 항목을 집계하는 API 호출.

```typescript
// 빠른 처리 항목 조회
function useQuickActions() {
  const { data: pendingJournals } = useQuery({
    queryKey: ['journals', 'pending'],
    queryFn: () => getJournalEntries({ status: '미결재' }),
  });

  const { data: draftDistributions } = useQuery({
    queryKey: ['distributions', 'draft'],
    queryFn: () => getDistributions({ status: 'draft' }),
  });

  const { data: pendingDocs } = useQuery({
    queryKey: ['biz-report-docs', 'pending'],
    queryFn: () => getBizReportDocStatus({ status: '미수신' }),
  });

  return { pendingJournals, draftDistributions, pendingDocs };
}
```

### 4-4. 대시보드 API (통합 요약)

#### [NEW] `backend/routers/dashboard_summary.py`

```python
@router.get("/dashboard/summary")
async def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대시보드 통합 요약 API.

    한 번의 API 호출로 대시보드에 필요한 모든 데이터 조회.
    개별 API 다중 호출을 줄여 초기 로딩 성능 개선.

    Returns: {
      urgent_notifications: list,     # 긴급 알림 (severity='urgent')
      today_tasks: { total, completed, in_progress },
      pending_approvals: { journals, distributions, fees },
      deadlines_this_week: list,
      weekly_events: list,
      fund_overview: { active_funds, total_aum, next_call },
    }
    """
    ...
```

---

## Part 5. 유틸리티: 상대 시간 포맷

#### [NEW] `frontend/src/lib/formatRelativeTime.ts`

```typescript
/**
 * 상대 시간 포맷 ("방금 전", "5분 전", "2시간 전", "어제", "3일 전", "2026.02.28")
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;

  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '.').replace('.', '');
}
```

---

## 검증 체크리스트

- [ ] Notification 모델 & 마이그레이션 적용
- [ ] 알림 CRUD API: 생성, 조회, 읽음 처리, 전체 읽음
- [ ] 알림 스캐너: 태스크/컴플라이언스/콜/서류/승인 각 스캔 동작
- [ ] 스케줄러: 매일 9시 스캔 + 자정 정리 등록
- [ ] 이벤트 기반 알림: 워크플로우 단계 완료, 엑시트 정산 시 즉시 생성
- [ ] 중복 방지: 24시간 내 동일 알림 미생성 확인
- [ ] 프론트엔드: 헤더 벨 아이콘 + 읽지 않은 수 뱃지 (1분 폴링)
- [ ] 프론트엔드: 알림 패널 드롭다운 (탭, 목록, 전체 읽음)
- [ ] 프론트엔드: 알림 클릭 → 읽음 처리 + 해당 페이지 이동
- [ ] 대시보드: 긴급 알림 카드, 주간 타임라인, 빠른 처리 섹션
- [ ] 대시보드: 통합 요약 API로 초기 로딩 최적화
- [ ] git commit: `feat: Phase 70 notification system and dashboard enhancement`
