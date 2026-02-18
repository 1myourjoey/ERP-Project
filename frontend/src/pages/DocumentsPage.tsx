import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchDocumentStatus,
  fetchFunds,
  fetchCompanies,
  updateInvestmentDocument,
  type DocumentStatusItem,
  type Fund,
  type Company,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import PageLoading from '../components/PageLoading'

function dueBadge(daysRemaining: number | null) {
  if (daysRemaining == null) return null
  if (daysRemaining < 0) {
    return { text: `지연 D+${Math.abs(daysRemaining)}`, className: 'bg-red-100 text-red-700' }
  }
  if (daysRemaining === 0) {
    return { text: 'D-Day', className: 'bg-red-100 text-red-700' }
  }
  if (daysRemaining <= 7) {
    return { text: `D-${daysRemaining}`, className: 'bg-amber-100 text-amber-700' }
  }
  return { text: `D-${daysRemaining}`, className: 'bg-gray-100 text-gray-600' }
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-base">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-800">{value}</p>
    </div>
  )
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
      <div className="page-header">
        <div>
          <h2 className="page-title">서류 현황</h2>
          <p className="page-subtitle">서류 수집 상태와 마감 일정을 추적합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard label="전체 서류 수" value={`${summary.total}건`} />
        <SummaryCard label="미수집 서류 수" value={`${summary.missing}건`} />
        <SummaryCard label="수집률" value={`${summary.rate}%`} />
      </div>

      <div className="card-base">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 py-1 text-sm border rounded">
            <option value="">전체 상태</option>
            <option value="pending">미수집</option>
            <option value="requested">요청중</option>
            <option value="collected">수집완료</option>
          </select>

          <select value={fundId} onChange={e => setFundId(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 text-sm border rounded">
            <option value="">전체 조합</option>
            {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>

          <select value={companyId} onChange={e => setCompanyId(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 text-sm border rounded">
            <option value="">전체 회사</option>
            {companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <PageLoading />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">서류명</th>
                <th className="px-3 py-2 text-left">투자건(회사명)</th>
                <th className="px-3 py-2 text-left">조합명</th>
                <th className="px-3 py-2 text-left">상태</th>
                <th className="px-3 py-2 text-left">마감일</th>
                <th className="px-3 py-2 text-left">D-day</th>
                <th className="px-3 py-2 text-left">비고</th>
              </tr>
            </thead>
            <tbody>
              {docs?.map((doc) => {
                const badge = dueBadge(doc.days_remaining)
                const isUpdating = updateStatusMut.isPending && updateStatusMut.variables?.doc.id === doc.id
                return (
                  <tr key={doc.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{doc.document_name}</td>
                    <td className="px-3 py-2">{doc.company_name}</td>
                    <td className="px-3 py-2">{doc.fund_name}</td>
                    <td className="px-3 py-2">
                      <select
                        value={doc.status}
                        disabled={isUpdating}
                        onChange={e => updateStatusMut.mutate({ doc, nextStatus: e.target.value })}
                        className="px-2 py-1 text-xs border rounded bg-white"
                      >
                        <option value="pending">미수집</option>
                        <option value="requested">요청중</option>
                        <option value="reviewing">검토중</option>
                        <option value="collected">수집완료</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">{doc.due_date || '-'}</td>
                    <td className="px-3 py-2">
                      {badge ? <span className={`text-[11px] px-1.5 py-0.5 rounded ${badge.className}`}>{badge.text}</span> : '-'}
                    </td>
                    <td className="px-3 py-2">{doc.note || '-'}</td>
                  </tr>
                )
              })}
              {!docs?.length && (
                <tr>
                  <td className="px-3 py-4 text-gray-400" colSpan={7}>서류가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}









