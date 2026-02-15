import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  KanbanSquare,
  BookOpen,
  CheckSquare,
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
  Menu,
  Search,
  X,
} from 'lucide-react'

import SearchModal from './SearchModal'

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
      { to: '/checklists', label: '체크리스트', icon: CheckSquare },
    ],
  },
  {
    label: '조합·투자',
    items: [
      { to: '/fund-overview', label: '조합 개요', icon: BarChart3 },
      { to: '/funds', label: '조합 관리', icon: Building2 },
      { to: '/investments', label: '투자 관리', icon: PieChart },
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
    ],
  },
  {
    label: '관리',
    items: [
      { to: '/biz-reports', label: '영업보고', icon: FileText },
      { to: '/reports', label: '보고공시', icon: Send },
      { to: '/fund-operations', label: '조합 운영', icon: Landmark },
      { to: '/documents', label: '서류 현황', icon: Files },
    ],
  },
]

const MOBILE_GROUPS: Array<{ label: string; items: Array<{ to: string; label: string }> }> = [
  {
    label: '대시보드',
    items: [{ to: DASHBOARD_GROUP.to, label: DASHBOARD_GROUP.label }],
  },
  ...DROPDOWN_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({ to: item.to, label: item.label })),
  })),
]

function isPathActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

export default function Layout() {
  const location = useLocation()
  const navRef = useRef<HTMLDivElement | null>(null)

  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const activeDropdownGroup = useMemo(
    () =>
      DROPDOWN_GROUPS.find((group) =>
        group.items.some((item) => isPathActive(location.pathname, item.to)),
      )?.label ?? null,
    [location.pathname],
  )

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
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    setOpenDropdown(null)
    setMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!openDropdown) return
      if (navRef.current && event.target instanceof Node && !navRef.current.contains(event.target)) {
        setOpenDropdown(null)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [openDropdown])

  return (
    <div className="flex h-screen flex-col bg-[#fafafa]">
      <nav className="h-14 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-full w-full items-center justify-between px-4 sm:px-6" ref={navRef}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100 md:hidden"
              aria-label="메뉴 열기"
            >
              <Menu size={20} />
            </button>
            <Link to="/dashboard" className="text-lg font-semibold text-gray-900">
              VC ERP
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

            {DROPDOWN_GROUPS.map((group) => {
              const isOpen = openDropdown === group.label
              const isActive = activeDropdownGroup === group.label

              return (
                <div key={group.label} className="relative">
                  <button
                    onClick={() => setOpenDropdown((prev) => (prev === group.label ? null : group.label))}
                    className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                      isActive ? 'font-medium text-blue-600' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {group.label}
                  </button>

                  <div
                    className={`absolute left-0 top-full z-40 mt-2 min-w-[200px] rounded-xl border border-gray-200 bg-white shadow-lg transition-all duration-150 ${
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
                              active
                                ? 'bg-blue-50 text-blue-600'
                                : 'text-gray-700 hover:bg-gray-50'
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

          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Search size={14} />
            <span className="hidden sm:inline">검색</span>
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">Ctrl+Space</kbd>
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute inset-0 overflow-auto bg-white px-6 pb-8 pt-5">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-lg font-semibold text-gray-900">VC ERP</p>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label="메뉴 닫기"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              {MOBILE_GROUPS.map((group) => (
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
                            active
                              ? 'bg-blue-50 font-medium text-blue-600'
                              : 'text-gray-700 hover:bg-gray-50'
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
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

