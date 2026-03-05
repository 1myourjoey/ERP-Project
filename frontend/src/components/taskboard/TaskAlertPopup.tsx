import { type ReactNode, useEffect } from 'react'
import { AlertTriangle, Clock3, X } from 'lucide-react'

interface TaskAlertPopupProps {
  open: boolean
  focus: 'overdue' | 'urgent'
  overdueCount: number
  urgentCount: number
  onClose: () => void
  onClickOverdue: () => void
  onClickUrgent: () => void
}

function AlertActionButton({
  active,
  tone,
  label,
  count,
  onClick,
  icon,
}: {
  active: boolean
  tone: 'overdue' | 'urgent'
  label: string
  count: number
  onClick: () => void
  icon: ReactNode
}) {
  const toneClass =
    tone === 'overdue'
      ? 'border-[#e8d4d5] bg-[#f6efef] text-[#73585c] hover:bg-[#f1e8e9]'
      : 'border-[#e7d9bf] bg-[#fff7d6] text-[#876b2b] hover:bg-[#f8efcd]'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition-colors ${toneClass} ${
        active ? 'animate-pulse-gentle ring-2 ring-[#558ef8]/40' : ''
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px]">{count}건</span>
    </button>
  )
}

export default function TaskAlertPopup({
  open,
  focus,
  overdueCount,
  urgentCount,
  onClose,
  onClickOverdue,
  onClickUrgent,
}: TaskAlertPopupProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-[70px] z-[70] w-full max-w-[560px] -translate-x-1/2 px-3"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto rounded-xl border border-[#d8e5fb] bg-white/95 px-2.5 py-2 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-[#1a3660]">업무 경고 알림</p>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn h-6 w-6 min-h-0 min-w-0 p-0 text-[#64748b]"
            aria-label="경고 알림 닫기"
          >
            <X size={12} />
          </button>
        </div>
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          {overdueCount > 0 && (
            <AlertActionButton
              active={focus === 'overdue'}
              tone="overdue"
              label="기한 경과"
              count={overdueCount}
              onClick={onClickOverdue}
              icon={<AlertTriangle size={12} />}
            />
          )}
          {urgentCount > 0 && (
            <AlertActionButton
              active={focus === 'urgent'}
              tone="urgent"
              label="24시간 내 마감"
              count={urgentCount}
              onClick={onClickUrgent}
              icon={<Clock3 size={12} />}
            />
          )}
        </div>
      </div>
    </div>
  )
}
