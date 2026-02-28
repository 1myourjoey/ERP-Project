import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGenerationStatus, type DocumentGenerationStatus } from '../../lib/api'

type DocumentGenerationProgressProps = {
  open: boolean
  generationId: number | null
  onClose: () => void
  onComplete?: (status: DocumentGenerationStatus) => void
  onDownload?: (generationId: number) => void
  downloadPending?: boolean
}

function statusLabel(status: DocumentGenerationStatus['status']): string {
  if (status === 'pending') return '대기'
  if (status === 'processing') return '처리 중'
  if (status === 'completed') return '완료'
  return '실패'
}

function statusBadgeClass(status: DocumentGenerationStatus['status']): string {
  if (status === 'pending') return 'bg-amber-100 text-amber-700'
  if (status === 'processing') return 'bg-blue-100 text-blue-700'
  if (status === 'completed') return 'bg-emerald-100 text-emerald-700'
  return 'bg-red-100 text-red-700'
}

export default function DocumentGenerationProgress({
  open,
  generationId,
  onClose,
  onComplete,
  onDownload,
  downloadPending = false,
}: DocumentGenerationProgressProps) {
  const completedRef = useRef(false)

  const statusQuery = useQuery({
    queryKey: ['document-generation-status', generationId],
    queryFn: () => fetchGenerationStatus(Number(generationId)),
    enabled: open && generationId != null,
    refetchInterval: (query) => {
      const data = query.state.data as DocumentGenerationStatus | undefined
      if (!data) return 5000
      if (data.status === 'completed' || data.status === 'failed') return false
      return 5000
    },
  })

  useEffect(() => {
    if (!open || !statusQuery.data || completedRef.current) return
    if (statusQuery.data.status === 'completed' || statusQuery.data.status === 'failed') {
      completedRef.current = true
      onComplete?.(statusQuery.data)
    }
  }, [open, onComplete, statusQuery.data])

  useEffect(() => {
    if (!open) {
      completedRef.current = false
    }
  }, [open])

  if (!open || generationId == null) return null

  const data = statusQuery.data
  const total = data?.progress_total ?? data?.total_files ?? 0
  const current = data?.progress_current ?? (data ? data.success_count + data.failed_count : 0)
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="modal-content w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">서류 생성 진행</h3>
          <button onClick={onClose} className="secondary-btn">백그라운드로 전환</button>
        </div>

        {!data ? (
          <div className="py-6 text-sm text-gray-500">진행 상태를 불러오는 중...</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(data.status)}`}>
                {statusLabel(data.status)}
              </span>
              <span className="text-gray-600">
                {total > 0 ? `${percent}% (${current}/${total})` : `${current}건 처리`}
              </span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <p className="text-gray-500">현재 작업</p>
              <p className="mt-1 text-gray-800">{data.progress_message || '처리 중...'}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                총 파일
                <p className="mt-1 text-base font-semibold text-gray-900">{data.total_files || total}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-emerald-50 px-3 py-2">
                성공
                <p className="mt-1 text-base font-semibold text-emerald-700">{data.success_count}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-red-50 px-3 py-2">
                실패
                <p className="mt-1 text-base font-semibold text-red-700">{data.failed_count}</p>
              </div>
            </div>

            {data.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                경고 {data.warnings.length}건
              </div>
            )}

            {data.error_message && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {data.error_message}
              </div>
            )}

            {data.status === 'completed' && onDownload && (
              <div className="pt-1">
                <button
                  onClick={() => onDownload(generationId)}
                  disabled={downloadPending}
                  className="primary-btn w-full"
                >
                  {downloadPending ? '다운로드 준비 중...' : 'ZIP 다운로드'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
