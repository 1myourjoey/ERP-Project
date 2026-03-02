import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  confirmVicsReport,
  exportVicsReportXlsx,
  fetchFunds,
  fetchVicsReports,
  generateVicsReport,
  patchVicsReport,
  submitVicsReport,
  type Fund,
  type VicsMonthlyReport,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import { formatKRW } from '../lib/labels'

const REPORT_CODES = [
  { code: '1308', title: '1308 투자현황' },
  { code: '1309', title: '1309 조합현황' },
  { code: '1329', title: '1329 운용현황' },
]

function statusLabel(status: string): string {
  if (status === 'submitted') return '제출완료'
  if (status === 'confirmed') return '확인완료'
  return '초안'
}

function statusClass(status: string): string {
  if (status === 'submitted') return 'tag tag-green'
  if (status === 'confirmed') return 'tag tag-blue'
  return 'tag tag-gray'
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

export default function VicsReportPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const now = new Date()
  const [fundId, setFundId] = useState<number | ''>('')
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth() + 1)
  const [selectedCode, setSelectedCode] = useState<string>('1308')
  const [discrepancyNotes, setDiscrepancyNotes] = useState<string>('')

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })
  const { data: rows = [], isLoading } = useQuery<VicsMonthlyReport[]>({
    queryKey: ['vicsReports', fundId, year, month],
    queryFn: () =>
      fetchVicsReports({
        fund_id: fundId === '' ? undefined : fundId,
        year,
        month,
      }),
  })

  const generateMut = useMutation({
    mutationFn: generateVicsReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vicsReports'] })
      queryClient.invalidateQueries({ queryKey: ['complianceDashboard'] })
      addToast('success', 'VICS 보고 데이터를 생성했습니다.')
    },
  })
  const confirmMut = useMutation({
    mutationFn: confirmVicsReport,
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ['vicsReports'] })
      addToast('success', `${row.report_code} 확인 완료 처리되었습니다.`)
    },
  })
  const submitMut = useMutation({
    mutationFn: submitVicsReport,
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ['vicsReports'] })
      addToast('success', `${row.report_code} 제출 완료 처리되었습니다.`)
    },
  })
  const patchMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      patchVicsReport(id, { discrepancy_notes: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vicsReports'] })
      addToast('success', '불일치 메모를 저장했습니다.')
    },
  })
  const exportMut = useMutation({
    mutationFn: exportVicsReportXlsx,
    onSuccess: (blob, reportId) => {
      const row = rows.find((item) => item.id === reportId)
      const filename = row ? `VICS_${row.report_code}_${row.year}_${String(row.month).padStart(2, '0')}.xlsx` : 'vics_report.xlsx'
      downloadBlob(blob, filename)
      addToast('success', '엑셀 파일을 다운로드했습니다.')
    },
  })

  const reportByCode = useMemo(() => {
    const map = new Map<string, VicsMonthlyReport>()
    for (const row of rows) {
      map.set(row.report_code, row)
    }
    return map
  }, [rows])

  const selectedReport = reportByCode.get(selectedCode) || null

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">VICS 월보고</h2>
          <p className="page-subtitle">1308/1309/1329 데이터를 생성하고 확인·제출 상태를 관리합니다.</p>
        </div>
      </div>

      <div className="card-base">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">조합</label>
            <select className="form-input" value={fundId} onChange={(event) => setFundId(event.target.value ? Number(event.target.value) : '')}>
              <option value="">조합 선택</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>{fund.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">연도</label>
            <input type="number" className="form-input" value={year} onChange={(event) => setYear(Number(event.target.value || now.getFullYear()))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">월</label>
            <input type="number" min={1} max={12} className="form-input" value={month} onChange={(event) => setMonth(Number(event.target.value || 1))} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {REPORT_CODES.map((item) => {
          const row = reportByCode.get(item.code)
          return (
            <div key={item.code} className="card-base">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-[#0f1f3d]">{item.title}</p>
                <span className={statusClass(row?.status || 'draft')}>{statusLabel(row?.status || 'draft')}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  className="secondary-btn btn-sm"
                  onClick={() => setSelectedCode(item.code)}
                >
                  보기
                </button>
                {row ? (
                  <button
                    className="secondary-btn btn-sm"
                    onClick={() => exportMut.mutate(row.id)}
                    disabled={exportMut.isPending}
                  >
                    엑셀
                  </button>
                ) : (
                  <button
                    className="primary-btn btn-sm"
                    onClick={() => {
                      if (!fundId) {
                        addToast('warning', '조합을 먼저 선택해 주세요.')
                        return
                      }
                      generateMut.mutate({ fund_id: fundId, year, month, report_code: item.code })
                    }}
                    disabled={generateMut.isPending}
                  >
                    자동생성
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card-base">
        {isLoading ? (
          <PageLoading />
        ) : !selectedReport ? (
          <EmptyState emoji="📄" message="선택한 월/조합의 보고 데이터가 없습니다." className="py-8" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#0f1f3d]">
                {selectedReport.report_code} 상세
              </h3>
              <div className="flex flex-wrap gap-1">
                <button className="secondary-btn btn-sm" onClick={() => confirmMut.mutate(selectedReport.id)}>확인 완료</button>
                <button className="primary-btn btn-sm" onClick={() => submitMut.mutate(selectedReport.id)}>제출 완료</button>
                <button className="secondary-btn btn-sm" onClick={() => exportMut.mutate(selectedReport.id)}>엑셀 다운로드</button>
              </div>
            </div>

            {selectedReport.report_code === '1308' && (
              <div className="overflow-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                    <tr>
                      <th className="px-3 py-2 text-left">기업명</th>
                      <th className="px-3 py-2 text-left">투자일</th>
                      <th className="px-3 py-2 text-right">투자금액</th>
                      <th className="px-3 py-2 text-right">잔액</th>
                      <th className="px-3 py-2 text-right">지분율</th>
                      <th className="px-3 py-2 text-left">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {((selectedReport.data_json.investments as Array<Record<string, unknown>>) || []).map((item, idx) => (
                      <tr key={`1308-${idx}`}>
                        <td className="px-3 py-2">{String(item.company_name || '-')}</td>
                        <td className="px-3 py-2">{String(item.investment_date || '-')}</td>
                        <td className="px-3 py-2 text-right">{formatKRW(Number(item.investment_amount || 0))}</td>
                        <td className="px-3 py-2 text-right">{formatKRW(Number(item.current_balance || 0))}</td>
                        <td className="px-3 py-2 text-right">{Number(item.ownership_pct || 0).toFixed(2)}%</td>
                        <td className="px-3 py-2">{String(item.status || '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedReport.report_code !== '1308' && (
              <pre className="overflow-auto rounded border border-[#d8e5fb] bg-[#f5f9ff] p-3 text-xs text-[#0f1f3d]">
                {JSON.stringify(selectedReport.data_json, null, 2)}
              </pre>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-[#64748b]">불일치 원인 메모</label>
              <textarea
                className="form-input"
                rows={3}
                value={discrepancyNotes}
                onChange={(event) => setDiscrepancyNotes(event.target.value)}
                placeholder={selectedReport.discrepancy_notes || '불일치 원인 메모를 입력하세요'}
              />
              <div className="mt-2 flex justify-end">
                <button
                  className="secondary-btn btn-sm"
                  onClick={() => patchMut.mutate({ id: selectedReport.id, note: discrepancyNotes.trim() })}
                >
                  메모 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

