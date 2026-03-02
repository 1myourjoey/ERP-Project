import { useEffect, useRef, useState } from 'react'
import { Check, Pencil } from 'lucide-react'

interface InlineEditProps {
  value: string
  onSave: (newValue: string) => void
  type?: 'text' | 'number' | 'select'
  options?: { value: string; label: string }[]
  loading?: boolean
}

export function InlineEdit({ value, onSave, type = 'text', options = [], loading = false }: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  useEffect(() => {
    if (!editing) {
      setDraft(value)
      return
    }
    inputRef.current?.focus()
  }, [editing, value])

  const commit = () => {
    if (draft !== value) {
      onSave(draft)
    }
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-left hover:bg-[var(--theme-hover)]"
        onClick={() => setEditing(true)}
      >
        <span>{value || '-'}</span>
        <Pencil size={12} />
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-1">
      {type === 'select' ? (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          className="form-input-sm"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          disabled={loading}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={type}
          className="form-input-sm"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') setEditing(false)
          }}
          disabled={loading}
        />
      )}
      <button type="button" className="icon-btn" onClick={commit} disabled={loading} aria-label="저장">
        <Check size={14} />
      </button>
    </div>
  )
}

export default InlineEdit
