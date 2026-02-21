import { useEffect, useMemo, useState } from 'react'

interface KrwAmountInputProps {
  value: number | null
  onChange: (value: number | null) => void
  className?: string
  placeholder?: string
  helperClassName?: string
}

function formatNumber(value: number | null): string {
  if (value == null || Number.isNaN(value)) return ''
  return value.toLocaleString('ko-KR')
}

function parseNumber(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  const parsed = Number(digits)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function formatKoreanAmount(value: number | null): string {
  if (value == null || value <= 0) return '\u0030\uC6D0'

  const sign = value < 0 ? '-' : ''
  let remain = Math.floor(Math.abs(value))
  const parts: string[] = []

  const units = [
    { unit: 1_0000_0000_0000, label: '\uC870' },
    { unit: 1_0000_0000, label: '\uC5B5' },
    { unit: 1_0000, label: '\uB9CC' },
  ]

  for (const { unit, label } of units) {
    const chunk = Math.floor(remain / unit)
    if (chunk <= 0) continue
    parts.push(`${chunk.toLocaleString('ko-KR')}${label}`)
    remain %= unit
  }

  if (remain > 0) {
    parts.push(remain.toLocaleString('ko-KR'))
  }

  return `${sign}${parts.join(' ')}\uC6D0`
}

export default function KrwAmountInput({
  value,
  onChange,
  className = 'w-full rounded-lg border px-3 py-2 text-sm',
  placeholder = '\uC22B\uC790\uB9CC \uC785\uB825',
  helperClassName = 'mt-1 text-[11px] text-gray-500',
}: KrwAmountInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(formatNumber(value))

  useEffect(() => {
    setDisplayValue(formatNumber(value))
  }, [value])

  const helperText = useMemo(() => formatKoreanAmount(value), [value])

  return (
    <div>
      <input
        inputMode="numeric"
        value={displayValue}
        onChange={(event) => {
          const next = parseNumber(event.target.value)
          setDisplayValue(formatNumber(next))
          onChange(next)
        }}
        placeholder={placeholder}
        className={className}
      />
      <p className={helperClassName}>{helperText}</p>
    </div>
  )
}
