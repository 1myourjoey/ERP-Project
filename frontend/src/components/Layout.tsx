import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  KanbanSquare,
  GitBranch,
  BookOpen,
  Building2,
  PieChart,
  CheckSquare,
  Files,
  CalendarDays,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'Task Board', icon: KanbanSquare },
  { to: '/workflows', label: 'Workflows', icon: GitBranch },
  { to: '/worklogs', label: 'Work Logs', icon: BookOpen },
  { to: '/funds', label: 'Funds', icon: Building2 },
  { to: '/investments', label: 'Investments', icon: PieChart },
  { to: '/checklists', label: 'Checklists', icon: CheckSquare },
  { to: '/documents', label: 'Documents', icon: Files },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
]

export default function Layout() {
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-700">
          <h1 className="text-lg font-bold tracking-tight">VC ERP</h1>
          <p className="text-xs text-slate-400 mt-0.5">Trigger Investment Partners</p>
        </div>
        <nav className="flex-1 py-3 overflow-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-slate-700/60 text-white font-medium'
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

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
