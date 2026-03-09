import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  bulkUpdateDocumentStatus,
  downloadGeneratedDocument,
  fetchDocumentStatus,
  fetchGeneratedDocuments,
  fetchFunds,
  fetchCompanies,
  type Company,
  type DocumentStatusItem,
  type Fund,
  type GeneratedDocumentItem,
} from '../lib/api'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import SectionScaffold from '../components/common/page/SectionScaffold'
import { useToast } from '../contexts/ToastContext'
import { invalidateDocumentRelated } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'

function dueBadge(daysRemaining: number | null) {
  if (daysRemaining == null) return null
  if (daysRemaining < 0) {
    return { text: `지연 D+${Math.abs(daysRemaining)}`, className: 'tag tag-red' }
  }
  if (daysRemaining === 0) {
    return { text: 'D-Day', className: 'tag tag-red' }
  }
  if (daysRemaining <= 7) {
    return { text: `D-${daysRemaining}`, className: 'tag tag-amber' }
  }
  return { text: `D-${daysRemaining}`, className: 'tag tag-gray' }
}

function toDateTime(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString('ko-KR')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

type DocumentGroup = {
  key: string
  fundId: number
  fundName: string
  companyId: number
  companyName: string
  rows: DocumentStatusItem[]
}

function buildDocumentGroups(rows: DocumentStatusItem[]): DocumentGroup[] {
  const grouped = new Map<string, DocumentGroup>()
  for (const row of rows) {
    const key = `${row.fund_id}:${row.company_id}`
    const current = grouped.get(key)
    if (current) {
      current.rows.push(row)
      continue
    }
    grouped.set(key, {
      key,
      fundId: row.fund_id,
      fundName: row.fund_name,
      companyId: row.company_id,
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

export default function DocumentsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [status, setStatus] = useState('')
  const [fundId, setFundId] = useState<number | ''>('')
  const [companyId, setCompanyId] = useState<number | ''>('')

  const filters = useMemo(
    () => ({
      status: status || undefined,
      fund_id: fundId === '' ? undefined : fundId,
      company_id: companyId === '' ? undefined : companyId,
    }),
    [companyId, fundId, status],
  )

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: fetchCompanies })

  const { data: docs = [], isLoading } = useQuery<DocumentStatusItem[]>({
    queryKey: queryKeys.documents.status(filters),
    queryFn: () => fetchDocumentStatus(filters),
  })
  const { data: generatedDocs = [], isLoading: generatedLoading } = useQuery<GeneratedDocumentItem[]>({
    queryKey: queryKeys.documents.generated,
    queryFn: () => fetchGeneratedDocuments({ limit: 200 }),
  })

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
        vars.documentIds.length > 1 ? `서류 ${vars.documentIds.length}건 상태를 변경했습니다.` : '서류 상태를 변경했습니다.',
      )
    },
  })

  const summary = useMemo(() => {
    const total = docs.length
    const missing = docs.filter((doc) => doc.status !== 'collected').length
    const collected = docs.filter((doc) => doc.status === 'collected').length
    const rate = total > 0 ? Math.round((collected / total) * 100) : 0
    return { total, missing, rate }
  }, [docs])

  const documentGroups = useMemo(() => buildDocumentGroups(docs), [docs])
  const pendingDocumentIds = useMemo(
    () => docs.filter((doc) => doc.status !== 'collected').map((doc) => doc.id),
    [docs],
  )

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="서류 현황"
        subtitle="조합별 수집 현황을 묶음으로 보고, 필요한 서류만 바로 일괄 완료합니다."
      />

      <PageMetricStrip
        items={[
          { label: '전체 서류', value: `${summary.total}건`, hint: '현재 조회 조건 기준', tone: 'info' },
          { label: '미수집', value: `${summary.missing}건`, hint: '즉시 수집 대상', tone: summary.missing > 0 ? 'warning' : 'success' },
          { label: '수집률', value: `${summary.rate}%`, hint: '수집 완료 기준', tone: summary.rate === 100 ? 'success' : 'default' },
          { label: '자동 생성 문서', value: `${generatedDocs.length}건`, hint: '최근 생성 이력', tone: 'default' },
        ]}
      />

      <PageControlStrip compact>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">상태</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-input">
              <option value="">전체 상태</option>
              <option value="pending">미수집</option>
              <option value="requested">요청중</option>
              <option value="reviewing">검토중</option>
              <option value="collected">수집완료</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">조합</label>
            <select value={fundId} onChange={(e) => setFundId(e.target.value ? Number(e.target.value) : '')} className="form-input">
              <option value="">전체 조합</option>
              {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">회사</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : '')} className="form-input">
              <option value="">전체 회사</option>
              {companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              className="primary-btn w-full"
              disabled={pendingDocumentIds.length === 0 || bulkStatusMut.isPending}
              onClick={() => bulkStatusMut.mutate({ documentIds: pendingDocumentIds, nextStatus: 'collected' })}
            >
              현재 결과 전체 수집완료
            </button>
          </div>
        </div>
      </PageControlStrip>

      <SectionScaffold
        title="서류 수집 상태"
        description="조합과 회사 단위로 묶어서 필요한 서류를 한번에 완료 처리할 수 있습니다."
      >
        {isLoading ? (
          <PageLoading />
        ) : documentGroups.length === 0 ? (
          <EmptyState message="등록된 서류가 없습니다." className="py-8" />
        ) : (
          <div className="space-y-3">
            {documentGroups.map((group) => {
              const pendingRows = group.rows.filter((row) => row.status !== 'collected')
              return (
                <div key={group.key} className="rounded-2xl border border-[#d8e5fb] bg-white">
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
                      그룹 전체 수집완료
                    </button>
                  </div>

                  <div className="compact-table-wrap">
                    <table className="w-full text-sm">
                      <thead className="table-head-row">
                        <tr>
                          <th className="table-head-cell">서류명</th>
                          <th className="table-head-cell">상태</th>
                          <th className="table-head-cell">마감일</th>
                          <th className="table-head-cell">D-day</th>
                          <th className="table-head-cell">비고</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((doc) => {
                          const badge = dueBadge(doc.days_remaining)
                          return (
                            <tr key={doc.id} className="hover:bg-[#f8fbff]">
                              <td className="table-body-cell">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-[#0f1f3d]">{doc.document_name}</span>
                                  {doc.document_type ? <span className="tag tag-gray">{doc.document_type}</span> : null}
                                </div>
                              </td>
                              <td className="table-body-cell">
                                <select
                                  value={doc.status}
                                  disabled={bulkStatusMut.isPending}
                                  onChange={(e) => bulkStatusMut.mutate({ documentIds: [doc.id], nextStatus: e.target.value })}
                                  className="form-input-sm min-w-[132px]"
                                >
                                  <option value="pending">미수집</option>
                                  <option value="requested">요청중</option>
                                  <option value="reviewing">검토중</option>
                                  <option value="collected">수집완료</option>
                                </select>
                              </td>
                              <td className="table-body-cell">{doc.due_date || '-'}</td>
                              <td className="table-body-cell">{badge ? <span className={badge.className}>{badge.text}</span> : '-'}</td>
                              <td className="table-body-cell">{doc.note || '-'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionScaffold>

      <SectionScaffold
        title="자동 생성 문서 이력"
        description="생성 시점과 템플릿 유형을 빠르게 확인하고 바로 다운로드합니다."
        actions={<span className="text-xs text-[#64748b]">{generatedDocs.length}건</span>}
        className="overflow-hidden"
        bodyClassName="p-0"
      >
        {generatedLoading ? (
          <PageLoading />
        ) : !generatedDocs.length ? (
          <EmptyState message="자동 생성 문서가 없습니다." className="py-8" />
        ) : (
          <div className="compact-table-wrap">
            <table className="w-full text-sm">
              <thead className="table-head-row">
                <tr>
                  <th className="table-head-cell">생성일</th>
                  <th className="table-head-cell">문서명</th>
                  <th className="table-head-cell">유형</th>
                  <th className="table-head-cell">다운로드</th>
                </tr>
              </thead>
              <tbody>
                {generatedDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[#f5f9ff]">
                    <td className="table-body-cell">{toDateTime(doc.created_at)}</td>
                    <td className="table-body-cell">{doc.filename}</td>
                    <td className="table-body-cell">
                      <span className="tag tag-gray">{doc.builder_label || doc.builder}</span>
                    </td>
                    <td className="table-body-cell">
                      <button
                        className="secondary-btn btn-sm"
                        onClick={async () => {
                          const blob = await downloadGeneratedDocument(doc.id)
                          downloadBlob(blob, doc.filename)
                          addToast('success', '문서를 다운로드했습니다.')
                        }}
                      >
                        다운로드
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionScaffold>
    </div>
  )
}
