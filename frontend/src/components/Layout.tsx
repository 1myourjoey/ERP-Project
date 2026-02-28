import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  KanbanSquare,
  ClipboardCheck,
  BookOpen,
  BarChart3,
  Building2,
  PieChart,
  GitBranch,
  TrendingDown,
  ListTree,
  LineChart,
  Calculator,
  FileText,
  Send,
  Landmark,
  Files,
  FileCode2,
  FileSpreadsheet,
  ShieldAlert,
  Users,
  Menu,
  Search,
  X,
} from 'lucide-react'

import SearchModal from './SearchModal'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'

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

const DROPDOWN_GROUPS: DropdownGroup[] = [
  {
    label: '업무',
    items: [
      { to: '/tasks', label: '업무 보드', icon: KanbanSquare },
      { to: '/worklogs', label: '업무 기록', icon: BookOpen },
    ],
  },
  {
    label: '조합·투자',
    items: [
      { to: '/fund-overview', label: '조합 개요', icon: BarChart3 },
      { to: '/funds', label: '조합 관리', icon: Building2 },
      { to: '/investments', label: '투자 관리', icon: PieChart },
      { to: '/investment-reviews', label: '투자 심의', icon: ClipboardCheck },
      { to: '/workflows', label: '워크플로우', icon: GitBranch },
      { to: '/exits', label: '회수 관리', icon: TrendingDown },
    ],
  },
  {
    label: '재무',
    items: [
      { to: '/transactions', label: '거래원장', icon: ListTree },
      { to: '/valuations', label: '가치평가', icon: LineChart },
      { to: '/accounting', label: '회계 관리', icon: Calculator },
      { to: '/fee-management', label: '보수 관리', icon: Landmark },
    ],
  },
  {
    label: '관리',
    items: [
      { to: '/lp-management', label: 'LP 관리', icon: Building2 },
      { to: '/users', label: '사용자 관리', icon: Users },
      { to: '/compliance', label: '컴플라이언스', icon: ShieldAlert },
      { to: '/biz-reports', label: '영업보고', icon: FileText },
      { to: '/vics', label: 'VICS 월보고', icon: FileSpreadsheet },
      { to: '/internal-reviews', label: '내부보고회', icon: ClipboardCheck },
      { to: '/reports', label: '보고공시', icon: Send },
      { to: '/fund-operations', label: '조합 운영', icon: Landmark },
      { to: '/documents', label: '서류 현황', icon: Files },
      { to: '/templates', label: '템플릿 관리', icon: FileCode2 },
    ],
  },
]

const ShaderBackground = lazy(() => import('./ShaderBackground'))

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
  const { theme, setTheme, themes } = useTheme()
  const { user, hasAccess, logout } = useAuth()

  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

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

  const currentThemeIndex = useMemo(
    () => Math.max(0, themes.findIndex((item) => item.key === theme)),
    [theme, themes],
  )
  const currentTheme = themes[currentThemeIndex]
  const nextTheme = themes[(currentThemeIndex + 1) % themes.length]

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
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!openDropdown && !userMenuOpen) return
      if (navRef.current && event.target instanceof Node && !navRef.current.contains(event.target)) {
        setOpenDropdown(null)
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [openDropdown, userMenuOpen])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative flex h-screen flex-col">
      <Suspense fallback={null}>
        <ShaderBackground />
      </Suspense>

      <nav className="relative z-20 h-14 border-b border-white/20 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-full w-full items-center justify-between px-4 sm:px-6" ref={navRef}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100 md:hidden"
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
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-sm transition-colors ${
                  isActive ? 'font-medium text-blue-600' : 'text-gray-700 hover:bg-gray-50'
                }`
              }
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
                      setOpenDropdown((prev) => (prev === group.label ? null : group.label))
                    }}
                    className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                      isActive ? 'font-medium text-blue-600' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {group.label}
                  </button>

                  <div
                    className={`absolute left-0 top-full z-40 mt-2 min-w-[200px] rounded-xl border border-white/30 bg-white/85 shadow-lg backdrop-blur-xl transition-all duration-150 ${
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
                              active ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <Icon size={16} />
                            <span>{label}</span>
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
            <button
              onClick={() => setTheme(nextTheme.key)}
              className="rounded-lg p-1.5 text-sm text-gray-600 hover:bg-gray-100"
              title={`Theme: ${currentTheme.label} -> ${nextTheme.label}`}
              aria-label={`Change theme from ${currentTheme.label} to ${nextTheme.label}`}
            >
              {currentTheme.icon}
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              <Search size={14} />
              <span className="hidden sm:inline">Search</span>
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">Ctrl+Space</kbd>
            </button>
            <div className="relative">
              <button
                onClick={() => {
                  setOpenDropdown(null)
                  setUserMenuOpen((prev) => !prev)
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-700">
                    {userInitials(user?.name)}
                  </span>
                )}
                <span className="hidden sm:inline">{user?.name || '사용자'}</span>
              </button>
              <div
                className={`absolute right-0 top-full z-40 mt-2 w-52 rounded-xl border border-white/30 bg-white/90 p-1.5 shadow-lg backdrop-blur-xl transition-all duration-150 ${
                  userMenuOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
                }`}
              >
                <div className="mb-1 rounded-lg bg-gray-50 px-2.5 py-2">
                  <p className="text-xs font-semibold text-gray-800">{user?.name}</p>
                  <p className="text-[11px] text-gray-500">
                    {user?.username} · {user?.role}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    navigate('/profile')
                  }}
                  className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
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
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label="메뉴 닫기"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              {mobileGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">{group.label}</p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = isPathActive(location.pathname, item.to)
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`block rounded-xl px-3 py-2.5 text-sm ${
                            active ? 'bg-blue-50 font-medium text-blue-600' : 'text-gray-700 hover:bg-gray-50'
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

            <div className="mt-6 border-t border-gray-200 pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Theme</p>
              <div className="grid grid-cols-2 gap-2">
                {themes.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setTheme(item.key)}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      theme === item.key
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-700">{user?.name}</p>
                <p className="text-[11px] text-gray-500">{user?.username}</p>
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
                    className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                  >
                    로그아웃
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="relative z-10 flex-1 overflow-auto">
        <Outlet />
      </main>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
