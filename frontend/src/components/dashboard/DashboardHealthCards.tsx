import {
  BarChart3,
  Building2,
  FileText,
  FolderOpen,
  ListChecks,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'

import type { DashboardHealthDomain, DashboardHealthResponse } from '../../lib/api'

interface DashboardHealthCardsProps {
  domains: DashboardHealthResponse['domains']
  onNavigate: (path: string) => void
}

type DomainCardConfig = {
  key: keyof DashboardHealthResponse['domains']
  label: string
  path: string
  icon: LucideIcon
}

const DOMAIN_CARDS: DomainCardConfig[] = [
  { key: 'tasks', label: '업무', path: '/tasks', icon: ListChecks },
  { key: 'funds', label: '펀드', path: '/funds', icon: Building2 },
  { key: 'investment_review', label: '투자 심의', path: '/investment-reviews', icon: BarChart3 },
  { key: 'compliance', label: '컴플라이언스', path: '/compliance', icon: ShieldAlert },
  { key: 'reports', label: '보고', path: '/reports', icon: FileText },
  { key: 'documents', label: '서류', path: '/documents', icon: FolderOpen },
]

function scoreWidth(score: number): string {
  const safe = Math.max(0, Math.min(100, score || 0))
  return `${safe}%`
}

function severityBarColor(severity: DashboardHealthDomain['severity']): string {
  if (severity === 'good') return 'bg-[#558ef8]'
  if (severity === 'warning') return 'bg-[#b68a00]'
  return 'bg-[#0f1f3d]'
}

function severityTextColor(severity: DashboardHealthDomain['severity']): string {
  if (severity === 'good') return 'text-[#1a3660]'
  if (severity === 'warning') return 'text-[#624100]'
  return 'text-[#0f1f3d]'
}

export default function DashboardHealthCards({ domains, onNavigate }: DashboardHealthCardsProps) {
  return (
    <section className="grid grid-cols-2 gap-2 lg:grid-cols-6">
      {DOMAIN_CARDS.map(({ key, label, path, icon: Icon }) => {
        const domain = domains[key]
        if (!domain) return null
        return (
          <button
            key={key}
            type="button"
            onClick={() => onNavigate(path)}
            className="card-base h-[100px] p-3 text-left transition duration-200 hover:-translate-y-[2px] hover:border-[#aac6fa] hover:bg-[#f5f9ff] hover:shadow-[0_14px_32px_rgba(15,31,61,0.08)]"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#0f1f3d]">{label}</p>
              <Icon size={14} className="text-[#64748b]" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-[#d8e5fb]">
                <div
                  className={`h-1.5 rounded-full ${severityBarColor(domain.severity)}`}
                  style={{ width: scoreWidth(domain.score) }}
                />
              </div>
              <span className={`text-sm font-semibold ${severityTextColor(domain.severity)}`}>{domain.score}</span>
            </div>
            <p className="mt-2 truncate text-xs text-[#64748b]">{domain.label}</p>
          </button>
        )
      })}
    </section>
  )
}
