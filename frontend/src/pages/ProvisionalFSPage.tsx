import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import FSOverview from '../components/provisional/FSOverview'
import { useToast } from '../contexts/ToastContext'
import {
  confirmProvisionalFS,
  downloadProvisionalFS,
  fetchAccounts,
  fetchBankTransactions,
  fetchFunds,
  fetchMappingRules,
  fetchProvisionalFS,
  generateProvisionalFS,
  manualMapBankTransaction,
  parseBankTransactionsFromText,
  runAutoJournal,
  uploadBankTransactionsFile,
  type Account,
  type AutoJournalResult,
  type BankTransaction,
  type Fund,
  type ProvisionalFS,
} from '../lib/api'
import { formatKRW } from '../lib/labels'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import SectionScaffold from '../components/common/page/SectionScaffold'
import WorkbenchSplit from '../components/common/page/WorkbenchSplit'
import FinanceTabStrip from '../components/finance/FinanceTabStrip'
import ProvisionalStepRail from '../components/finance/ProvisionalStepRail'

type FsTabKey = 'sfp' | 'is'

type ManualMappingDraft = {
  debit_account_id: number
  credit_account_id: number
  learn: boolean
}

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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

function inferDirection(txn: BankTransaction): 'deposit' | 'withdrawal' {
  return txn.deposit > 0 ? 'deposit' : 'withdrawal'
}

function prettyStatus(status: string): string {
  if (status === 'confirmed') return '확정 완료'
  if (status === 'draft') return '초안'
  if (status === 'exported') return '다운로드 완료'
  return status
}

function statusTone(status: string): 'default' | 'warning' | 'success' {
  if (status === 'confirmed' || status === 'exported') return 'success'
  if (status === 'draft') return 'warning'
  return 'default'
}

