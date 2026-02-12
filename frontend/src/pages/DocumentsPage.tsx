import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchDocumentStatus, fetchFunds, fetchCompanies } from '../lib/api'

export default function DocumentsPage() {
  const [status, setStatus] = useState('')
  const [fundId, setFundId] = useState<number | ''>('')
  const [companyId, setCompanyId] = useState<number | ''>('')

  const { data: funds } = useQuery({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: fetchCompanies })

  const { data: docs, isLoading } = useQuery({
    queryKey: ['documentStatus', status, fundId, companyId],
    queryFn: () => fetchDocumentStatus({
      status: status || undefined,
      fund_id: fundId === '' ? undefined : fundId,
      company_id: companyId === '' ? undefined : companyId,
    }),
  })

  return (
    <div className="p-6 max-w-6xl">
      <h2 className="text-2xl font-bold text-slate-900 mb-5">Document Status</h2>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 py-1 text-sm border rounded">
            <option value="">All status</option>
            <option value="pending">pending</option>
            <option value="requested">requested</option>
            <option value="reviewing">reviewing</option>
            <option value="collected">collected</option>
          </select>

          <select value={fundId} onChange={e => setFundId(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 text-sm border rounded">
            <option value="">All funds</option>
            {funds?.map((fund: any) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>

          <select value={companyId} onChange={e => setCompanyId(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 text-sm border rounded">
            <option value="">All companies</option>
            {companies?.map((company: any) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500">Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Document</th>
                <th className="px-3 py-2 text-left">Fund</th>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {docs?.map((doc: any) => (
                <tr key={doc.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{doc.document_name}</td>
                  <td className="px-3 py-2">{doc.fund_name}</td>
                  <td className="px-3 py-2">{doc.company_name}</td>
                  <td className="px-3 py-2">{doc.document_type || '-'}</td>
                  <td className="px-3 py-2">{doc.status}</td>
                  <td className="px-3 py-2">{doc.note || '-'}</td>
                </tr>
              ))}
              {!docs?.length && (
                <tr>
                  <td className="px-3 py-4 text-slate-400" colSpan={6}>No documents found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
