import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCapitalCallItems, updateCapitalCallItem, type CapitalCallItem, type CapitalCallItemInput } from '../lib/api'
import { formatKRW } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ko-KR')
}

interface CapitalCallDetailProps {
  capitalCallId: number
  commitmentTotal: number
  editable?: boolean
  onItemUpdated?: () => void
}

export default function CapitalCallDetail({
  capitalCallId,
  commitmentTotal,
  editable = false,
  onItemUpdated,
}: CapitalCallDetailProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const { data: items, isLoading } = useQuery<CapitalCallItem[]>({
    queryKey: ['capitalCallItems', capitalCallId],
    queryFn: () => fetchCapitalCallItems(capitalCallId),
  })

  const updateItemMut = useMutation({
    mutationFn: ({
      callId,
      itemId,
      data,
    }: {
      callId: number
      itemId: number
      data: Partial<CapitalCallItemInput>
    }) => updateCapitalCallItem(callId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capitalCallItems', capitalCallId] })
      queryClient.invalidateQueries({ queryKey: ['fund'] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallSummary'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCalls'] })
      addToast('success', '납입 상태가 업데이트되었습니다.')
      onItemUpdated?.()
    },
  })

  const unpaidItems = useMemo(
    () => (items ?? []).filter((item) => !item.paid),
    [items],
  )
  const filteredItems = useMemo(() => {
    if (!items) return []
    return showUnpaidOnly ? items.filter((item) => !item.paid) : items
  }, [items, showUnpaidOnly])
  const visibleUnpaidItems = useMemo(
    () => filteredItems.filter((item) => !item.paid),
    [filteredItems],
  )

  useEffect(() => {
    setSelectedIds((prev) => {
      const allowedIds = new Set((items ?? []).map((item) => item.id))
      const next = new Set<number>()
      for (const id of prev) {
        if (allowedIds.has(id)) next.add(id)
      }
      return next
    })
  }, [items])

  const batchConfirmMut = useMutation({
    mutationFn: async (itemIds: number[]) => {
      const today = new Date().toISOString().slice(0, 10)
      for (const itemId of itemIds) {
        await updateCapitalCallItem(capitalCallId, itemId, { paid: true, paid_date: today })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capitalCallItems', capitalCallId] })
      queryClient.invalidateQueries({ queryKey: ['fund'] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallSummary'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCalls'] })
      setSelectedIds(new Set())
      addToast('success', '선택 항목의 납입이 확인되었습니다.')
      onItemUpdated?.()
    },
  })

  const toggleSelectOne = (itemId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  const toggleSelectAllVisibleUnpaid = (checked: boolean) => {
    setSelectedIds((prev) => {
      if (!checked) return new Set<number>()
      const next = new Set(prev)
      for (const item of visibleUnpaidItems) {
        next.add(item.id)
      }
      return next
    })
  }

  const handlePaidToggle = (item: CapitalCallItem, checked: boolean) => {
    const paidDate = checked ? new Date().toISOString().slice(0, 10) : null
    updateItemMut.mutate({
      callId: capitalCallId,
      itemId: item.id,
      data: { paid: checked, paid_date: paidDate },
    })
  }

  const handlePaidDateChange = (item: CapitalCallItem, value: string) => {
    updateItemMut.mutate({
      callId: capitalCallId,
      itemId: item.id,
      data: { paid_date: value || null },
    })
  }

  const handleMemoBlur = (item: CapitalCallItem, value: string) => {
    const nextMemo = value.trim() || null
    const currentMemo = item.memo?.trim() || null
    if (nextMemo === currentMemo) return
    updateItemMut.mutate({
      callId: capitalCallId,
      itemId: item.id,
      data: { memo: nextMemo },
    })
  }

  if (isLoading) {
    return <p className="text-xs text-gray-400">로딩중...</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600">LP별 납입 상세</p>
        {editable && (
          <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={showUnpaidOnly}
              onChange={(e) => setShowUnpaidOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            미납만 보기
          </label>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-white text-gray-500">
            <tr>
              {editable && (
                <th className="w-8 px-2 py-1 text-center">
                  <label className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                    전체
                    <input
                      type="checkbox"
                      checked={visibleUnpaidItems.length > 0 && visibleUnpaidItems.every((item) => selectedIds.has(item.id))}
                      onChange={(e) => toggleSelectAllVisibleUnpaid(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                  </label>
                </th>
              )}
              <th className="px-2 py-1 text-left">LP명</th>
              <th className="px-2 py-1 text-right">요청금액</th>
              <th className="px-2 py-1 text-right">약정 대비 %</th>
              <th className="px-2 py-1 text-center">납입여부</th>
              <th className="px-2 py-1 text-left">납입일</th>
              <th className="px-2 py-1 text-left">비고</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredItems.map((item) => (
              <tr key={item.id}>
                {editable && (
                  <td className="px-2 py-1 text-center">
                    {!item.paid ? (
                      <label className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                        선택
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => toggleSelectOne(item.id, e.target.checked)}
                          className="rounded border-gray-300"
                        />
                      </label>
                    ) : (
                      <span className="text-[10px] text-gray-300">-</span>
                    )}
                  </td>
                )}
                <td className="px-2 py-1">{item.lp_name || `LP ${item.lp_id}`}</td>
                <td className="px-2 py-1 text-right">{formatKRW(item.amount)}</td>
                <td className="px-2 py-1 text-right">
                  {commitmentTotal ? `${((item.amount / commitmentTotal) * 100).toFixed(1)}%` : '-'}
                </td>
                <td className="px-2 py-1 text-center">
                  {editable ? (
                    <label className="inline-flex cursor-pointer items-center gap-1">
                      <input
                        type="checkbox"
                        checked={item.paid}
                        onChange={(e) => handlePaidToggle(item, e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className={`text-[10px] ${item.paid ? 'text-emerald-700' : 'text-red-700'}`}>
                        {item.paid ? '납입' : '미납'}
                      </span>
                    </label>
                  ) : (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        item.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {item.paid ? '납입' : '미납'}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1 text-gray-500">
                  {editable && !item.paid ? (
                    <div>
                      <label className="mb-0.5 block text-[10px] font-medium text-gray-500">납입일</label>
                      <input
                        type="date"
                        value={item.paid_date ?? ''}
                        onChange={(e) => handlePaidDateChange(item, e.target.value)}
                        className="w-28 rounded border px-1 py-0.5 text-xs"
                      />
                    </div>
                  ) : (
                    formatDate(item.paid_date)
                  )}
                </td>
                <td className="px-2 py-1 text-gray-500">
                  {editable ? (
                    <div>
                      <label className="mb-0.5 block text-[10px] font-medium text-gray-500">비고</label>
                      <input
                        type="text"
                        defaultValue={item.memo ?? ''}
                        onBlur={(e) => handleMemoBlur(item, e.target.value)}
                        placeholder="비고 입력"
                        className="w-32 rounded border px-1 py-0.5 text-xs"
                      />
                    </div>
                  ) : (
                    item.memo || '-'
                  )}
                </td>
              </tr>
            ))}
            {!filteredItems.length && (
              <tr>
                <td className="px-2 py-2 text-center text-gray-400" colSpan={editable ? 7 : 6}>
                  {showUnpaidOnly ? '미납 항목이 없습니다.' : '등록된 LP 항목이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={() => batchConfirmMut.mutate([...selectedIds])}
              disabled={batchConfirmMut.isPending}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {batchConfirmMut.isPending ? '처리중...' : `선택 ${selectedIds.size}건 납입 확인`}
            </button>
          )}
          {unpaidItems.length > 0 && (
            <button
              onClick={() => batchConfirmMut.mutate(unpaidItems.map((item) => item.id))}
              disabled={batchConfirmMut.isPending}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-60"
            >
              전원 납입완료 처리
            </button>
          )}
        </div>
      )}
    </div>
  )
}
