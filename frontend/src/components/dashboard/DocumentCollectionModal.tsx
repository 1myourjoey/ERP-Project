import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderCheck, X } from 'lucide-react'

import { bulkUpdateDocumentStatus, type DocumentStatusItem } from '../../lib/api'
import { invalidateDocumentRelated } from '../../lib/queryInvalidation'
import { useToast } from '../../contexts/ToastContext'

interface DocumentCollectionModalProps {
  open: boolean
  documents: DocumentStatusItem[]
  onClose: () => void
}

type GroupedDocuments = {
  key: string
  fundName: string
  companyName: string
  rows: DocumentStatusItem[]
}

function dueBadge(daysRemaining: number | null) {
  if (daysRemaining == null) return null
  if (daysRemaining < 0) return { text: `지연 D+${Math.abs(daysRemaining)}`, className: 'tag tag-red' }
  if (daysRemaining === 0) return { text: 'D-Day', className: 'tag tag-red' }
  if (daysRemaining <= 7) return { text: `D-${daysRemaining}`, className: 'tag tag-amber' }
  return { text: `D-${daysRemaining}`, className: 'tag tag-gray' }
}

function groupDocuments(rows: DocumentStatusItem[]): GroupedDocuments[] {
  const grouped = new Map<string, GroupedDocuments>()
  for (const row of rows) {
    const key = `${row.fund_id}:${row.company_id}`
    const current = grouped.get(key)
    if (current) {
      current.rows.push(row)
      continue
    }
    grouped.set(key, {
      key,
      fundName: row.fund_name,
      companyName: row.company_name,
      rows: [row],
    })
  }
  return Array.from(grouped.values()).sort((a, b) => {
    const fundCompare = a.fundName.localeCompare(b.fundName, 'ko')
    if (fundCompare !== 0) return fundCompare
    return a.companyName.localeCompare(b.companyName, 'ko')
  })
}

export default function DocumentCollectionModal({
  open,
  documents,
  onClose,
}: DocumentCollectionModalProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const grouped = useMemo(() => groupDocuments(documents), [documents])
  const totalPending = useMemo(
    () => documents.filter((document) => document.status !== 'collected').length,
    [documents],
  )

  const patchDocumentCaches = (documentIds: number[], nextStatus: string) => {
    const patchRows = (rows: DocumentStatusItem[] | undefined) =>
      rows?.map((row) => (documentIds.includes(row.id) ? { ...row, status: nextStatus } : row))

    queryClient.setQueriesData({ queryKey: ['document-status'] }, patchRows)
    queryClient.setQueriesData({ queryKey: ['documentStatus'] }, patchRows)
  }

  const bulkStatusMut = useMutation({
    mutationFn: ({ documentIds, nextStatus }: { documentIds: number[]; nextStatus: string }) =>
      bulkUpdateDocumentStatus({ document_ids: documentIds, status: nextStatus }),
    onMutate: ({ documentIds, nextStatus }) => {
      patchDocumentCaches(documentIds, nextStatus)
      return { documentIds, nextStatus }
    },
    onSuccess: (_, vars) => {
      invalidateDocumentRelated(queryClient)
      addToast(
        'success',
        vars.documentIds.length > 1 ? `서류 ${vars.documentIds.length}건을 수집완료 처리했습니다.` : '서류를 수집완료 처리했습니다.',
      )
    },
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4" onClick={onClose}>
      <div
        className="mx-auto flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-[#d8e5fb] bg-white shadow-[0_24px_80px_rgba(15,31,61,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#eef3fb] px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-1 text-[11px] font-semibold text-[#1a3660]">
              <FolderCheck size={14} />
              서류모음
            </div>
            <h3 className="mt-3 text-xl font-semibold text-[#0f1f3d]">수집이 필요한 서류만 모아서 처리</h3>
            <p className="mt-1 text-sm text-[#64748b]">조합/회사 묶음으로 바로 수집완료 처리하고 다른 탭과 즉시 동기화합니다.</p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn text-[#64748b]" aria-label="서류모음 닫기">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[#f1f5fb] bg-[#fbfdff] px-6 py-3">
          <div className="text-sm text-[#64748b]">미수집/요청중/검토중 서류 {totalPending}건</div>
          <button
            type="button"
            className="primary-btn btn-sm"
            disabled={totalPending === 0 || bulkStatusMut.isPending}
            onClick={() =>
              bulkStatusMut.mutate({
                documentIds: documents.filter((document) => document.status !== 'collected').map((document) => document.id),
                nextStatus: 'collected',
              })
            }
          >
            전체 수집완료
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {grouped.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#d8e5fb] bg-[#f8fbff] px-6 py-10 text-center text-sm text-[#64748b]">
              처리할 서류가 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => {
                const pendingRows = group.rows.filter((row) => row.status !== 'collected')
                return (
                  <section key={group.key} className="rounded-2xl border border-[#d8e5fb] bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef3fb] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-[#0f1f3d]">{group.companyName}</p>
                        <p className="text-xs text-[#64748b]">{group.fundName} · 전체 {group.rows.length}건 · 미수집 {pendingRows.length}건</p>
                      </div>
                      <button
                        type="button"
                        className="secondary-btn btn-sm"
                        disabled={pendingRows.length === 0 || bulkStatusMut.isPending}
                        onClick={() => bulkStatusMut.mutate({ documentIds: pendingRows.map((row) => row.id), nextStatus: 'collected' })}
                      >
                        그룹 수집완료
                      </button>
                    </div>

                    <div className="grid gap-2 px-4 py-4 md:grid-cols-2">
                      {group.rows.map((row) => {
                        const badge = dueBadge(row.days_remaining)
                        return (
                          <div key={row.id} className="rounded-2xl border border-[#eef3fb] bg-[#fbfdff] p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-[#0f1f3d]">{row.document_name}</p>
                                <p className="mt-1 text-xs text-[#64748b]">
                                  상태 {row.status} · 마감 {row.due_date || '-'}
                                </p>
                              </div>
                              {badge ? <span className={badge.className}>{badge.text}</span> : null}
                            </div>
                            <div className="mt-3 flex gap-2">
                              <select
                                value={row.status}
                                disabled={bulkStatusMut.isPending}
                                onChange={(event) =>
                                  bulkStatusMut.mutate({ documentIds: [row.id], nextStatus: event.target.value })
                                }
                                className="form-input-sm flex-1"
                              >
                                <option value="pending">미수집</option>
                                <option value="requested">요청중</option>
                                <option value="reviewing">검토중</option>
                                <option value="collected">수집완료</option>
                              </select>
                              <button
                                type="button"
                                className="secondary-btn btn-sm"
                                disabled={row.status === 'collected' || bulkStatusMut.isPending}
                                onClick={() => bulkStatusMut.mutate({ documentIds: [row.id], nextStatus: 'collected' })}
                              >
                                완료
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
