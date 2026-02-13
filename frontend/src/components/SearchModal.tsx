import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'

import { searchGlobal, type SearchResult } from '../lib/api'

const TYPE_LABEL: Record<string, string> = {
  task: 'Task',
  fund: 'Fund',
  company: 'Company',
  investment: 'Investment',
  workflow: 'Workflow',
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
    <div className="fixed inset-0 z-[110] bg-black/40 p-4 md:p-10" onClick={handleClose}>
      <div
        className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
          <Search size={16} className="text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search funds, companies, tasks, workflows"
            className="w-full bg-transparent text-sm outline-none"
          />
          <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-auto p-2">
          {loading && <p className="p-2 text-sm text-slate-500">Searching...</p>}
          {!loading && query.trim() && results.length === 0 && (
            <p className="p-2 text-sm text-slate-500">No results found.</p>
          )}
          {!query.trim() && (
            <p className="p-2 text-sm text-slate-500">Use Ctrl+K or Cmd+K anytime.</p>
          )}

          {Object.entries(grouped).map(([type, items]) => (
            <div key={type} className="mb-3">
              <p className="px-2 pb-1 text-xs font-medium text-slate-500">{TYPE_LABEL[type] || type}</p>
              <div className="space-y-1">
                {items.map(item => (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => {
                      navigate(item.url)
                      handleClose()
                    }}
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-slate-100"
                  >
                    <p className="text-sm text-slate-800">{item.title}</p>
                    {item.subtitle && <p className="text-xs text-slate-500 mt-0.5">{item.subtitle}</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