export default function ProvisionalFSPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [fundId, setFundId] = useState<number | null>(null)
  const [yearMonth, setYearMonth] = useState(currentYearMonth())
  const [clipboardText, setClipboardText] = useState('')
  const [activeTab, setActiveTab] = useState<FsTabKey>('sfp')
  const [manualMapDrafts, setManualMapDrafts] = useState<Record<number, ManualMappingDraft>>({})
  const [lastAutoResult, setLastAutoResult] = useState<AutoJournalResult | null>(null)
  const [selectedTxnId, setSelectedTxnId] = useState<number | null>(null)

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })

  const selectedFundId = useMemo(() => fundId || funds[0]?.id || null, [fundId, funds])
  const selectedFund = useMemo(
    () => funds.find((fund) => fund.id === selectedFundId) ?? null,
    [funds, selectedFundId],
  )

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', selectedFundId],
    queryFn: () => fetchAccounts({ fund_id: selectedFundId as number }),
    enabled: !!selectedFundId,
  })

  const { data: bankTxns = [] } = useQuery<BankTransaction[]>({
    queryKey: ['bankTransactions', selectedFundId, yearMonth],
    queryFn: () => fetchBankTransactions(selectedFundId as number, { year_month: yearMonth }),
    enabled: !!selectedFundId,
  })

  const { data: mappingRules = [] } = useQuery({
    queryKey: ['mappingRules', selectedFundId],
    queryFn: () => fetchMappingRules(selectedFundId as number),
    enabled: !!selectedFundId,
  })

  const { data: provisionalFs } = useQuery<ProvisionalFS | null>({
    queryKey: ['provisionalFs', selectedFundId, yearMonth],
    queryFn: () => fetchProvisionalFS(selectedFundId as number, yearMonth),
    enabled: !!selectedFundId,
  })

  const parseTextMut = useMutation({
    mutationFn: async () => {
      if (!selectedFundId) throw new Error('조합을 선택하세요.')
      const text = clipboardText.trim()
      if (!text) throw new Error('복사한 입출금 내역을 입력하세요.')
      return parseBankTransactionsFromText(selectedFundId, { text })
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] })
      queryClient.invalidateQueries({ queryKey: ['provisionalFsOverview'] })
      addToast('success', `입출금 내역 ${result.created_count}건을 저장했습니다.`)
    },
  })

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedFundId) throw new Error('조합을 선택하세요.')
      return uploadBankTransactionsFile(selectedFundId, file)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] })
      queryClient.invalidateQueries({ queryKey: ['provisionalFsOverview'] })
      addToast('success', `엑셀 내역 ${result.created_count}건을 저장했습니다.`)
    },
  })

  const autoJournalMut = useMutation({
    mutationFn: async () => {
      if (!selectedFundId) throw new Error('조합을 선택하세요.')
      return runAutoJournal(selectedFundId, { year_month: yearMonth })
    },
    onSuccess: (result) => {
      setLastAutoResult(result)
      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] })
      queryClient.invalidateQueries({ queryKey: ['provisionalFsOverview'] })
      addToast('success', `자동 매핑 ${result.mapped_count}건, 수동 확인 ${result.unmapped_count}건`)
    },
  })

  const manualMapMut = useMutation({
    mutationFn: async ({ txnId, draft }: { txnId: number; draft: ManualMappingDraft }) => {
      if (!selectedFundId) throw new Error('조합을 선택하세요.')
      return manualMapBankTransaction(selectedFundId, txnId, {
        debit_account_id: draft.debit_account_id,
        credit_account_id: draft.credit_account_id,
        learn: draft.learn,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] })
      queryClient.invalidateQueries({ queryKey: ['mappingRules'] })
      queryClient.invalidateQueries({ queryKey: ['provisionalFsOverview'] })
      addToast('success', '수동 매핑을 저장했습니다.')
    },
  })

  const generateFsMut = useMutation({
    mutationFn: async () => {
      if (!selectedFundId) throw new Error('조합을 선택하세요.')
      return generateProvisionalFS(selectedFundId, yearMonth)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provisionalFs'] })
      queryClient.invalidateQueries({ queryKey: ['provisionalFsOverview'] })
      addToast('success', '가결산을 생성했습니다.')
    },
  })

  const confirmMut = useMutation({
    mutationFn: async () => {
      if (!provisionalFs?.id) throw new Error('먼저 가결산을 생성하세요.')
      return confirmProvisionalFS(provisionalFs.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provisionalFs'] })
      queryClient.invalidateQueries({ queryKey: ['provisionalFsOverview'] })
      addToast('success', '가결산을 확정했습니다.')
    },
  })

  const unmappedTxns = useMemo(() => bankTxns.filter((txn) => !txn.journal_entry_id), [bankTxns])

  const totalWithdrawal = useMemo(
    () => bankTxns.reduce((sum, txn) => sum + Number(txn.withdrawal || 0), 0),
    [bankTxns],
  )
  const totalDeposit = useMemo(
    () => bankTxns.reduce((sum, txn) => sum + Number(txn.deposit || 0), 0),
    [bankTxns],
  )

  const accountOptions = useMemo(
    () => accounts.map((account) => ({
      id: account.id,
      label: `${account.code} ${account.name}`,
    })),
    [accounts],
  )

  const getDraft = (txn: BankTransaction): ManualMappingDraft => {
    const draft = manualMapDrafts[txn.id]
    if (draft) return draft

    const direction = inferDirection(txn)
    const haystack = `${txn.counterparty || ''} ${txn.description || ''}`.toLowerCase()
    const suggestion = mappingRules.find((rule) =>
      rule.direction === direction && haystack.includes((rule.keyword || '').toLowerCase()),
    )

    if (suggestion) {
      return {
        debit_account_id: suggestion.debit_account_id,
        credit_account_id: suggestion.credit_account_id,
        learn: true,
      }
    }

    return {
      debit_account_id: accountOptions[0]?.id ?? 0,
      credit_account_id: accountOptions[0]?.id ?? 0,
      learn: true,
    }
  }

  const setDraft = (txnId: number, value: Partial<ManualMappingDraft>) => {
    setManualMapDrafts((prev) => {
      const current = prev[txnId]
      const base = current ?? {
        debit_account_id: accountOptions[0]?.id ?? 0,
        credit_account_id: accountOptions[0]?.id ?? 0,
        learn: true,
      }
      return {
        ...prev,
        [txnId]: {
          ...base,
          ...value,
        },
      }
    })
  }

  const selectedUnmappedTxn = useMemo(() => {
    if (!unmappedTxns.length) return null
    return unmappedTxns.find((txn) => txn.id === selectedTxnId) || unmappedTxns[0]
  }, [selectedTxnId, unmappedTxns])

  const selectedDraft = selectedUnmappedTxn ? getDraft(selectedUnmappedTxn) : null

  const stepItems = useMemo<Array<{ id: string; label: string; description: string; tone?: 'default' | 'info' | 'warning' | 'success' }>>(
    () => [
      {
        id: 'input',
        label: '입출금 입력',
        description: bankTxns.length ? `${bankTxns.length}건 적재됨` : '텍스트 또는 엑셀 업로드',
        tone: bankTxns.length ? 'success' : 'default',
      },
      {
        id: 'review',
        label: '거래 확인',
        description: `입금 ${formatKRW(totalDeposit)} · 출금 ${formatKRW(totalWithdrawal)}`,
        tone: bankTxns.length ? 'info' : 'default',
      },
      {
        id: 'mapping',
        label: '자동 분개/수동 매핑',
        description: unmappedTxns.length ? `수동 확인 ${unmappedTxns.length}건` : '미매핑 없음',
        tone: unmappedTxns.length ? 'warning' : 'success',
      },
      {
        id: 'statement',
        label: '가결산 재무제표',
        description: provisionalFs ? prettyStatus(provisionalFs.status) : '미생성',
        tone: provisionalFs?.status === 'confirmed' ? 'success' : provisionalFs ? 'warning' : 'default',
      },
    ],
    [bankTxns.length, provisionalFs, totalDeposit, totalWithdrawal, unmappedTxns.length],
  )

  const renderSfp = (data: Record<string, number>) => (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      <div className="finance-kpi-card">
        <p className="finance-kpi-label">유동자산</p>
        <p className="finance-kpi-value">{formatKRW(data.current_assets || 0)}</p>
      </div>
      <div className="finance-kpi-card">
        <p className="finance-kpi-label">투자자산</p>
        <p className="finance-kpi-value">{formatKRW(data.investment_assets || 0)}</p>
      </div>
      <div className="finance-kpi-card">
        <p className="finance-kpi-label">부채총계</p>
        <p className="finance-kpi-value">{formatKRW(data.total_liabilities || 0)}</p>
      </div>
      <div className="finance-kpi-card">
        <p className="finance-kpi-label">자본총계</p>
        <p className="finance-kpi-value">{formatKRW(data.total_equity || 0)}</p>
      </div>
      <div className="finance-kpi-card md:col-span-2 xl:col-span-2">
        <p className="finance-kpi-label">자산총계</p>
        <p className="finance-kpi-value text-[#1a3660]">{formatKRW(data.total_assets || 0)}</p>
      </div>
    </div>
  )

  const renderIs = (data: Record<string, number>) => (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
      <div className="finance-kpi-card">
        <p className="finance-kpi-label">영업수익</p>
        <p className="finance-kpi-value">{formatKRW(data.operating_revenue || 0)}</p>
      </div>
      <div className="finance-kpi-card">
        <p className="finance-kpi-label">영업비용</p>
        <p className="finance-kpi-value">{formatKRW(data.operating_expense || 0)}</p>
      </div>
      <div className="finance-kpi-card">
        <p className="finance-kpi-label">영업이익</p>
        <p className="finance-kpi-value">{formatKRW(data.operating_income || 0)}</p>
      </div>
      <div className="finance-kpi-card">
        <p className="finance-kpi-label">당기순이익</p>
        <p className="finance-kpi-value text-[var(--color-success)]">{formatKRW(data.net_income || 0)}</p>
      </div>
    </div>
  )

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="가결산"
        subtitle="입출금 입력, 자동 분개, 수동 매핑, 재무제표 생성을 하나의 스텝 워크벤치에서 처리합니다."
      />

      <PageMetricStrip
        columns={5}
        items={[
          { label: '선택 조합', value: selectedFund?.name || '-', hint: '현재 작업 기준', tone: 'info' },
          { label: '선택 월', value: yearMonth, hint: '가결산 대상 기간', tone: 'default' },
          { label: '입출금 건수', value: `${bankTxns.length}건`, hint: '선택 월 기준', tone: 'default' },
          { label: '미매핑 건수', value: `${unmappedTxns.length}건`, hint: '수동 확인 필요', tone: unmappedTxns.length ? 'warning' : 'success' },
          { label: '가결산 상태', value: provisionalFs ? prettyStatus(provisionalFs.status) : '미생성', hint: provisionalFs ? '현재 생성 상태' : '생성 대기', tone: provisionalFs?.status === 'confirmed' ? 'success' : provisionalFs ? 'warning' : 'default' },
        ]}
      />

      <PageControlStrip compact>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,300px)_180px_minmax(0,1fr)] lg:items-end">
          <div>
            <label className="form-label">조합</label>
            <select value={selectedFundId || ''} onChange={(e) => setFundId(Number(e.target.value) || null)} className="form-input">
              <option value="">조합 선택</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>{fund.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">월</label>
            <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="form-input" />
          </div>
          <div className="finance-kpi-inline">
            <div className="finance-kpi-card">
              <p className="finance-kpi-label">자동 분개 최근 결과</p>
              <p className="finance-kpi-value">{lastAutoResult ? `${lastAutoResult.mapped_count}/${lastAutoResult.total}` : '-'}</p>
              <p className="finance-kpi-hint">{lastAutoResult ? `수동 확인 ${lastAutoResult.unmapped_count}건` : '아직 실행하지 않았습니다.'}</p>
            </div>
          </div>
        </div>
      </PageControlStrip>

      <ProvisionalStepRail items={stepItems} />

      <FSOverview yearMonth={yearMonth} />

      <SectionScaffold title="Step 1. 입출금 내역 입력" description="복사한 내역을 붙여넣거나 엑셀 파일을 업로드해 월별 거래를 적재합니다.">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <label className="form-label">입출금 원본</label>
            <textarea
              value={clipboardText}
              onChange={(e) => setClipboardText(e.target.value)}
              className="form-input min-h-[220px] font-data text-sm"
              placeholder={`구분\t거래일자\t출금금액\t입금금액\t거래후잔액\t거래내용\t거래기록사항\t거래점`}
            />
          </div>
          <div className="space-y-3">
            <div className="finance-kpi-card">
              <p className="finance-kpi-label">적재 방식</p>
              <p className="finance-kpi-value">텍스트 · 엑셀</p>
              <p className="finance-kpi-hint">은행 원본을 그대로 붙여 넣거나 업로드합니다.</p>
            </div>
            <div className="space-y-2 rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
              <button onClick={() => parseTextMut.mutate()} className="primary-btn w-full" disabled={parseTextMut.isPending}>
                {parseTextMut.isPending ? '파싱 중...' : '파싱 실행'}
              </button>
              <label className="secondary-btn flex w-full cursor-pointer items-center justify-center">
                엑셀 업로드
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    uploadMut.mutate(file)
                    event.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </SectionScaffold>

      <SectionScaffold
        title="Step 2. 입출금 내역 확인"
        description="적재된 거래를 표로 검토하고 분개 상태를 확인합니다."
        actions={
          <div className="finance-inline-summary">
            <span className="finance-summary-chip">총 건수 {bankTxns.length}건</span>
            <span className="finance-summary-chip">출금 {formatKRW(totalWithdrawal)}</span>
            <span className="finance-summary-chip">입금 {formatKRW(totalDeposit)}</span>
          </div>
        }
      >
        {!bankTxns.length ? (
          <div className="finance-empty">선택한 월의 입출금 내역이 없습니다.</div>
        ) : (
          <div className="compact-table-wrap">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="table-head-row">
                <tr>
                  <th className="table-head-cell">No</th>
                  <th className="table-head-cell">일시</th>
                  <th className="table-head-cell text-right">출금</th>
                  <th className="table-head-cell text-right">입금</th>
                  <th className="table-head-cell text-right">잔액</th>
                  <th className="table-head-cell">거래내용</th>
                  <th className="table-head-cell">거래처</th>
                  <th className="table-head-cell text-center">분개상태</th>
                </tr>
              </thead>
              <tbody>
                {bankTxns.map((txn, index) => (
                  <tr key={txn.id}>
                    <td className="table-body-cell">{index + 1}</td>
                    <td className="table-body-cell">{txn.transaction_date.replace('T', ' ').slice(0, 19)}</td>
                    <td className="table-body-cell text-right font-data">{txn.withdrawal ? formatKRW(txn.withdrawal) : '-'}</td>
                    <td className="table-body-cell text-right font-data">{txn.deposit ? formatKRW(txn.deposit) : '-'}</td>
                    <td className="table-body-cell text-right font-data">{txn.balance_after == null ? '-' : formatKRW(txn.balance_after)}</td>
                    <td className="table-body-cell">{txn.description || '-'}</td>
                    <td className="table-body-cell">{txn.counterparty || '-'}</td>
                    <td className="table-body-cell text-center">
                      <span className={`finance-status-pill ${txn.journal_entry_id ? 'finance-status-success' : 'finance-status-warning'}`}>
                        {txn.journal_entry_id ? '매핑 완료' : '미매핑'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionScaffold>

      <SectionScaffold
        title="Step 3. 자동 분개 및 수동 매핑"
        description="자동 분개를 실행한 뒤 미매핑 거래만 선택해 계정을 지정합니다."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => autoJournalMut.mutate()} className="primary-btn btn-sm" disabled={autoJournalMut.isPending || !bankTxns.length}>
              {autoJournalMut.isPending ? '자동 분개 실행 중...' : '자동 분개 실행'}
            </button>
            {lastAutoResult ? <span className="finance-summary-chip">자동 매핑 {lastAutoResult.mapped_count}건</span> : null}
          </div>
        }
      >
        <WorkbenchSplit
          primary={
            !unmappedTxns.length ? (
              <div className="finance-empty">수동 매핑이 필요한 거래가 없습니다.</div>
            ) : (
              <div className="finance-list">
                {unmappedTxns.map((txn) => {
                  const active = selectedUnmappedTxn?.id === txn.id
                  const amount = txn.deposit > 0 ? txn.deposit : txn.withdrawal
                  return (
                    <button
                      key={txn.id}
                      type="button"
                      onClick={() => setSelectedTxnId(txn.id)}
                      className={`finance-list-row text-left ${active ? 'finance-list-row-selected' : ''}`}
                    >
                      <div className="finance-list-row-main">
                        <div className="min-w-0">
                          <p className="finance-list-row-title">{txn.counterparty || txn.description || '거래처 없음'}</p>
                          <p className="finance-list-row-meta">{txn.transaction_date.slice(0, 10)} · {inferDirection(txn) === 'deposit' ? '입금' : '출금'} · {formatKRW(amount)}</p>
                        </div>
                        <span className="finance-status-pill finance-status-warning">미매핑</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          }
          secondary={
            <SectionScaffold title="선택 거래 매핑" description="차변·대변 계정을 지정하고 동일 거래처 규칙을 학습시킵니다.">
              {!selectedUnmappedTxn || !selectedDraft ? (
                <div className="finance-empty">매핑할 거래를 선택하세요.</div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3 text-sm">
                    <p className="font-medium text-[#0f1f3d]">{selectedUnmappedTxn.counterparty || selectedUnmappedTxn.description || '거래처 없음'}</p>
                    <p className="mt-1 text-xs text-[#64748b]">{selectedUnmappedTxn.transaction_date.slice(0, 10)} · {inferDirection(selectedUnmappedTxn) === 'deposit' ? '입금' : '출금'} · {formatKRW(selectedUnmappedTxn.deposit > 0 ? selectedUnmappedTxn.deposit : selectedUnmappedTxn.withdrawal)}</p>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="form-label">차변 계정</label>
                      <select value={selectedDraft.debit_account_id} onChange={(e) => setDraft(selectedUnmappedTxn.id, { debit_account_id: Number(e.target.value) || 0 })} className="form-input">
                        {accountOptions.map((option) => (
                          <option key={`debit-${selectedUnmappedTxn.id}-${option.id}`} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">대변 계정</label>
                      <select value={selectedDraft.credit_account_id} onChange={(e) => setDraft(selectedUnmappedTxn.id, { credit_account_id: Number(e.target.value) || 0 })} className="form-input">
                        {accountOptions.map((option) => (
                          <option key={`credit-${selectedUnmappedTxn.id}-${option.id}`} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-[#64748b]">
                      <input type="checkbox" checked={selectedDraft.learn} onChange={(e) => setDraft(selectedUnmappedTxn.id, { learn: e.target.checked })} />
                      다음에도 동일 거래처를 자동 매핑
                    </label>
                  </div>

                  <button
                    className="primary-btn w-full"
                    disabled={manualMapMut.isPending || !selectedDraft.debit_account_id || !selectedDraft.credit_account_id}
                    onClick={() => manualMapMut.mutate({ txnId: selectedUnmappedTxn.id, draft: selectedDraft })}
                  >
                    매핑 저장
                  </button>
                </div>
              )}
            </SectionScaffold>
          }
          secondarySticky
        />
      </SectionScaffold>

      <SectionScaffold
        title="Step 4. 가결산 재무제표"
        description="가결산 생성, 다운로드, 확정 상태를 관리하고 재무상태표/손익계산서를 전환해 확인합니다."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => generateFsMut.mutate()} className="primary-btn btn-sm" disabled={generateFsMut.isPending || !selectedFundId}>
              {generateFsMut.isPending ? '생성 중...' : '가결산 생성'}
            </button>
            <button
              onClick={async () => {
                if (!provisionalFs?.id || !selectedFundId) return
                const blob = await downloadProvisionalFS(provisionalFs.id)
                const fundName = funds.find((fund) => fund.id === selectedFundId)?.name || 'fund'
                downloadBlob(blob, `${fundName}_${yearMonth}_provisional_fs.xlsx`)
              }}
              className="secondary-btn btn-sm"
              disabled={!provisionalFs?.id}
            >
              다운로드
            </button>
            <button
              onClick={() => confirmMut.mutate()}
              className="secondary-btn btn-sm"
              disabled={!provisionalFs?.id || provisionalFs?.status === 'confirmed' || confirmMut.isPending}
            >
              {provisionalFs?.status === 'confirmed' ? '확정 완료' : '확정'}
            </button>
            {provisionalFs ? (
              <span className={`finance-status-pill finance-status-${statusTone(provisionalFs.status)}`}>상태 {prettyStatus(provisionalFs.status)}</span>
            ) : null}
          </div>
        }
      >
        {!provisionalFs ? (
          <div className="finance-empty">아직 가결산이 생성되지 않았습니다.</div>
        ) : (
          <div className="space-y-4">
            <FinanceTabStrip
              tabs={[
                { key: 'sfp', label: '재무상태표' },
                { key: 'is', label: '손익계산서' },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
            {activeTab === 'sfp' ? renderSfp(provisionalFs.sfp_data) : renderIs(provisionalFs.is_data)}
          </div>
        )}
      </SectionScaffold>
    </div>
  )
}
