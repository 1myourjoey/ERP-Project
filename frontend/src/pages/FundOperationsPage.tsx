import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchCapitalCallDetails,
  fetchCapitalCallSummary,
  fetchCapitalCalls,
  fetchDistributionDetails,
  fetchDistributions,
  fetchFunds,
  generateCapitalCallDetails,
  generateDistributionDetails,
  updateCapitalCallDetail,
  updateDistributionDetail,
  type CapitalCall,
  type CapitalCallDetail,
  type CapitalCallSummary,
  type Distribution,
  type DistributionDetail,
  type Fund,
} from '../lib/api'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import { useToast } from '../contexts/ToastContext'
import { formatKRW } from '../lib/labels'

function toDateLabel(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

export default function FundOperationsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [selectedFundId, setSelectedFundId] = useState<number | null>(null)
  const [selectedCapitalCallId, setSelectedCapitalCallId] = useState<number | null>(null)
  const [selectedDistributionId, setSelectedDistributionId] = useState<number | null>(null)

  const { data: funds = [], isLoading: fundsLoading } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })

  useEffect(() => {
    if (!selectedFundId && funds.length > 0) {
      setSelectedFundId(funds[0].id)
    }
  }, [funds, selectedFundId])

  const { data: capitalCalls = [], isLoading: callsLoading } = useQuery<CapitalCall[]>({
    queryKey: ['capitalCalls', selectedFundId],
    queryFn: () => fetchCapitalCalls({ fund_id: selectedFundId || undefined }),
    enabled: selectedFundId !== null,
  })

  const { data: distributions = [], isLoading: distributionsLoading } = useQuery<Distribution[]>({
    queryKey: ['distributions', selectedFundId],
    queryFn: () => fetchDistributions({ fund_id: selectedFundId || undefined }),
    enabled: selectedFundId !== null,
  })

  const { data: callSummary } = useQuery<CapitalCallSummary>({
    queryKey: ['capitalCallSummary', selectedFundId],
    queryFn: () => fetchCapitalCallSummary(selectedFundId as number),
    enabled: selectedFundId !== null,
  })

  useEffect(() => {
    if (!selectedCapitalCallId && capitalCalls.length > 0) {
      setSelectedCapitalCallId(capitalCalls[0].id)
    }
    if (capitalCalls.length === 0) {
      setSelectedCapitalCallId(null)
    }
  }, [capitalCalls, selectedCapitalCallId])

  useEffect(() => {
    if (!selectedDistributionId && distributions.length > 0) {
      setSelectedDistributionId(distributions[0].id)
    }
    if (distributions.length === 0) {
      setSelectedDistributionId(null)
    }
  }, [distributions, selectedDistributionId])

  const { data: capitalCallDetails = [], isLoading: callDetailsLoading } = useQuery<CapitalCallDetail[]>({
    queryKey: ['capitalCallDetails', selectedCapitalCallId],
    queryFn: () => fetchCapitalCallDetails(selectedCapitalCallId as number),
    enabled: selectedCapitalCallId !== null,
  })

  const { data: distributionDetails = [], isLoading: distributionDetailsLoading } = useQuery<DistributionDetail[]>({
    queryKey: ['distributionDetails', selectedDistributionId],
    queryFn: () => fetchDistributionDetails(selectedDistributionId as number),
    enabled: selectedDistributionId !== null,
  })

  const generateCallDetailsMut = useMutation({
    mutationFn: (replaceExisting: boolean) => generateCapitalCallDetails(selectedCapitalCallId as number, replaceExisting),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capitalCallDetails', selectedCapitalCallId] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallSummary', selectedFundId] })
      addToast('success', '출자요청 LP 상세를 생성했습니다.')
    },
  })

  const updateCallDetailMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateCapitalCallDetail>[1] }) =>
      updateCapitalCallDetail(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capitalCallDetails', selectedCapitalCallId] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallSummary', selectedFundId] })
      addToast('success', '출자요청 상세를 업데이트했습니다.')
    },
  })

  const generateDistributionDetailsMut = useMutation({
    mutationFn: (replaceExisting: boolean) => generateDistributionDetails(selectedDistributionId as number, replaceExisting),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distributionDetails', selectedDistributionId] })
      addToast('success', '배분 LP 상세를 생성했습니다.')
    },
  })

  const updateDistributionDetailMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateDistributionDetail>[1] }) =>
      updateDistributionDetail(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distributionDetails', selectedDistributionId] })
      addToast('success', '배분 상세를 업데이트했습니다.')
    },
  })

  const totals = useMemo(() => {
    const commitment = Number(callSummary?.commitment_total || 0)
    const paidIn = Number(callSummary?.total_paid_in || 0)
    const unpaidLpCount = capitalCallDetails.filter((row) => Number(row.call_amount || 0) > Number(row.paid_amount || 0)).length
    const unpaidAmount = capitalCallDetails.reduce((sum, row) => {
      const diff = Number(row.call_amount || 0) - Number(row.paid_amount || 0)
      return sum + Math.max(diff, 0)
    }, 0)
    return {
      commitment,
      paidIn,
      paidInRatio: commitment > 0 ? (paidIn / commitment) * 100 : 0,
      unpaidLpCount,
      unpaidAmount,
    }
  }, [callSummary, capitalCallDetails])

  const isLoading = fundsLoading || callsLoading || distributionsLoading

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">조합 운영</h2>
          <p className="page-subtitle">LP별 출자요청/배분 계획을 자동 계산하고 납입 상태를 추적합니다.</p>
        </div>
      </div>

      {isLoading ? (
        <PageLoading />
      ) : (
        <>
          <div className="card-base">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748b]">조합</label>
                <select
                  value={selectedFundId || ''}
                  onChange={(e) => {
                    const next = Number(e.target.value) || null
                    setSelectedFundId(next)
                    setSelectedCapitalCallId(null)
                    setSelectedDistributionId(null)
                  }}
                  className="form-input"
                >
                  <option value="">조합 선택</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>{fund.name}</option>
                  ))}
                </select>
              </div>
              <div className="rounded bg-[#f5f9ff] p-2">
                <p className="text-xs text-[#64748b]">총 약정액</p>
                <p className="text-sm font-semibold text-[#0f1f3d]">{formatKRW(totals.commitment)}</p>
              </div>
              <div className="rounded bg-[#f5f9ff] p-2">
                <p className="text-xs text-[#64748b]">누적 납입액</p>
                <p className="text-sm font-semibold text-[#0f1f3d]">{formatKRW(totals.paidIn)}</p>
                <p className="text-[11px] text-[#64748b]">납입률 {totals.paidInRatio.toFixed(1)}%</p>
              </div>
              <div className="rounded bg-red-50 p-2">
                <p className="text-xs text-red-600">미납 LP / 미납액</p>
                <p className="text-sm font-semibold text-red-700">{totals.unpaidLpCount}명 · {formatKRW(totals.unpaidAmount)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="card-base">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0f1f3d]">출자요청 LP 상세</h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => generateCallDetailsMut.mutate(true)}
                    disabled={!selectedCapitalCallId || generateCallDetailsMut.isPending}
                    className="secondary-btn"
                  >
                    자동생성
                  </button>
                </div>
              </div>

              <div className="mb-2">
                <label className="mb-1 block text-xs font-medium text-[#64748b]">출자요청 선택</label>
                <select
                  value={selectedCapitalCallId || ''}
                  onChange={(e) => setSelectedCapitalCallId(e.target.value ? Number(e.target.value) : null)}
                  className="form-input"
                >
                  <option value="">출자요청 선택</option>
                  {capitalCalls.map((row) => (
                    <option key={row.id} value={row.id}>
                      #{row.id} · {toDateLabel(row.call_date)} · {formatKRW(row.total_amount)}
                    </option>
                  ))}
                </select>
              </div>

              {callDetailsLoading ? (
                <PageLoading />
              ) : !selectedCapitalCallId ? (
                <EmptyState emoji="📮" message="출자요청을 선택해 주세요." className="py-6" />
              ) : !capitalCallDetails.length ? (
                <EmptyState emoji="🧾" message="LP 상세가 없습니다. 자동생성 버튼으로 생성하세요." className="py-6" />
              ) : (
                <div className="space-y-2">
                  {capitalCallDetails.map((row) => {
                    const paidAmount = Number(row.paid_amount || 0)
                    const callAmount = Number(row.call_amount || 0)
                    const unpaid = Math.max(callAmount - paidAmount, 0)
                    return (
                      <div key={row.id} className="rounded-lg border border-[#d8e5fb] p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-[#0f1f3d]">{row.lp_name || `LP #${row.lp_id}`}</p>
                            <p className="text-xs text-[#64748b]">
                              호출액 {formatKRW(callAmount)} · 납입액 {formatKRW(paidAmount)} · 미납 {formatKRW(unpaid)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${unpaid > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                              {row.status}
                            </span>
                            <button
                              onClick={() => updateCallDetailMut.mutate({ id: row.id, data: { paid_amount: 0, status: '미납', paid_date: null } })}
                              className="secondary-btn"
                            >
                              미납
                            </button>
                            <button
                              onClick={() => updateCallDetailMut.mutate({ id: row.id, data: { paid_amount: callAmount, status: '완납' } })}
                              className="primary-btn"
                            >
                              완납
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="card-base">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0f1f3d]">배분 LP 상세</h3>
                <button
                  onClick={() => generateDistributionDetailsMut.mutate(true)}
                  disabled={!selectedDistributionId || generateDistributionDetailsMut.isPending}
                  className="secondary-btn"
                >
                  자동생성
                </button>
              </div>

              <div className="mb-2">
                <label className="mb-1 block text-xs font-medium text-[#64748b]">배분 선택</label>
                <select
                  value={selectedDistributionId || ''}
                  onChange={(e) => setSelectedDistributionId(e.target.value ? Number(e.target.value) : null)}
                  className="form-input"
                >
                  <option value="">배분 선택</option>
                  {distributions.map((row) => (
                    <option key={row.id} value={row.id}>
                      #{row.id} · {toDateLabel(row.dist_date)} · {formatKRW(Number(row.principal_total || 0) + Number(row.profit_total || 0))}
                    </option>
                  ))}
                </select>
              </div>

              {distributionDetailsLoading ? (
                <PageLoading />
              ) : !selectedDistributionId ? (
                <EmptyState emoji="💸" message="배분을 선택해 주세요." className="py-6" />
              ) : !distributionDetails.length ? (
                <EmptyState emoji="📄" message="배분 상세가 없습니다. 자동생성 버튼으로 생성하세요." className="py-6" />
              ) : (
                <div className="space-y-2">
                  {distributionDetails.map((row) => (
                    <div key={row.id} className="rounded-lg border border-[#d8e5fb] p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[#0f1f3d]">{row.lp_name || `LP #${row.lp_id}`}</p>
                          <p className="text-xs text-[#64748b]">
                            배분액 {formatKRW(Number(row.distribution_amount || 0))} · 유형 {row.distribution_type}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${row.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {row.paid ? '지급완료' : '지급대기'}
                          </span>
                          <button
                            onClick={() => updateDistributionDetailMut.mutate({ id: row.id, data: { paid: !row.paid } })}
                            className="primary-btn"
                          >
                            {row.paid ? '대기 전환' : '지급 완료'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}


