import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  KanbanSquare,
  GitBranch,
  BookOpen,
  Building2,
  PieChart,
  ListTree,
  LineChart,
  Landmark,
  TrendingDown,
  CheckSquare,
  Files,
  CalendarDays,
  Menu,
  Search,
  X,
} from 'lucide-react'

import SearchModal from './SearchModal'

const NAV = [
  { to: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { to: '/tasks', label: '업무 보드', icon: KanbanSquare },
  { to: '/workflows', label: '워크플로우', icon: GitBranch },
  { to: '/worklogs', label: '업무 기록', icon: BookOpen },
  { to: '/funds', label: '조합 관리', icon: Building2 },
  { to: '/investments', label: '투자 관리', icon: PieChart },
  { to: '/transactions', label: '거래원장', icon: ListTree },
  { to: '/valuations', label: '가치평가', icon: LineChart },
  { to: '/fund-operations', label: '조합 운영', icon: Landmark },
  { to: '/exits', label: '회수 관리', icon: TrendingDown },
  { to: '/checklists', label: '체크리스트', icon: CheckSquare },
  { to: '/documents', label: '서류 현황', icon: Files },
  { to: '/calendar', label: '캘린더', icon: CalendarDays },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

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
    <div className="flex h-screen">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-56 bg-slate-900 text-white
          flex shrink-0 flex-col transform transition-transform duration-200
          md:relative md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">VC ERP</h1>
            <p className="mt-0.5 text-xs text-slate-400">Trigger Investment Partners</p>
          </div>
          <button className="text-slate-400 hover:text-white md:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-auto py-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-slate-700/60 font-medium text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center">
            <button onClick={() => setSidebarOpen(true)} className="text-slate-700 md:hidden">
              <Menu size={22} />
            </button>
            <span className="ml-3 font-semibold text-slate-800">VC ERP</span>
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            <Search size={14} />
            <span>검색</span>
            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Ctrl+K</kbd>
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
