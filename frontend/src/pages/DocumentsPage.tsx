import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  downloadGeneratedDocument,
  fetchDocumentStatus,
  fetchGeneratedDocuments,
  fetchFunds,
  fetchCompanies,
  updateInvestmentDocument,
  type DocumentStatusItem,
  type Fund,
  type Company,
  type GeneratedDocumentItem,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import SectionScaffold from '../components/common/page/SectionScaffold'

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

export default function DocumentsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [status, setStatus] = useState('')
  const [fundId, setFundId] = useState<number | ''>('')
  const [companyId, setCompanyId] = useState<number | ''>('')

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: fetchCompanies })

  const { data: docs, isLoading } = useQuery<DocumentStatusItem[]>({
    queryKey: ['documentStatus', status, fundId, companyId],
    queryFn: () => fetchDocumentStatus({
      status: status || undefined,
      fund_id: fundId === '' ? undefined : fundId,
      company_id: companyId === '' ? undefined : companyId,
    }),
  })
  const { data: generatedDocs = [], isLoading: generatedLoading } = useQuery<GeneratedDocumentItem[]>({
    queryKey: ['generatedDocuments'],
    queryFn: () => fetchGeneratedDocuments({ limit: 200 }),
  })

  const updateStatusMut = useMutation({
    mutationFn: ({ doc, nextStatus }: { doc: DocumentStatusItem; nextStatus: string }) =>
      updateInvestmentDocument(doc.investment_id, doc.id, { status: nextStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentStatus'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('success', '서류 상태를 변경했습니다.')
    },
  })

  const summary = useMemo(() => {
    const rows = docs || []
    const total = rows.length
    const missing = rows.filter(doc => doc.status !== 'collected').length
    const collected = rows.filter(doc => doc.status === 'collected').length
    const rate = total > 0 ? Math.round((collected / total) * 100) : 0
    return { total, missing, rate }
  }, [docs])

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="서류 현황"
        subtitle="서류 수집 상태, 마감 일정, 자동 생성 이력을 같은 작업 문법으로 확인합니다."
      />

      <PageMetricStrip
        items={[
          { label: '전체 서류', value: `${summary.total}건`, hint: '현재 조회 조건 기준', tone: 'info' },
          { label: '미수집', value: `${summary.missing}건`, hint: '후속 요청 필요', tone: summary.missing > 0 ? 'warning' : 'success' },
          { label: '수집률', value: `${summary.rate}%`, hint: '수집 완료 기준', tone: summary.rate === 100 ? 'success' : 'default' },
          { label: '자동 생성 문서', value: `${generatedDocs.length}건`, hint: '최근 생성 이력', tone: 'default' },
        ]}
      />

      <PageControlStrip compact>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">상태</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="form-input">
              <option value="">전체 상태</option>
              <option value="pending">미수집</option>
              <option value="requested">요청중</option>
              <option value="collected">수집완료</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">조합</label>
            <select value={fundId} onChange={e => setFundId(e.target.value ? Number(e.target.value) : '')} className="form-input">
              <option value="">전체 조합</option>
              {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">회사</label>
            <select value={companyId} onChange={e => setCompanyId(e.target.value ? Number(e.target.value) : '')} className="form-input">
              <option value="">전체 회사</option>
              {companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </div>
        </div>
      </PageControlStrip>

      <SectionScaffold
        title="서류 수집 상태"
        description="수집 상태를 바로 갱신하면서 마감일과 지연 여부를 함께 확인합니다."
        className="overflow-hidden"
        bodyClassName="p-0"
      >
        {isLoading ? (
          <PageLoading />
        ) : (
          <div className="compact-table-wrap">
            <table className="w-full text-sm">
              <thead className="table-head-row">
              <tr>
                <th className="table-head-cell">서류명</th>
                <th className="table-head-cell">투자건(회사명)</th>
                <th className="table-head-cell">조합명</th>
                <th className="table-head-cell">상태</th>
                <th className="table-head-cell">마감일</th>
                <th className="table-head-cell">D-day</th>
                <th className="table-head-cell">비고</th>
              </tr>
              </thead>
              <tbody>
              {docs?.map((doc) => {
                const badge = dueBadge(doc.days_remaining)
                const isUpdating = updateStatusMut.isPending && updateStatusMut.variables?.doc.id === doc.id
                return (
                  <tr key={doc.id} className="hover:bg-[#f5f9ff]">
                    <td className="table-body-cell">{doc.document_name}</td>
                    <td className="table-body-cell">{doc.company_name}</td>
                    <td className="table-body-cell">{doc.fund_name}</td>
                    <td className="table-body-cell">
                      <select
                        value={doc.status}
                        disabled={isUpdating}
                        onChange={e => updateStatusMut.mutate({ doc, nextStatus: e.target.value })}
                        className="form-input-sm min-w-[120px]"
                      >
                        <option value="pending">미수집</option>
                        <option value="requested">요청중</option>
                        <option value="reviewing">검토중</option>
                        <option value="collected">수집완료</option>
                      </select>
                    </td>
                    <td className="table-body-cell">{doc.due_date || '-'}</td>
                    <td className="table-body-cell">
                      {badge ? <span className={badge.className}>{badge.text}</span> : '-'}
                    </td>
                    <td className="table-body-cell">{doc.note || '-'}</td>
                  </tr>
                )
              })}
              {!docs?.length && (
                <tr>
                  <td className="px-3 py-1" colSpan={7}>
                    <EmptyState message="등록된 서류가 없습니다." className="py-8" />
                  </td>
                </tr>
              )}
              </tbody>
            </table>
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










