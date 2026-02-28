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

import { Button } from '@/components/ui/button'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent } from '@/components/ui/dialog'
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
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(
    () => () => {
      clearDebounce()
    },
    [],
  )

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
        .then((rows) => setResults(rows))
        .finally(() => setLoading(false))
    }, 300)
  }

  const grouped = useMemo(() => groupByType(results), [results])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent className="max-w-2xl p-0">
        <Command className="border-0">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
            <Search size={16} className="text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="조합, 회사, 업무, 워크플로우, 보고서 검색"
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X size={16} />
            </Button>
          </div>

          <CommandList className="max-h-[60vh] p-2">
            {loading && <p className="p-2 text-sm text-gray-500">검색 중...</p>}
            {!loading && query.trim() && results.length === 0 && (
              <div className="empty-emoji-state py-8">
                <span className="emoji" aria-hidden="true">🔍</span>
                <p className="message">'{query.trim()}'에 대한 검색 결과가 없어요.</p>
              </div>
            )}
            {!query.trim() && (
              <p className="p-2 text-sm text-gray-500">Ctrl+Space 또는 Cmd+Space 로 바로 검색할 수 있습니다.</p>
            )}

            {Object.entries(grouped).map(([type, items]) => {
              const meta = TYPE_META[type]
              const HeaderIcon = meta?.icon || Search
              return (
                <div key={type} className="mb-3">
                  <p className="flex items-center gap-1.5 px-2 pb-1 text-xs font-medium text-gray-500">
                    <HeaderIcon size={12} />
                    {meta?.label || type}
                  </p>
                  <div className="space-y-1">
                    {items.map((item) => {
                      const itemMeta = TYPE_META[item.type]
                      const ItemIcon = itemMeta?.icon || Search
                      return (
                        <CommandItem
                          key={`${item.type}-${item.id}`}
                          onClick={() => {
                            navigate(item.url)
                            handleClose()
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <ItemIcon size={14} className="shrink-0 text-gray-400" />
                            <p className="text-sm text-gray-800 dark:text-gray-100">{item.title}</p>
                          </div>
                          {item.subtitle && <p className="mt-0.5 pl-6 text-xs text-gray-500">{item.subtitle}</p>}
                        </CommandItem>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
