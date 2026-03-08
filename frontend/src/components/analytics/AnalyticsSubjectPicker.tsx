import type { AnalyticsSubjectMeta } from '../../lib/api/analytics'

interface AnalyticsSubjectPickerProps {
  subjects: AnalyticsSubjectMeta[]
  value: string
  onChange: (next: string) => void
  variant?: 'card' | 'inline'
}

export default function AnalyticsSubjectPicker({
  subjects,
  value,
  onChange,
  variant = 'card',
}: AnalyticsSubjectPickerProps) {
  const active = subjects.find((subject) => subject.key === value)
  const isInline = variant === 'inline'

  return (
    <div
      className={
        isInline
          ? 'flex min-w-0 flex-1 flex-wrap items-center gap-2'
          : 'rounded-xl border border-[#d8e5fb] bg-white px-3 py-3 shadow-sm'
      }
    >
      <div className={`flex min-w-0 flex-wrap items-center gap-3 ${isInline ? 'w-full' : ''}`}>
        <label className="text-xs font-semibold text-[#64748b]">분석 기준</label>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`form-input-sm ${isInline ? 'min-w-[220px] flex-none bg-[#fbfdff]' : 'min-w-[220px]'}`}
        >
          <option value="">분석 기준 선택</option>
          {subjects.map((subject) => (
            <option key={subject.key} value={subject.key}>{subject.label}</option>
          ))}
        </select>
        {active && (
          <>
            <span className="rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-2.5 py-1 text-[11px] font-semibold text-[#1a3660]">
              {active.grain_label}
            </span>
            <p className={`text-xs text-[#64748b] ${isInline ? 'min-w-0 flex-1 truncate' : ''}`}>{active.description}</p>
          </>
        )}
      </div>
    </div>
  )
}
