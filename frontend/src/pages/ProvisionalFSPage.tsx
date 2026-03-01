import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import EmptyState from '../components/EmptyState'
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
import './ProvisionalFSPage.css'

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

export default function ProvisionalFSPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [fundId, setFundId] = useState<number | null>(null)
  const [yearMonth, setYearMonth] = useState(currentYearMonth())
  const [clipboardText, setClipboardText] = useState('')
  const [activeTab, setActiveTab] = useState<FsTabKey>('sfp')
  const [manualMapDrafts, setManualMapDrafts] = useState<Record<number, ManualMappingDraft>>({})
  const [lastAutoResult, setLastAutoResult] = useState<AutoJournalResult | null>(null)

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })

  const selectedFundId = useMemo(
    () => fundId || funds[0]?.id || null,
    [fundId, funds],
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

  const unmappedTxns = useMemo(
    () => bankTxns.filter((txn) => !txn.journal_entry_id),
    [bankTxns],
  )

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

  const renderSfp = (data: Record<string, number>) => (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="text-xs text-gray-500">유동자산</p>
        <p className="font-semibold text-gray-800">{formatKRW(data.current_assets || 0)}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="text-xs text-gray-500">투자자산</p>
        <p className="font-semibold text-gray-800">{formatKRW(data.investment_assets || 0)}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="text-xs text-gray-500">부채총계</p>
        <p className="font-semibold text-gray-800">{formatKRW(data.total_liabilities || 0)}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="text-xs text-gray-500">자본총계</p>
        <p className="font-semibold text-gray-800">{formatKRW(data.total_equity || 0)}</p>
      </div>
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm md:col-span-2">
        <p className="text-xs text-blue-600">자산총계</p>
        <p className="font-semibold text-blue-700">{formatKRW(data.total_assets || 0)}</p>
      </div>
    </div>
  )

  const renderIs = (data: Record<string, number>) => (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="text-xs text-gray-500">영업수익</p>
        <p className="font-semibold text-gray-800">{formatKRW(data.operating_revenue || 0)}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="text-xs text-gray-500">영업비용</p>
        <p className="font-semibold text-gray-800">{formatKRW(data.operating_expense || 0)}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="text-xs text-gray-500">영업이익</p>
        <p className="font-semibold text-gray-800">{formatKRW(data.operating_income || 0)}</p>
      </div>
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm">
        <p className="text-xs text-emerald-600">당기순이익</p>
        <p className="font-semibold text-emerald-700">{formatKRW(data.net_income || 0)}</p>
      </div>
    </div>
  )

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">가결산 관리</h2>
          <p className="page-subtitle">입출금 입력 → 자동 분개 → 가결산 생성 → 엑셀 다운로드</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
            <select
              value={selectedFundId || ''}
              onChange={(e) => setFundId(Number(e.target.value) || null)}
              className="rounded border px-2 py-1 text-sm"
            >
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>{fund.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">월</label>
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="rounded border px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      <FSOverview yearMonth={yearMonth} />

      <div className="card-base provisional-step space-y-3 p-4">
        <div className="provisional-step-title">Step 1. 입출금 내역 입력</div>
        <textarea
          value={clipboardText}
          onChange={(e) => setClipboardText(e.target.value)}
          className="provisional-textarea"
          placeholder={`구분\t거래일자\t출금금액\t입금금액\t거래후잔액\t거래내용\t거래기록사항\t거래점`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => parseTextMut.mutate()}
            className="primary-btn"
            disabled={parseTextMut.isPending}
          >
            {parseTextMut.isPending ? '파싱 중...' : '파싱 실행'}
          </button>
          <label className="secondary-btn cursor-pointer">
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

      <div className="card-base provisional-step space-y-3 p-4">
        <div className="provisional-step-title">Step 2. 입출금 내역 확인</div>
        {!bankTxns.length ? (
          <EmptyState emoji="📄" message="선택한 월의 입출금 내역이 없습니다." className="py-8" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <p className="text-xs text-gray-500">총 건수</p>
                <p className="font-semibold text-gray-800">{bankTxns.length}건</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <p className="text-xs text-gray-500">출금 합계</p>
                <p className="font-semibold text-gray-800">{formatKRW(totalWithdrawal)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <p className="text-xs text-gray-500">입금 합계</p>
                <p className="font-semibold text-gray-800">{formatKRW(totalDeposit)}</p>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-2 py-2 text-left">No</th>
                    <th className="px-2 py-2 text-left">일시</th>
                    <th className="px-2 py-2 text-right">출금</th>
                    <th className="px-2 py-2 text-right">입금</th>
                    <th className="px-2 py-2 text-right">잔액</th>
                    <th className="px-2 py-2 text-left">거래내용</th>
                    <th className="px-2 py-2 text-left">거래처</th>
                    <th className="px-2 py-2 text-left">분개상태</th>
                  </tr>
                </thead>
                <tbody>
                  {bankTxns.map((txn, index) => (
                    <tr key={txn.id} className="border-t">
                      <td className="px-2 py-2">{index + 1}</td>
                      <td className="px-2 py-2">{txn.transaction_date.replace('T', ' ').slice(0, 19)}</td>
                      <td className="px-2 py-2 text-right">{txn.withdrawal ? formatKRW(txn.withdrawal) : '-'}</td>
                      <td className="px-2 py-2 text-right">{txn.deposit ? formatKRW(txn.deposit) : '-'}</td>
                      <td className="px-2 py-2 text-right">{txn.balance_after == null ? '-' : formatKRW(txn.balance_after)}</td>
                      <td className="px-2 py-2">{txn.description || '-'}</td>
                      <td className="px-2 py-2">{txn.counterparty || '-'}</td>
                      <td className="px-2 py-2">
                        {txn.journal_entry_id ? (
                          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                            매핑완료
                          </span>
                        ) : (
                          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                            미매핑
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card-base provisional-step space-y-3 p-4">
        <div className="provisional-step-title">Step 3. 자동 분개</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => autoJournalMut.mutate()}
            className="primary-btn"
            disabled={autoJournalMut.isPending || !bankTxns.length}
          >
            {autoJournalMut.isPending ? '자동 분개 실행 중...' : '자동 분개 실행'}
          </button>
          {lastAutoResult && (
            <p className="text-xs text-gray-600">
              자동 매핑 {lastAutoResult.mapped_count}건 / 수동 필요 {lastAutoResult.unmapped_count}건
            </p>
          )}
        </div>

        {unmappedTxns.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-amber-700">수동 매핑 필요 {unmappedTxns.length}건</p>
            {unmappedTxns.map((txn) => {
              const draft = getDraft(txn)
              return (
                <div key={txn.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                  <p className="mb-2 text-xs text-gray-700">
                    {txn.transaction_date.slice(0, 10)} | {txn.counterparty || txn.description || '거래처 없음'} | 금액 {formatKRW(txn.deposit > 0 ? txn.deposit : txn.withdrawal)}
                  </p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                    <select
                      value={draft.debit_account_id}
                      onChange={(e) => setDraft(txn.id, { debit_account_id: Number(e.target.value) || 0 })}
                      className="rounded border px-2 py-1 text-sm md:col-span-2"
                    >
                      {accountOptions.map((option) => (
                        <option key={`d-${txn.id}-${option.id}`} value={option.id}>{option.label} (차변)</option>
                      ))}
                    </select>
                    <select
                      value={draft.credit_account_id}
                      onChange={(e) => setDraft(txn.id, { credit_account_id: Number(e.target.value) || 0 })}
                      className="rounded border px-2 py-1 text-sm md:col-span-2"
                    >
                      {accountOptions.map((option) => (
                        <option key={`c-${txn.id}-${option.id}`} value={option.id}>{option.label} (대변)</option>
                      ))}
                    </select>
                    <button
                      className="secondary-btn"
                      disabled={manualMapMut.isPending || !draft.debit_account_id || !draft.credit_account_id}
                      onClick={() => manualMapMut.mutate({ txnId: txn.id, draft })}
                    >
                      매핑 저장
                    </button>
                  </div>
                  <label className="mt-2 inline-flex items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={draft.learn}
                      onChange={(e) => setDraft(txn.id, { learn: e.target.checked })}
                    />
                    다음에도 동일 거래처를 자동 매핑
                  </label>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card-base provisional-step space-y-3 p-4">
        <div className="provisional-step-title">Step 4. 가결산 재무제표</div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => generateFsMut.mutate()}
            className="primary-btn"
            disabled={generateFsMut.isPending || !selectedFundId}
          >
            {generateFsMut.isPending ? '생성 중...' : '가결산 생성'}
          </button>
          <button
            onClick={async () => {
              if (!provisionalFs?.id || !selectedFundId) return
              const blob = await downloadProvisionalFS(provisionalFs.id)
              const fundName = funds.find((fund) => fund.id === selectedFundId)?.name || 'fund'
              downloadBlob(blob, `${fundName}_${yearMonth}_provisional_fs.xlsx`)
            }}
            className="secondary-btn"
            disabled={!provisionalFs?.id}
          >
            엑셀 다운로드
          </button>
          <button
            onClick={() => confirmMut.mutate()}
            className="secondary-btn"
            disabled={!provisionalFs?.id || provisionalFs?.status === 'confirmed' || confirmMut.isPending}
          >
            {provisionalFs?.status === 'confirmed' ? '확정 완료' : '확정'}
          </button>

          {provisionalFs && (
            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
              상태: {prettyStatus(provisionalFs.status)}
            </span>
          )}
        </div>

        {!provisionalFs ? (
          <EmptyState emoji="🧾" message="아직 가결산이 생성되지 않았습니다." className="py-8" />
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('sfp')}
                className={`rounded px-3 py-1.5 text-sm ${activeTab === 'sfp' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                SFP
              </button>
              <button
                onClick={() => setActiveTab('is')}
                className={`rounded px-3 py-1.5 text-sm ${activeTab === 'is' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                IS
              </button>
            </div>

            {activeTab === 'sfp' ? renderSfp(provisionalFs.sfp_data) : renderIs(provisionalFs.is_data)}
          </div>
        )}
      </div>
    </div>
  )
}
