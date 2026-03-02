import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  X,
  CheckSquare,
  Building2,
  PieChart,
  GitBranch,
  FileText,
  Send,
  BookOpen,
} from 'lucide-react'

import { searchGlobal, type SearchResult } from '../lib/api'

const TYPE_META: Record<string, { label: string; icon: typeof Search }> = {
  task: { label: '업무', icon: CheckSquare },
  fund: { label: '조합', icon: Building2 },
  company: { label: '회사', icon: Building2 },
  investment: { label: '투자', icon: PieChart },
  workflow: { label: '워크플로우', icon: GitBranch },
  biz_report: { label: '영업보고', icon: FileText },
  report: { label: '보고공시', icon: Send },
  worklog: { label: '업무기록', icon: BookOpen },
}

function groupByType(items: SearchResult[]) {
  const groups: Record<string, SearchResult[]> = {}
  for (const item of items) {
    const key = item.type || 'other'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}

export default function SearchModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<number | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const clearDebounce = () => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }

  const handleClose = () => {
    clearDebounce()
    setQuery('')
    setResults([])
    setLoading(false)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    return () => {
      clearDebounce()
    }
  }, [])

  const onQueryChange = (value: string) => {
    setQuery(value)
    clearDebounce()

    const trimmed = value.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = window.setTimeout(() => {
      searchGlobal(trimmed)
        .then(rows => setResults(rows))
        .finally(() => setLoading(false))
    }, 300)
  }

  const grouped = useMemo(() => groupByType(results), [results])

  if (!open) return null

  return (
    <div className="modal-overlay fixed inset-0 z-[110] bg-black/40 p-4 md:p-10" onClick={handleClose}>
      <div
        className="modal-content mx-auto max-w-2xl bg-white"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-3 py-2">
          <label className="mb-1 block text-[10px] font-medium text-slate-500">통합 검색</label>
          <div className="flex items-center gap-2">
            <Search size={16} className="text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="업무, 워크플로, 펀드 검색..."
              className="w-full bg-transparent text-sm outline-none"
            />
            <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={handleClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto p-2">
          {loading && <p className="p-2 text-sm text-slate-500">검색 중...</p>}
          {!loading && query.trim() && results.length === 0 && (
            <p className="rounded-lg px-3 py-8 text-center text-sm text-slate-500">
              '{query.trim()}'에 대한 검색 결과가 없습니다.
            </p>
          )}
          {!query.trim() && (
            <p className="p-2 text-sm text-slate-500">Ctrl+Space 또는 Cmd+Space로 언제든지 검색할 수 있습니다.</p>
          )}

          {Object.entries(grouped).map(([type, items]) => {
            const meta = TYPE_META[type]
            const HeaderIcon = meta?.icon || Search
            return (
              <div key={type} className="mb-3">
                <p className="flex items-center gap-1.5 px-2 pb-1 text-xs font-medium text-slate-500">
                  <HeaderIcon size={12} />
                  {meta?.label || type}
                </p>
                <div className="space-y-1">
                  {items.map(item => {
                    const itemMeta = TYPE_META[item.type]
                    const ItemIcon = itemMeta?.icon || Search
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => {
                          navigate(item.url)
                          handleClose()
                        }}
                        className="w-full rounded-lg px-2 py-2 text-left hover:bg-slate-100"
                      >
                        <div className="flex items-center gap-2">
                          <ItemIcon size={14} className="shrink-0 text-slate-400" />
                          <p className="text-sm text-slate-800">{item.title}</p>
                        </div>
                        {item.subtitle && <p className="mt-0.5 pl-6 text-xs text-slate-500">{item.subtitle}</p>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}




