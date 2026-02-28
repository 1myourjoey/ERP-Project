import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { downloadAttachment, fetchAttachments, type Attachment } from '../../lib/api'

interface FileAttachmentPanelProps {
  attachmentIds: number[]
  onUpload: (file: File) => Promise<number>
  onRemove: (attachmentId: number) => Promise<void>
  disabled?: boolean
  compact?: boolean
  label?: string
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function saveBlobAsFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export default function FileAttachmentPanel({
  attachmentIds,
  onUpload,
  onRemove,
  disabled = false,
  compact = false,
  label = '📎 첨부 파일',
}: FileAttachmentPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)

  const normalizedIds = useMemo(() => {
    const seen = new Set<number>()
    const result: number[] = []
    for (const value of attachmentIds ?? []) {
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed <= 0 || seen.has(parsed)) continue
      seen.add(parsed)
      result.push(parsed)
    }
    return result
  }, [attachmentIds])

  const attachmentsQuery = useQuery({
    queryKey: ['attachments', 'file-panel', normalizedIds.join(',')],
    queryFn: () => fetchAttachments(normalizedIds),
    enabled: normalizedIds.length > 0,
    staleTime: 0,
  })

  const attachmentById = useMemo(
    () => new Map<number, Attachment>((attachmentsQuery.data ?? []).map((row) => [row.id, row])),
    [attachmentsQuery.data],
  )

  const orderedAttachments = useMemo(
    () =>
      normalizedIds
        .map((id) => attachmentById.get(id))
        .filter((row): row is Attachment => Boolean(row)),
    [attachmentById, normalizedIds],
  )

  const handleUpload = async (files: FileList | null) => {
    const selected = Array.from(files ?? [])
    if (selected.length === 0 || disabled) return

    setIsUploading(true)
    try {
      for (const file of selected) {
        await onUpload(file)
      }
    } catch {
      // Axios interceptor already shows toast.
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemove = async (attachmentId: number) => {
    if (disabled) return
    setRemovingId(attachmentId)
    try {
      await onRemove(attachmentId)
    } catch {
      // Axios interceptor already shows toast.
    } finally {
      setRemovingId(null)
    }
  }

  const handleDownload = async (attachment: Attachment) => {
    try {
      const blob = await downloadAttachment(attachment.id)
      const filename = attachment.original_filename || `attachment-${attachment.id}`
      saveBlobAsFile(blob, filename)
    } catch {
      // Axios interceptor already shows toast.
    }
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-gray-800`}>{label}</p>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
          {normalizedIds.length}개
        </span>
      </div>

      {!disabled && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || removingId != null}
            className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-60"
          >
            {isUploading ? '업로드 중...' : '+ 파일 추가'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = event.currentTarget.files
              void handleUpload(files)
              event.currentTarget.value = ''
            }}
          />
        </div>
      )}

      {normalizedIds.length > 0 && attachmentsQuery.isLoading && (
        <p className="text-xs text-gray-500">첨부 파일을 불러오는 중...</p>
      )}

      {normalizedIds.length === 0 ? (
        <p className="rounded border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500">
          첨부된 파일이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {orderedAttachments.map((attachment) => (
            <li key={attachment.id} className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`${compact ? 'text-xs' : 'text-sm'} truncate text-gray-800`}>
                    {attachment.original_filename}
                  </p>
                  <p className="text-[11px] text-gray-500">{formatFileSize(attachment.file_size)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      void handleDownload(attachment)
                    }}
                    className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-100"
                  >
                    다운로드
                  </button>
                  {!disabled && (
                    <button
                      type="button"
                      disabled={removingId === attachment.id}
                      onClick={() => {
                        void handleRemove(attachment.id)
                      }}
                      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100 disabled:opacity-60"
                    >
                      {removingId === attachment.id ? '삭제 중...' : '삭제'}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
