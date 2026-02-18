import { TIME_OPTIONS } from './timeOptions'

interface TimeSelectProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  customPromptText?: string
}

export default function TimeSelect({
  value,
  onChange,
  className,
  placeholder = '선택',
  customPromptText = '시간을 입력하세요 (예: 1h 30m)',
}: TimeSelectProps) {
  const isCustom = !!value && !TIME_OPTIONS.includes(value)

  return (
    <select
      value={isCustom ? '__custom__' : value}
      onChange={(e) => {
        if (e.target.value === '__custom__') {
          const custom = window.prompt(customPromptText)
          if (custom) onChange(custom)
          return
        }
        onChange(e.target.value)
      }}
      className={className || 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'}
    >
      <option value="">{placeholder}</option>
      {TIME_OPTIONS.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
      <option value="__custom__">{isCustom ? `직접입력: ${value}` : '직접입력...'}</option>
    </select>
  )
}
