import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, Building2 } from 'lucide-react'
import {
  fetchCapitalCallItems,
  fetchCapitalCalls,
  fetchDistributions,
  fetchFunds,
  type CapitalCall,
  type CapitalCallItem,
  type Distribution,
  type Fund,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'

interface FundCapitalRow {
  id: number
  name: string
  type: string | null
  formationDate: string | null
  status: string
  commitmentTotal: number
  paidInTotal: number
  paidInRatio: number
  outstandingUnpaid: number
  distributedTotal: number
  distributedRatio: number
}

function safeNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function toDateLabel(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function toRatioLabel(value: number): string {
  return `${value.toFixed(1)}%`
}

export default function FundOperationsPage() {
  const navigate = useNavigate()

  const { data: funds = [], isLoading: isFundsLoading } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })

  const { data: capitalCalls = [], isLoading: isCallsLoading } = useQuery<CapitalCall[]>({
    queryKey: ['capitalCalls', { scope: 'all' }],
    queryFn: () => fetchCapitalCalls(),
  })

  const { data: distributions = [], isLoading: isDistributionsLoading } = useQuery<Distribution[]>({
    queryKey: ['distributions', { scope: 'all' }],
    queryFn: () => fetchDistributions(),
  })

  const callIdsKey = useMemo(
    () => (capitalCalls.length > 0 ? capitalCalls.map((call) => call.id).join(',') : 'none'),
    [capitalCalls],
  )

  const { data: callItemsByCallId = {}, isLoading: isCallItemsLoading } = useQuery<Record<number, CapitalCallItem[]>>({
    queryKey: ['capitalCallItemsByCallId', 'global', callIdsKey],
    queryFn: async () => {
      const entries = await Promise.all(
        capitalCalls.map(async (call) => {
          const items = await fetchCapitalCallItems(call.id)
          return [call.id, items] as const
        }),
      )
      return Object.fromEntries(entries)
    },
    enabled: capitalCalls.length > 0,
  })

  const rows = useMemo<FundCapitalRow[]>(() => {
    const callsByFund = new Map<number, CapitalCall[]>()
    for (const call of capitalCalls) {
      const fundCalls = callsByFund.get(call.fund_id) ?? []
      fundCalls.push(call)
      callsByFund.set(call.fund_id, fundCalls)
    }

    const distributionsByFund = new Map<number, Distribution[]>()
    for (const row of distributions) {
      const fundDistributions = distributionsByFund.get(row.fund_id) ?? []
      fundDistributions.push(row)
      distributionsByFund.set(row.fund_id, fundDistributions)
    }

    return [...funds]
      .map((fund) => {
        const commitmentTotal = safeNumber(fund.commitment_total)
        const fundCalls = callsByFund.get(fund.id) ?? []

        let paidInFromCalls = 0
        let outstandingUnpaid = 0

        for (const call of fundCalls) {
          const items = callItemsByCallId[call.id] ?? []
          if (items.length === 0) {
            outstandingUnpaid += safeNumber(call.total_amount)
            continue
          }

          for (const item of items) {
            const amount = safeNumber(item.amount)
            if (item.paid) {
              paidInFromCalls += amount
            } else {
              outstandingUnpaid += amount
            }
          }
        }

        const fallbackPaidIn = safeNumber(fund.paid_in_total)
        const paidInTotal = paidInFromCalls > 0 ? paidInFromCalls : fallbackPaidIn

        const distributedTotal = (distributionsByFund.get(fund.id) ?? []).reduce(
          (sum, row) => sum + safeNumber(row.principal_total) + safeNumber(row.profit_total),
          0,
        )

        const paidInRatio = commitmentTotal > 0 ? (paidInTotal / commitmentTotal) * 100 : 0
        const distributedRatio = commitmentTotal > 0 ? (distributedTotal / commitmentTotal) * 100 : 0

        return {
          id: fund.id,
          name: fund.name,
          type: fund.type,
          formationDate: fund.formation_date,
          status: fund.status,
          commitmentTotal,
          paidInTotal,
          paidInRatio,
          outstandingUnpaid,
          distributedTotal,
          distributedRatio,
        }
      })
      .sort((a, b) => {
        const byFormationDate = (a.formationDate || '').localeCompare(b.formationDate || '')
        if (byFormationDate !== 0) return byFormationDate
        return a.name.localeCompare(b.name, 'ko')
      })
  }, [callItemsByCallId, capitalCalls, distributions, funds])

  const totals = useMemo(() => {
    const commitmentTotal = rows.reduce((sum, row) => sum + row.commitmentTotal, 0)
    const paidInTotal = rows.reduce((sum, row) => sum + row.paidInTotal, 0)
    const outstandingUnpaid = rows.reduce((sum, row) => sum + row.outstandingUnpaid, 0)
    const distributedTotal = rows.reduce((sum, row) => sum + row.distributedTotal, 0)

    return {
      commitmentTotal,
      paidInTotal,
      outstandingUnpaid,
      distributedTotal,
      paidInRatio: commitmentTotal > 0 ? (paidInTotal / commitmentTotal) * 100 : 0,
      distributedRatio: commitmentTotal > 0 ? (distributedTotal / commitmentTotal) * 100 : 0,
    }
  }, [rows])

  const isLoading = isFundsLoading || isCallsLoading || isDistributionsLoading || isCallItemsLoading

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">조합 운영</h2>
          <p className="page-subtitle">운용 중인 전체 조합의 자본 상태를 한 화면에서 점검합니다.</p>
        </div>
      </div>

      {isLoading ? (
        <PageLoading />
      ) : rows.length === 0 ? (
        <EmptyState emoji="🏛️" message="등록된 조합이 없습니다." className="py-10" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="card-base p-3">
              <p className="text-xs text-gray-500">운용 조합 수</p>
              <p className="mt-1 text-lg font-bold text-gray-800">{rows.length}개</p>
            </div>
            <div className="card-base p-3">
              <p className="text-xs text-gray-500">총 약정액</p>
              <p className="mt-1 text-lg font-bold text-gray-800">{formatKRW(totals.commitmentTotal)}</p>
            </div>
            <div className="card-base p-3">
              <p className="text-xs text-gray-500">누적 납입액</p>
              <p className="mt-1 text-lg font-bold text-gray-800">{formatKRW(totals.paidInTotal)}</p>
              <p className="mt-0.5 text-[11px] text-gray-500">납입률 {toRatioLabel(totals.paidInRatio)}</p>
            </div>
            <div className="card-base p-3">
              <p className="text-xs text-gray-500">미납 요청액</p>
              <p className={`mt-1 text-lg font-bold ${totals.outstandingUnpaid > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                {formatKRW(totals.outstandingUnpaid)}
              </p>
            </div>
          </div>

          <div className="card-base overflow-hidden">
            <div className="overflow-auto">
              <table className="min-w-[1240px] w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">조합명</th>
                    <th className="px-3 py-2 text-left">구분</th>
                    <th className="px-3 py-2 text-left">결성일</th>
                    <th className="px-3 py-2 text-right">총 약정액</th>
                    <th className="px-3 py-2 text-right">누적 출자액(납입률)</th>
                    <th className="px-3 py-2 text-right">현재 미납 요청액</th>
                    <th className="px-3 py-2 text-right">누적 배분액(배분률)</th>
                    <th className="px-3 py-2 text-left">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-blue-50/40"
                      onClick={() => navigate(`/funds/${row.id}`)}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="group inline-flex items-center gap-1 text-left"
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(`/funds/${row.id}`)
                          }}
                        >
                          <span className="font-medium text-gray-800 group-hover:text-blue-700">{row.name}</span>
                          <ArrowUpRight size={14} className="text-gray-400 group-hover:text-blue-600" />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{row.type || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{toDateLabel(row.formationDate)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-800">{formatKRW(row.commitmentTotal)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        <div>{formatKRW(row.paidInTotal)}</div>
                        <div className="text-[11px] text-gray-500">{toRatioLabel(row.paidInRatio)}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={row.outstandingUnpaid > 0 ? 'font-semibold text-red-600' : 'text-gray-700'}>
                          {formatKRW(row.outstandingUnpaid)}
                        </span>
                        {row.outstandingUnpaid > 0 ? (
                          <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                            주의
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        <div>{formatKRW(row.distributedTotal)}</div>
                        <div className="text-[11px] text-gray-500">{toRatioLabel(row.distributedRatio)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {labelStatus(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-800">
                    <td className="px-3 py-2">우리 회사 총합</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{formatKRW(totals.commitmentTotal)}</td>
                    <td className="px-3 py-2 text-right">
                      {formatKRW(totals.paidInTotal)}
                      <div className="text-[11px] font-normal text-gray-500">{toRatioLabel(totals.paidInRatio)}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={totals.outstandingUnpaid > 0 ? 'text-red-600' : ''}>{formatKRW(totals.outstandingUnpaid)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatKRW(totals.distributedTotal)}
                      <div className="text-[11px] font-normal text-gray-500">{toRatioLabel(totals.distributedRatio)}</div>
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>

            {totals.outstandingUnpaid > 0 ? (
              <div className="flex items-center gap-2 border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
                <AlertTriangle size={14} />
                <span>미납 요청액이 있는 조합이 있습니다. 해당 행을 눌러 상세 화면에서 조치해 주세요.</span>
              </div>
            ) : null}
          </div>

          <div className="text-xs text-gray-500">
            <div className="inline-flex items-center gap-1">
              <Building2 size={12} />
              조합명을 클릭하면 해당 조합 상세 페이지로 이동합니다.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
