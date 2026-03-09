import { Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell,
  BookOpen,
  BarChart3,
  Building2,
  Calculator,
  CalendarDays,
  Files,
  GitBranch,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  LineChart,
  Menu,
  PieChart,
  Search,
  ShieldAlert,
  TrendingDown,
  UserCog,
  Users,
  X,
} from 'lucide-react'

import SearchModal from './SearchModal'
import NotificationPanel from './NotificationPanel'
import { ErrorBoundary } from './ErrorBoundary'
import { PageSkeleton } from './ui/PageSkeleton'
import { useAuth } from '../contexts/AuthContext'
import { getUnreadCount } from '../lib/api/notifications'
import { queryKeys } from '../lib/queryKeys'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
}

type DashboardGroup = {
  label: string
  to: string
  icon: ComponentType<{ size?: number; className?: string }>
}

type DropdownGroup = {
  label: string
  items: NavItem[]
}

const DASHBOARD_GROUP: DashboardGroup = {
  label: '대시보드',
  to: '/dashboard',
  icon: LayoutDashboard,
}

const ROLE_LABEL: Record<string, string> = {
  admin: '관리자',
  manager: '매니저',
  viewer: '열람자',
  analyst: '분석가',
}

const DROPDOWN_GROUPS: DropdownGroup[] = [
  {
    label: '업무',
    items: [
      { to: '/tasks', label: '태스크', icon: KanbanSquare },
      { to: '/workflows', label: '워크플로우', icon: GitBranch },
      { to: '/worklogs', label: '업무일지', icon: BookOpen },
      { to: '/calendar', label: '캘린더', icon: CalendarDays },
    ],
  },
  {
    label: '펀드',
    items: [
      { to: '/funds', label: '펀드', icon: Building2 },
      { to: '/fund-overview', label: '투자개요', icon: BarChart3 },
      { to: '/investments', label: '투자', icon: PieChart },
      { to: '/exits', label: '엑시트', icon: TrendingDown },
    ],
  },
  {
    label: '재무',
    items: [
      { to: '/accounting', label: '회계', icon: Calculator },
      { to: '/fee-management', label: '수수료', icon: Landmark },
      { to: '/cashflow', label: '현금흐름', icon: LineChart },
      { to: '/provisional-fs', label: '가결산', icon: BarChart3 },
    ],
  },
  {
    label: '보고',
    items: [
      { to: '/compliance', label: '컴플라이언스', icon: ShieldAlert },
      { to: '/biz-reports', label: '사업보고서', icon: BarChart3 },
    ],
  },
  {
    label: '관리',
    items: [
      { to: '/lp-management', label: 'LP 관리', icon: Users },
      { to: '/proposal-data', label: '제안서 데이터 관리', icon: Files },
      { to: '/documents', label: '문서', icon: Files },
      { to: '/data-studio', label: '데이터 스튜디오', icon: BarChart3 },
      { to: '/users', label: '사용자', icon: UserCog },
    ],
  },
]

function isPathActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

