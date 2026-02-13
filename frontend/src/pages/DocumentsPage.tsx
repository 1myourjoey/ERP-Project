import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchDocumentStatus, fetchFunds, fetchCompanies, type DocumentStatusItem, type Fund, type Company } from '../lib/api'
import { labelStatus } from '../lib/labels'

export default function DocumentsPage() {
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

  return (
    <div className="p-6 max-w-6xl">
      <h2 className="text-2xl font-bold text-slate-900 mb-5">서류 현황</h2>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 py-1 text-sm border rounded">
            <option value="">전체 상태</option>
            <option value="pending">{labelStatus('pending')}</option>
            <option value="requested">{labelStatus('requested')}</option>
            <option value="reviewing">{labelStatus('reviewing')}</option>
            <option value="collected">{labelStatus('collected')}</option>
          </select>

          <select value={fundId} onChange={e => setFundId(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 text-sm border rounded">
            <option value="">전체 조합</option>
            {funds?.map((fund: Fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>

          <select value={companyId} onChange={e => setCompanyId(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 text-sm border rounded">
            <option value="">전체 회사</option>
            {companies?.map((company: Company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500">불러오는 중...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">서류</th>
                <th className="px-3 py-2 text-left">조합</th>
                <th className="px-3 py-2 text-left">회사</th>
                <th className="px-3 py-2 text-left">유형</th>
                <th className="px-3 py-2 text-left">상태</th>
                <th className="px-3 py-2 text-left">비고</th>
              </tr>
            </thead>
            <tbody>
              {docs?.map((doc: DocumentStatusItem) => (
                <tr key={doc.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{doc.document_name}</td>
                  <td className="px-3 py-2">{doc.fund_name}</td>
                  <td className="px-3 py-2">{doc.company_name}</td>
                  <td className="px-3 py-2">{doc.document_type || '-'}</td>
                  <td className="px-3 py-2">{labelStatus(doc.status)}</td>
                  <td className="px-3 py-2">{doc.note || '-'}</td>
                </tr>
              ))}
              {!docs?.length && (
                <tr>
                  <td className="px-3 py-4 text-slate-400" colSpan={6}>서류가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
