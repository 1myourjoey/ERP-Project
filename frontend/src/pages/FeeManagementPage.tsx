import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  calculateManagementFee,
  fetchFeeConfig,
  fetchFeeWaterfall,
  fetchFunds,
  fetchManagementFees,
  fetchManagementFeesByFund,
  fetchPerformanceFeeSimulations,
  simulatePerformanceFee,
  updateFeeConfig,
  updateManagementFee,
  updatePerformanceFeeSimulation,
  type FeeConfigInput,
  type Fund,
  type ManagementFeeResponse,
  type PerformanceFeeSimulationResponse,
  type WaterfallResponse,
} from '../lib/api'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import { useToast } from '../contexts/ToastContext'
import { formatKRW } from '../lib/labels'

type TabKey = 'overview' | 'management' | 'performance'

function toDateLabel(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

export default function FeeManagementPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [selectedFundId, setSelectedFundId] = useState<number | null>(null)
  const [calcYear, setCalcYear] = useState<number>(new Date().getFullYear())
  const [calcQuarter, setCalcQuarter] = useState<number>(Math.ceil((new Date().getMonth() + 1) / 3))
  const [scenario, setScenario] = useState<'worst' | 'base' | 'best'>('base')

  const { data: funds = [] } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })

  useEffect(() => {
    if (!selectedFundId && funds.length > 0) {
      setSelectedFundId(funds[0].id)
    }
  }, [funds, selectedFundId])

  const { data: allManagementFees = [], isLoading: overviewLoading } = useQuery<ManagementFeeResponse[]>({
    queryKey: ['fees', 'management'],
    queryFn: () => fetchManagementFees(),
  })

  const { data: managementFees = [], isLoading: managementLoading } = useQuery<ManagementFeeResponse[]>({
    queryKey: ['fees', 'management', selectedFundId],
    queryFn: () => fetchManagementFeesByFund(selectedFundId as number),
    enabled: selectedFundId !== null,
  })

  const { data: feeConfig, isLoading: configLoading } = useQuery({
    queryKey: ['fees', 'config', selectedFundId],
    queryFn: () => fetchFeeConfig(selectedFundId as number),
    enabled: selectedFundId !== null,
  })

  const { data: performanceRows = [], isLoading: performanceLoading } = useQuery<PerformanceFeeSimulationResponse[]>({
    queryKey: ['fees', 'performance', selectedFundId],
    queryFn: () => fetchPerformanceFeeSimulations(selectedFundId as number),
    enabled: selectedFundId !== null,
  })

  const { data: waterfall, isLoading: waterfallLoading } = useQuery<WaterfallResponse>({
    queryKey: ['fees', 'waterfall', selectedFundId],
    queryFn: () => fetchFeeWaterfall(selectedFundId as number),
    enabled: selectedFundId !== null && performanceRows.length > 0,
    retry: false,
  })

  const updateConfigMut = useMutation({
    mutationFn: (data: FeeConfigInput) => updateFeeConfig(selectedFundId as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees', 'config', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['fees', 'management'] })
      addToast('success', '보수 설정을 저장했습니다.')
    },
  })

  const calculateMut = useMutation({
    mutationFn: () => calculateManagementFee({ fund_id: selectedFundId as number, year: calcYear, quarter: calcQuarter }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees', 'management'] })
      queryClient.invalidateQueries({ queryKey: ['fees', 'management', selectedFundId] })
      addToast('success', '관리보수를 계산했습니다.')
    },
  })

  const updateManagementMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateManagementFee(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees', 'management'] })
      queryClient.invalidateQueries({ queryKey: ['fees', 'management', selectedFundId] })
      addToast('success', '관리보수 상태를 업데이트했습니다.')
    },
  })

  const simulateMut = useMutation({
    mutationFn: () =>
      simulatePerformanceFee({
        fund_id: selectedFundId as number,
        simulation_date: new Date().toISOString().slice(0, 10),
        scenario,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees', 'performance', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['fees', 'waterfall', selectedFundId] })
      addToast('success', '성과보수 시뮬레이션을 실행했습니다.')
    },
  })

  const updatePerformanceMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updatePerformanceFeeSimulation(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees', 'performance', selectedFundId] })
      addToast('success', '성과보수 상태를 업데이트했습니다.')
    },
  })

  const summaryByFund = useMemo(() => {
    const map = new Map<number, { totalFee: number; unpaidCount: number }>()
    for (const row of allManagementFees) {
      const current = map.get(row.fund_id) || { totalFee: 0, unpaidCount: 0 }
      current.totalFee += Number(row.fee_amount || 0)
      if (row.status !== '수령') current.unpaidCount += 1
      map.set(row.fund_id, current)
    }
    return map
  }, [allManagementFees])

  const [draftConfig, setDraftConfig] = useState<FeeConfigInput | null>(null)
  useEffect(() => {
    if (feeConfig) {
      setDraftConfig({
        mgmt_fee_rate: feeConfig.mgmt_fee_rate,
        mgmt_fee_basis: feeConfig.mgmt_fee_basis,
        mgmt_fee_period: feeConfig.mgmt_fee_period,
        liquidation_fee_rate: feeConfig.liquidation_fee_rate,
        liquidation_fee_basis: feeConfig.liquidation_fee_basis,
        hurdle_rate: feeConfig.hurdle_rate,
        carry_rate: feeConfig.carry_rate,
        catch_up_rate: feeConfig.catch_up_rate,
        clawback: feeConfig.clawback,
      })
    }
  }, [feeConfig])

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">보수 관리</h2>
          <p className="page-subtitle">관리보수 계산, 성과보수 시뮬레이션, 워터폴 분배를 운영합니다.</p>
        </div>
      </div>

      <div className="card-base">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
            <select
              value={selectedFundId || ''}
              onChange={(e) => setSelectedFundId(e.target.value ? Number(e.target.value) : null)}
              className="form-input"
            >
              <option value="">조합 선택</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>{fund.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 flex flex-wrap items-end gap-2">
            <button onClick={() => setActiveTab('overview')} className={`rounded px-3 py-1.5 text-sm ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}>보수 현황</button>
            <button onClick={() => setActiveTab('management')} className={`rounded px-3 py-1.5 text-sm ${activeTab === 'management' ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}>관리보수</button>
            <button onClick={() => setActiveTab('performance')} className={`rounded px-3 py-1.5 text-sm ${activeTab === 'performance' ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}>성과보수</button>
          </div>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="card-base">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">조합별 보수 현황</h3>
          {overviewLoading ? (
            <PageLoading />
          ) : !funds.length ? (
            <EmptyState emoji="💼" message="조합 데이터가 없습니다." className="py-8" />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">조합</th>
                    <th className="px-3 py-2 text-right">누적 관리보수</th>
                    <th className="px-3 py-2 text-right">미수령 건수</th>
                    <th className="px-3 py-2 text-left">성과보수 최근상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {funds.map((fund) => {
                    const summary = summaryByFund.get(fund.id) || { totalFee: 0, unpaidCount: 0 }
                    const latestPerf = performanceRows.find((row) => row.fund_id === fund.id)
                    return (
                      <tr key={fund.id}>
                        <td className="px-3 py-2">{fund.name}</td>
                        <td className="px-3 py-2 text-right">{formatKRW(summary.totalFee)}</td>
                        <td className="px-3 py-2 text-right">{summary.unpaidCount}</td>
                        <td className="px-3 py-2">{latestPerf?.status || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'management' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">보수 설정</h3>
            {configLoading || !draftConfig ? (
              <PageLoading />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">관리보수율</label>
                    <input type="number" step="0.0001" value={draftConfig.mgmt_fee_rate} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, mgmt_fee_rate: Number(e.target.value || 0) } : prev)} className="form-input" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">관리보수 기준</label>
                    <select value={draftConfig.mgmt_fee_basis} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, mgmt_fee_basis: e.target.value } : prev)} className="form-input">
                      <option value="commitment">commitment</option>
                      <option value="nav">nav</option>
                      <option value="invested">invested</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">허들율</label>
                    <input type="number" step="0.0001" value={draftConfig.hurdle_rate} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, hurdle_rate: Number(e.target.value || 0) } : prev)} className="form-input" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">캐리율</label>
                    <input type="number" step="0.0001" value={draftConfig.carry_rate} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, carry_rate: Number(e.target.value || 0) } : prev)} className="form-input" />
                  </div>
                </div>
                <button onClick={() => updateConfigMut.mutate(draftConfig)} className="primary-btn mt-3">설정 저장</button>
              </>
            )}
          </div>

          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">분기 관리보수 계산</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <input type="number" value={calcYear} onChange={(e) => setCalcYear(Number(e.target.value || new Date().getFullYear()))} className="rounded border px-2 py-1 text-sm" placeholder="연도" />
              <select value={calcQuarter} onChange={(e) => setCalcQuarter(Number(e.target.value || 1))} className="rounded border px-2 py-1 text-sm">
                <option value={1}>1Q</option>
                <option value={2}>2Q</option>
                <option value={3}>3Q</option>
                <option value={4}>4Q</option>
              </select>
              <button onClick={() => calculateMut.mutate()} className="primary-btn" disabled={!selectedFundId || calculateMut.isPending}>계산 실행</button>
            </div>

            {managementLoading ? (
              <PageLoading />
            ) : !managementFees.length ? (
              <EmptyState emoji="🧮" message="관리보수 이력이 없습니다." className="py-6" />
            ) : (
              <div className="mt-3 space-y-2">
                {managementFees.map((row) => (
                  <div key={row.id} className="rounded border border-gray-200 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-gray-800">{row.year} Q{row.quarter} · {formatKRW(row.fee_amount)} · {row.fee_basis}</p>
                      <div className="flex gap-1">
                        <button onClick={() => updateManagementMut.mutate({ id: row.id, status: '청구' })} className="secondary-btn">청구</button>
                        <button onClick={() => updateManagementMut.mutate({ id: row.id, status: '수령' })} className="primary-btn">수령</button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">기준금액 {formatKRW(row.basis_amount)} · 상태 {row.status}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">성과보수 시뮬레이션</h3>
            <div className="flex flex-wrap gap-2">
              <select value={scenario} onChange={(e) => setScenario(e.target.value as 'worst' | 'base' | 'best')} className="rounded border px-2 py-1 text-sm">
                <option value="worst">worst</option>
                <option value="base">base</option>
                <option value="best">best</option>
              </select>
              <button onClick={() => simulateMut.mutate()} disabled={!selectedFundId || simulateMut.isPending} className="primary-btn">시뮬레이션 실행</button>
            </div>

            {performanceLoading ? (
              <PageLoading />
            ) : !performanceRows.length ? (
              <EmptyState emoji="📈" message="성과보수 시뮬레이션 이력이 없습니다." className="py-6" />
            ) : (
              <div className="mt-3 space-y-2">
                {performanceRows.map((row) => (
                  <div key={row.id} className="rounded border border-gray-200 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-gray-800">{toDateLabel(row.simulation_date)} · {row.scenario}</p>
                      <div className="flex gap-1">
                        <button onClick={() => updatePerformanceMut.mutate({ id: row.id, status: '확정' })} className="secondary-btn">확정</button>
                        <button onClick={() => updatePerformanceMut.mutate({ id: row.id, status: '지급' })} className="primary-btn">지급</button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      분배총액 {formatKRW(row.total_distributed || 0)} · Carry {formatKRW(row.carry_amount || 0)} · LP 순수익 {formatKRW(row.lp_net_return || 0)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">워터폴</h3>
            {waterfallLoading ? (
              <PageLoading />
            ) : !waterfall ? (
              <EmptyState emoji="🌊" message="표시할 워터폴 데이터가 없습니다." className="py-8" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="rounded bg-gray-50 p-2">총 분배액: {formatKRW(waterfall.total_distributed)}</div>
                <div className="rounded bg-blue-50 p-2">LP 원금 반환: {formatKRW(waterfall.lp_return_of_capital)}</div>
                <div className="rounded bg-blue-50 p-2">LP 허들 수익: {formatKRW(waterfall.lp_hurdle_return)}</div>
                <div className="rounded bg-emerald-50 p-2">GP Catch-up: {formatKRW(waterfall.gp_catch_up)}</div>
                <div className="rounded bg-emerald-50 p-2">GP Carry: {formatKRW(waterfall.gp_carry)}</div>
                <div className="rounded bg-blue-50 p-2">LP 잔여: {formatKRW(waterfall.lp_residual)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