function userInitials(name: string | null | undefined): string {
  const normalized = (name || '').trim()
  if (!normalized) return 'U'
  const parts = normalized.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase()
}

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const navRef = useRef<HTMLDivElement | null>(null)
  const { user, hasAccess, logout } = useAuth()

  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)

  const visibleDropdownGroups = useMemo(
    () =>
      DROPDOWN_GROUPS
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => hasAccess(item.to)),
        }))
        .filter((group) => group.items.length > 0),
    [hasAccess],
  )

  const mobileGroups = useMemo(
    () => [
      {
        label: '대시보드',
        items: [{ to: DASHBOARD_GROUP.to, label: DASHBOARD_GROUP.label }],
      },
      ...visibleDropdownGroups.map((group) => ({
        label: group.label,
        items: group.items.map((item) => ({ to: item.to, label: item.label })),
      })),
    ],
    [visibleDropdownGroups],
  )

  const activeDropdownGroup = useMemo(
    () =>
      visibleDropdownGroups.find((group) =>
        group.items.some((item) => isPathActive(location.pathname, item.to)),
      )?.label ?? null,
    [location.pathname, visibleDropdownGroups],
  )

  const { data: unreadCount = 0 } = useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  })


  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSearchShortcut = (event.ctrlKey || event.metaKey) && event.key === ' '
      if (isSearchShortcut) {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setOpenDropdown(null)
        setMobileMenuOpen(false)
        setUserMenuOpen(false)
        setNotificationPanelOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOpenDropdown(null)
      setMobileMenuOpen(false)
      setUserMenuOpen(false)
      setNotificationPanelOpen(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!openDropdown && !userMenuOpen && !notificationPanelOpen) return
      if (navRef.current && event.target instanceof Node && !navRef.current.contains(event.target)) {
        setOpenDropdown(null)
        setUserMenuOpen(false)
        setNotificationPanelOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [openDropdown, userMenuOpen, notificationPanelOpen])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative flex h-screen flex-col">
      <nav className="app-nav">
        <div className="mx-auto flex h-full w-full items-center justify-between px-4 sm:px-6" ref={navRef}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-1.5 text-[#f5f9ff] hover:bg-[#558ef8]/20 md:hidden"
              aria-label="메뉴 열기"
            >
              <Menu size={20} />
            </button>
            <Link to="/dashboard" className="inline-flex items-center">
              <img src="/logo.svg" alt="V:ON" className="h-7 w-auto" />
            </Link>
          </div>

          <div className="hidden items-center gap-1 md:flex">
            <NavLink
              to={DASHBOARD_GROUP.to}
              className={({ isActive }) => (isActive ? 'app-nav-link active' : 'app-nav-link')}
            >
              {DASHBOARD_GROUP.label}
            </NavLink>

            {visibleDropdownGroups.map((group) => {
              const isOpen = openDropdown === group.label
              const isActive = activeDropdownGroup === group.label

              return (
                <div key={group.label} className="relative">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false)
                      setNotificationPanelOpen(false)
                      setOpenDropdown((prev) => (prev === group.label ? null : group.label))
                    }}
                    className={isActive ? 'app-nav-link active' : 'app-nav-link'}
                  >
                    {group.label}
                  </button>

                  <div
                    className={`app-dropdown absolute left-0 top-full z-40 mt-2 min-w-[200px] transition-all duration-150 ${
                      isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
                    }`}
                  >
                    <div className="py-1.5">
                      {group.items.map(({ to, label, icon: Icon }) => {
                        const active = isPathActive(location.pathname, to)
                        return (
                          <NavLink
                            key={to}
                            to={to}
                            onClick={() => setOpenDropdown(null)}
                            className={`mx-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                              active ? 'bg-[#eef4ff] text-[#0f1f3d]' : 'text-[#0f1f3d] hover:bg-[#f5f9ff]'
                            }`}
                          >
                            <Icon size={16} />
                            <span className="whitespace-nowrap">{label}</span>
                          </NavLink>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                className="icon-btn relative !text-[#f5f9ff] hover:!bg-[#558ef8]/20 hover:!text-white"
                aria-label={`알림 ${unreadCount}건`}
                onClick={() => {
                  setOpenDropdown(null)
                  setUserMenuOpen(false)
                  setNotificationPanelOpen((prev) => !prev)
                }}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notificationPanelOpen && <NotificationPanel onClose={() => setNotificationPanelOpen(false)} />}
            </div>
            <button
              onClick={() => setSearchOpen(true)}
              className="secondary-btn btn-sm gap-2 !border-[#d8e5fb] !bg-[#f5f9ff] !text-[#0f1f3d] hover:!bg-white"
            >
              <Search size={14} />
              <span className="hidden sm:inline">검색</span>
              <kbd className="rounded bg-[#e4e7ee] px-1.5 py-0.5 text-[10px] text-[#586b8d]">Ctrl+Space</kbd>
            </button>
            <div className="relative">
              <button
                onClick={() => {
                  setOpenDropdown(null)
                  setNotificationPanelOpen(false)
                  setUserMenuOpen((prev) => !prev)
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] px-2 py-1.5 text-xs text-[#0f1f3d] hover:bg-white"
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#dce8ff] text-[11px] font-semibold text-[#1a3660]">
                    {userInitials(user?.name)}
                  </span>
                )}
                <span className="hidden sm:inline">{user?.name || '사용자'}</span>
              </button>
              <div
                className={`absolute right-0 top-full z-40 mt-2 w-52 rounded-xl border border-[#d8e5fb] bg-white p-1.5 shadow-lg transition-all duration-150 ${
                  userMenuOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
                }`}
              >
                <div className="mb-1 rounded-lg bg-[#f5f9ff] px-2.5 py-2">
                  <p className="text-xs font-semibold text-[#0f1f3d]">{user?.name}</p>
                  <p className="text-[11px] text-[#64748b]">
                    {user?.username} · {ROLE_LABEL[user?.role || ''] || user?.role}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    setNotificationPanelOpen(false)
                    navigate('/profile')
                  }}
                  className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs text-[#0f1f3d] hover:bg-[#f5f9ff]"
                >
                  내 프로필
                </button>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute inset-0 overflow-auto bg-white px-6 pb-8 pt-5">
            <div className="mb-6 flex items-center justify-between">
              <img src="/logo.svg" alt="V:ON" className="h-6 w-auto" />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1.5 text-[#64748b] hover:bg-[#f5f9ff]"
                aria-label="메뉴 닫기"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              {mobileGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#64748b]">{group.label}</p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = isPathActive(location.pathname, item.to)
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`block rounded-xl px-3 py-2.5 text-sm ${
                            active ? 'bg-[#f5f9ff] font-medium text-[#558ef8]' : 'text-[#0f1f3d] hover:bg-[#f5f9ff]'
                          }`}
                        >
                          {item.label}
                        </NavLink>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-[#d8e5fb] pt-4">
              <div className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
                <p className="text-xs font-semibold text-[#0f1f3d]">{user?.name}</p>
                <p className="text-[11px] text-[#64748b]">{user?.username}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false)
                      navigate('/profile')
                    }}
                    className="secondary-btn text-xs"
                  >
                    내 프로필
                  </button>
                  <button
                    onClick={handleLogout}
                    className="danger-btn"
                  >
                    로그아웃
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="app-main-scroll relative z-10 flex-1">
        <ErrorBoundary>
          <Suspense fallback={<PageSkeleton type="table" />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}


