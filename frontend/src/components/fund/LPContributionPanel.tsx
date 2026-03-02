import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createLPContribution,
  deleteLPContribution,
  fetchLPContributionSummary,
  updateLPContribution,
  type LPContribution,
  type LPContributionInput,
  type LPContributionSummary,
} from '../../lib/api'
import { formatKRW } from '../../lib/labels'
import { useToast } from '../../contexts/ToastContext'
import KrwAmountInput from '../common/KrwAmountInput'

type ContributionTypeKey = '일시' | '분할' | '수시' | '미설정'

interface LPContributionPanelProps {
  fundId: number
  lpId: number
  lpName: string
  commitment: number
  contributionType: string | null
}

interface ContributionDraft {
  due_date: string
  amount: number | null
  actual_paid_date: string
  memo: string
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeContributionType(value: string | null): ContributionTypeKey {
  const normalized = String(value || '').replace(/\s+/g, '')
  if (normalized.includes('일시')) return '일시'
  if (normalized.includes('분할')) return '분할'
  if (normalized.includes('수시')) return '수시'
  return '미설정'
}

function contributionTypeLabel(value: ContributionTypeKey): string {
  if (value === '미설정') return '미설정'
  return `${value}납`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return value
}

function createEmptyDraft(): ContributionDraft {
  return {
    due_date: todayIso(),
    amount: null,
    actual_paid_date: '',
    memo: '',
  }
}

export default function LPContributionPanel({
  fundId,
  lpId,
  lpName,
  commitment,
  contributionType,
}: LPContributionPanelProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const typeKey = normalizeContributionType(contributionType)
  const [showAddForm, setShowAddForm] = useState(false)
  const [draft, setDraft] = useState<ContributionDraft>(createEmptyDraft())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<ContributionDraft>(createEmptyDraft())

  const summaryQuery = useQuery<LPContributionSummary>({
    queryKey: ['lpContributionSummary', fundId, lpId],
    queryFn: () => fetchLPContributionSummary(fundId, lpId),
    enabled: fundId > 0 && lpId > 0,
  })

  const summary = summaryQuery.data
  const rows = summary?.contributions ?? []
  const rowsWithCumulative = useMemo(() => {
    let cumulative = 0
    return rows.map((row) => {
      cumulative += Number(row.amount || 0)
      return {
        ...row,
        cumulative_amount: Number(row.cumulative_amount ?? cumulative),
      }
    })
  }, [rows])
  const totalPaidIn = Number(summary?.total_paid_in ?? rowsWithCumulative[rowsWithCumulative.length - 1]?.cumulative_amount ?? 0)
  const paidRatio = Number(
    summary?.paid_ratio ?? (commitment > 0 ? (totalPaidIn / commitment) * 100 : 0),
  )
  const oneTimeLocked = typeKey === '일시' && rows.length >= 1

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['lpContributionSummary', fundId, lpId] })
    queryClient.invalidateQueries({ queryKey: ['lpContributions', fundId, lpId] })
    queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
    queryClient.invalidateQueries({ queryKey: ['fundLPs', fundId] })
  }

  const createMut = useMutation({
    mutationFn: (payload: LPContributionInput) => createLPContribution(fundId, lpId, payload),
    onSuccess: () => {
      invalidate()
      setShowAddForm(false)
      setDraft(createEmptyDraft())
      addToast('success', '납입 이력을 추가했습니다.')
    },
    onError: (error) => addToast('error', error instanceof Error ? error.message : '납입 이력 추가에 실패했습니다.'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<LPContributionInput> }) =>
      updateLPContribution(id, payload),
    onSuccess: () => {
      invalidate()
      setEditingId(null)
      addToast('success', '납입 이력을 수정했습니다.')
    },
    onError: (error) => addToast('error', error instanceof Error ? error.message : '납입 이력 수정에 실패했습니다.'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteLPContribution(id),
    onSuccess: () => {
      invalidate()
      addToast('success', '납입 이력을 삭제했습니다.')
    },
    onError: (error) => addToast('error', error instanceof Error ? error.message : '납입 이력 삭제에 실패했습니다.'),
  })

  const submitCreate = () => {
    const amount = Number(draft.amount || 0)
    if (!draft.due_date) {
      addToast('warning', '납입기일을 입력해 주세요.')
      return
    }
    if (amount <= 0) {
      addToast('warning', '납입 금액은 0보다 커야 합니다.')
      return
    }
    createMut.mutate({
      fund_id: fundId,
      lp_id: lpId,
      due_date: draft.due_date,
      amount,
      actual_paid_date: draft.actual_paid_date || null,
      memo: draft.memo.trim() || null,
      source: 'manual',
    })
  }

  const startEdit = (row: LPContribution) => {
    setEditingId(row.id)
    setEditDraft({
      due_date: row.due_date || todayIso(),
      amount: Number(row.amount || 0),
      actual_paid_date: row.actual_paid_date || '',
      memo: row.memo || '',
    })
  }

  const submitEdit = () => {
    if (!editingId) return
    const amount = Number(editDraft.amount || 0)
    if (!editDraft.due_date) {
      addToast('warning', '납입기일을 입력해 주세요.')
      return
    }
    if (amount <= 0) {
      addToast('warning', '납입 금액은 0보다 커야 합니다.')
      return
    }
    updateMut.mutate({
      id: editingId,
      payload: {
        due_date: editDraft.due_date,
        amount,
        actual_paid_date: editDraft.actual_paid_date || null,
        memo: editDraft.memo.trim() || null,
      },
    })
  }

  const guideMessage = useMemo(() => {
    if (typeKey === '일시') return '전액 일시 납입 방식입니다. 이미 1건이 있으면 추가 입력이 잠깁니다.'
    if (typeKey === '분할') return '정해진 일정에 따른 분할 납입 이력을 관리합니다.'
    if (typeKey === '수시') return '출자요청 위저드(캐피탈콜) 실행 시 연동 이력이 자동 기록됩니다.'
    return '출자방식이 미설정입니다. 조합 기본정보에서 출자방식을 설정해 주세요.'
  }, [typeKey])

  return (
    <div className="space-y-3 border-t border-blue-100 bg-blue-50/30 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">납입 이력 · {lpName}</p>
          <p className="text-xs text-slate-600">
            출자방식: {contributionTypeLabel(typeKey)} | 총 약정: {formatKRW(commitment)} | 누적 납입: {formatKRW(totalPaidIn)} ({paidRatio.toFixed(2)}%)
          </p>
        </div>
        <button
          type="button"
          className="secondary-btn"
          disabled={oneTimeLocked || createMut.isPending}
          onClick={() => setShowAddForm((prev) => !prev)}
        >
          {showAddForm ? '입력 닫기' : '+ 납입 이력 추가'}
        </button>
      </div>

      <div className="rounded border border-blue-200 bg-white px-3 py-2 text-xs text-blue-700">
        {guideMessage}
      </div>

      {summaryQuery.isLoading ? (
        <p className="py-3 text-sm text-slate-500">납입 이력을 불러오는 중입니다...</p>
      ) : (
        <div className="overflow-auto rounded border border-slate-200 bg-white">
          <table className="min-w-[860px] w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">회차</th>
                <th className="px-2 py-2 text-left">납입기일</th>
                <th className="px-2 py-2 text-right">납입금액</th>
                <th className="px-2 py-2 text-right">약정대비%</th>
                <th className="px-2 py-2 text-right">누적납입</th>
                <th className="px-2 py-2 text-left">실제입금일</th>
                <th className="px-2 py-2 text-left">비고</th>
                <th className="px-2 py-2 text-left">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rowsWithCumulative.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-sm text-slate-500">등록된 납입 이력이 없습니다.</td>
                </tr>
              ) : (
                rowsWithCumulative.flatMap((row, index) => {
                  const linkedFromCall = row.source === 'capital_call'
                  const lineRows = [
                    <tr key={`contribution-${row.id}`}>
                      <td className="px-2 py-2">{row.round_no ?? index + 1}</td>
                      <td className="px-2 py-2">{formatDate(row.due_date)}</td>
                      <td className="px-2 py-2 text-right">{formatKRW(row.amount)}</td>
                      <td className="px-2 py-2 text-right">
                        {row.commitment_ratio == null ? '-' : `${Number(row.commitment_ratio).toFixed(2)}%`}
                      </td>
                      <td className="px-2 py-2 text-right">{formatKRW(row.cumulative_amount ?? 0)}</td>
                      <td className="px-2 py-2">{formatDate(row.actual_paid_date)}</td>
                      <td className="px-2 py-2 text-slate-600">{row.memo || '-'}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          {linkedFromCall ? (
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">연동</span>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700 hover:bg-amber-100"
                                onClick={() => startEdit(row)}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100"
                                disabled={deleteMut.isPending}
                                onClick={() => {
                                  if (!confirm('이 납입 이력을 삭제하시겠습니까?')) return
                                  deleteMut.mutate(row.id)
                                }}
                              >
                                삭제
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>,
                  ]

                  if (editingId === row.id) {
                    lineRows.push(
                      <tr key={`contribution-edit-${row.id}`} className="bg-slate-50">
                        <td colSpan={8} className="px-2 py-2">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                            <div>
                              <label className="mb-1 block text-[11px] text-slate-600">납입기일</label>
                              <input
                                type="date"
                                value={editDraft.due_date}
                                onChange={(event) => setEditDraft((prev) => ({ ...prev, due_date: event.target.value }))}
                                className="w-full rounded border px-2 py-1.5"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-slate-600">납입금액</label>
                              <KrwAmountInput
                                value={editDraft.amount}
                                onChange={(next) => setEditDraft((prev) => ({ ...prev, amount: next }))}
                                className="w-full rounded border px-2 py-1.5"
                                helperClassName="mt-1 text-[10px] text-slate-500"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-slate-600">실제입금일</label>
                              <input
                                type="date"
                                value={editDraft.actual_paid_date}
                                onChange={(event) => setEditDraft((prev) => ({ ...prev, actual_paid_date: event.target.value }))}
                                className="w-full rounded border px-2 py-1.5"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-slate-600">비고</label>
                              <input
                                value={editDraft.memo}
                                onChange={(event) => setEditDraft((prev) => ({ ...prev, memo: event.target.value }))}
                                className="w-full rounded border px-2 py-1.5"
                                placeholder="메모"
                              />
                            </div>
                          </div>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => setEditingId(null)}
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              className="primary-btn"
                              disabled={updateMut.isPending}
                              onClick={submitEdit}
                            >
                              {updateMut.isPending ? '저장 중...' : '저장'}
                            </button>
                          </div>
                        </td>
                      </tr>,
                    )
                  }
                  return lineRows
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddForm && (
        <div className="rounded border border-slate-200 bg-white p-3">
          <p className="mb-2 text-sm font-medium text-slate-800">납입 이력 추가</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] text-slate-600">납입기일</label>
              <input
                type="date"
                value={draft.due_date}
                onChange={(event) => setDraft((prev) => ({ ...prev, due_date: event.target.value }))}
                className="w-full rounded border px-2 py-1.5"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-600">납입금액</label>
              <KrwAmountInput
                value={draft.amount}
                onChange={(next) => setDraft((prev) => ({ ...prev, amount: next }))}
                className="w-full rounded border px-2 py-1.5"
                helperClassName="mt-1 text-[10px] text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-600">실제입금일</label>
              <input
                type="date"
                value={draft.actual_paid_date}
                onChange={(event) => setDraft((prev) => ({ ...prev, actual_paid_date: event.target.value }))}
                className="w-full rounded border px-2 py-1.5"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-600">비고</label>
              <input
                value={draft.memo}
                onChange={(event) => setDraft((prev) => ({ ...prev, memo: event.target.value }))}
                className="w-full rounded border px-2 py-1.5"
                placeholder="메모"
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setShowAddForm(false)
                setDraft(createEmptyDraft())
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={createMut.isPending}
              onClick={submitCreate}
            >
              {createMut.isPending ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}



