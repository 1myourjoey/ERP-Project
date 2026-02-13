import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  KanbanSquare,
  GitBranch,
  BookOpen,
  Building2,
  PieChart,
  FileText,
  ListTree,
  LineChart,
  Landmark,
  Calculator,
  TrendingDown,
  Send,
  CheckSquare,
  Files,
  Menu,
  Search,
  X,
} from 'lucide-react'

import SearchModal from './SearchModal'

type NavGroup = {
  label: string | null
  items: Array<{ to: string; label: string; icon: ComponentType<{ size?: number; className?: string }> }>
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { to: '/dashboard', label: '대시보드', icon: LayoutDashboard },
    ],
  },
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
      { to: '/funds', label: '조합 관리', icon: Building2 },
      { to: '/investments', label: '투자 관리', icon: PieChart },
      { to: '/workflows', label: '워크플로우', icon: GitBranch },
    ],
  },
  {
    label: '재무·거래',
    items: [
      { to: '/transactions', label: '거래원장', icon: ListTree },
      { to: '/valuations', label: '가치평가', icon: LineChart },
      { to: '/accounting', label: '회계 관리', icon: Calculator },
    ],
  },
  {
    label: '보고·관리',
    items: [
      { to: '/biz-reports', label: '영업보고', icon: FileText },
      { to: '/reports', label: '보고공시', icon: Send },
      { to: '/fund-operations', label: '조합 운영', icon: Landmark },
      { to: '/exits', label: '회수 관리', icon: TrendingDown },
    ],
  },
  {
    label: '도구',
    items: [
      { to: '/checklists', label: '체크리스트', icon: CheckSquare },
      { to: '/documents', label: '서류 현황', icon: Files },
    ],
  },
]

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

export default function Layout() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const pageTitle = useMemo(() => {
    const pathname = location.pathname
    const matched = NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    return matched?.label || 'VC ERP'
  }, [location.pathname])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSearchShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
      if (isSearchShortcut) {
        event.preventDefault()
        setSearchOpen(true)
      } else if (event.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-screen bg-[#fafafa]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200
          flex shrink-0 flex-col transform transition-transform duration-200
          md:relative md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">VC ERP</h1>
            <p className="mt-1 text-xs text-gray-400">Trigger Investment Partners</p>
          </div>
          <button className="text-gray-400 hover:text-gray-700 md:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-auto py-4">
          {NAV_GROUPS.map((group, groupIdx) => (
            <div key={`${group.label || 'root'}-${groupIdx}`}>
              {group.label && (
                <p className="px-5 mb-1 text-[11px] font-medium text-gray-400 uppercase tracking-wider">{group.label}</p>
              )}
              <div className="space-y-1 px-2">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-2 text-sm transition-all ${
                        isActive
                          ? 'border-blue-500 bg-blue-50 text-blue-600 font-medium'
                          : 'border-transparent text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={17} className={isActive ? 'text-blue-500' : 'text-gray-400'} />
                        <span>{label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
              {groupIdx < NAV_GROUPS.length - 1 && <div className="h-px bg-gray-100 mx-4 my-3" />}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <div className="flex items-center min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-700 md:hidden">
              <Menu size={22} />
            </button>
            <div className="ml-3 md:ml-0">
              <p className="text-xs text-gray-400">현재 페이지</p>
              <p className="text-sm text-gray-500 truncate">{pageTitle}</p>
            </div>
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Search size={14} />
            <span>검색</span>
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">Ctrl+K</kbd>
          </button>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}


