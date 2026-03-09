import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import EmptyState from '../EmptyState'
import SectionScaffold from '../common/page/SectionScaffold'
import WorkbenchSplit from '../common/page/WorkbenchSplit'
import { useToast } from '../../contexts/ToastContext'
import {
  createFundManagerHistory,
  createManagerAward,
  createManagerCareer,
  createManagerEducation,
  createManagerInvestment,
  createProposalFundManager,
  deleteFundManagerHistory,
  deleteManagerAward,
  deleteManagerCareer,
  deleteManagerEducation,
  deleteManagerInvestment,
  deleteProposalFundManager,
  updateFundManagerHistory,
  updateManagerAward,
  updateManagerCareer,
  updateManagerEducation,
  updateManagerInvestment,
  updateProposalFundManager,
  type FundManagerHistory,
  type FundManagerHistoryInput,
  type ManagerAward,
  type ManagerAwardInput,
  type ManagerCareer,
  type ManagerCareerInput,
  type ManagerEducation,
  type ManagerEducationInput,
  type ManagerInvestment,
  type ManagerInvestmentInput,
  type ProposalFundManager,
  type ProposalFundManagerInput,
  type ProposalWorkspaceFund,
} from '../../lib/api'

interface ProposalManagerWorkspaceProps {
  gpEntityId: number | null
  fundOptions: ProposalWorkspaceFund[]
  managers: ProposalFundManager[]
  careers: ManagerCareer[]
  educations: ManagerEducation[]
  awards: ManagerAward[]
  investments: ManagerInvestment[]
  histories: FundManagerHistory[]
  selectedManagerId: number | null
  onSelectManager: (managerId: number | null) => void
}

function buildManagerForm(gpEntityId: number | null): ProposalFundManagerInput {
  return {
    gp_entity_id: gpEntityId,
    name: '',
    birth_date: null,
    nationality: '대한민국',
    phone: null,
    fax: null,
    email: null,
    department: null,
    position: null,
    join_date: null,
    resign_date: null,
    is_core: false,
    is_representative: false,
  }
}

function buildCareerForm(fundManagerId: number | null): ManagerCareerInput {
  return {
    fund_manager_id: fundManagerId ?? 0,
    company_name: '',
    company_type: null,
    department: null,
    position: null,
    start_date: null,
    end_date: null,
    main_task: null,
    is_investment_exp: false,
    employment_type: null,
  }
}

function buildEducationForm(fundManagerId: number | null): ManagerEducationInput {
  return {
    fund_manager_id: fundManagerId ?? 0,
    school_name: '',
    major: null,
    degree: null,
    admission_date: null,
    graduation_date: null,
    country: '한국',
  }
}

function buildAwardForm(fundManagerId: number | null): ManagerAwardInput {
  return {
    fund_manager_id: fundManagerId ?? 0,
    award_date: null,
    award_name: '',
    organization: null,
    memo: null,
  }
}

function buildInvestmentForm(fundManagerId: number | null): ManagerInvestmentInput {
  return {
    fund_manager_id: fundManagerId ?? 0,
    investment_id: null,
    fund_id: null,
    source_company_name: null,
    fund_name: null,
    company_name: null,
    investment_date: null,
    instrument: null,
    amount: null,
    exit_date: null,
    exit_amount: null,
    role: null,
    discovery_contrib: null,
    review_contrib: null,
    contrib_rate: null,
    is_current_company: false,
  }
}

function buildHistoryForm(fundManagerId: number | null, fundId: number | null): FundManagerHistoryInput {
  return {
    fund_id: fundId ?? 0,
    fund_manager_id: fundManagerId ?? 0,
    change_date: new Date().toISOString().slice(0, 10),
    change_type: '선임',
    role_before: null,
    role_after: null,
    memo: null,
  }
}

function toNullableString(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function toDateLabel(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function toAmountLabel(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString('ko-KR')
}

function toPercentLabel(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return `${(Number(value) * 100).toFixed(2)}%`
}

function subSectionHeader(
  title: string,
  description: string,
  buttonLabel: string,
  onReset: () => void,
) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h4 className="text-sm font-semibold text-[#0f1f3d]">{title}</h4>
        <p className="mt-0.5 text-xs text-[#64748b]">{description}</p>
      </div>
      <button type="button" className="secondary-btn btn-sm" onClick={onReset}>
        {buttonLabel}
      </button>
    </div>
  )
}

export default function ProposalManagerWorkspace({
  gpEntityId,
  fundOptions,
  managers,
  careers,
  educations,
  awards,
  investments,
  histories,
  selectedManagerId,
  onSelectManager,
}: ProposalManagerWorkspaceProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const selectedManager = useMemo(
    () => managers.find((row) => row.id === selectedManagerId) ?? null,
    [managers, selectedManagerId],
  )
  const defaultFundId = fundOptions[0]?.id ?? null

  const managerCareers = useMemo(
    () => careers.filter((row) => row.fund_manager_id === selectedManager?.id),
    [careers, selectedManager?.id],
  )
  const managerEducations = useMemo(
    () => educations.filter((row) => row.fund_manager_id === selectedManager?.id),
    [educations, selectedManager?.id],
  )
  const managerAwards = useMemo(
    () => awards.filter((row) => row.fund_manager_id === selectedManager?.id),
    [awards, selectedManager?.id],
  )
  const managerInvestments = useMemo(
    () => investments.filter((row) => row.fund_manager_id === selectedManager?.id),
    [investments, selectedManager?.id],
  )
  const managerHistories = useMemo(
    () => histories.filter((row) => row.fund_manager_id === selectedManager?.id),
    [histories, selectedManager?.id],
  )

  const [managerForm, setManagerForm] = useState<ProposalFundManagerInput>(() => buildManagerForm(gpEntityId))
  const [careerForm, setCareerForm] = useState<ManagerCareerInput>(() => buildCareerForm(selectedManagerId))
  const [educationForm, setEducationForm] = useState<ManagerEducationInput>(() => buildEducationForm(selectedManagerId))
  const [awardForm, setAwardForm] = useState<ManagerAwardInput>(() => buildAwardForm(selectedManagerId))
  const [investmentForm, setInvestmentForm] = useState<ManagerInvestmentInput>(() => buildInvestmentForm(selectedManagerId))
  const [historyForm, setHistoryForm] = useState<FundManagerHistoryInput>(() => buildHistoryForm(selectedManagerId, defaultFundId))

  const [editingCareerId, setEditingCareerId] = useState<number | null>(null)
  const [editingEducationId, setEditingEducationId] = useState<number | null>(null)
  const [editingAwardId, setEditingAwardId] = useState<number | null>(null)
  const [editingInvestmentId, setEditingInvestmentId] = useState<number | null>(null)
  const [editingHistoryId, setEditingHistoryId] = useState<number | null>(null)

  useEffect(() => {
    if (!selectedManager) {
      setManagerForm(buildManagerForm(gpEntityId))
      return
    }
    setManagerForm({
      gp_entity_id: selectedManager.gp_entity_id,
      name: selectedManager.name,
      birth_date: selectedManager.birth_date,
      nationality: selectedManager.nationality,
      phone: selectedManager.phone,
      fax: selectedManager.fax,
      email: selectedManager.email,
      department: selectedManager.department,
      position: selectedManager.position,
      join_date: selectedManager.join_date,
      resign_date: selectedManager.resign_date,
      is_core: selectedManager.is_core,
      is_representative: selectedManager.is_representative,
    })
  }, [gpEntityId, selectedManager])

  useEffect(() => {
    setCareerForm(buildCareerForm(selectedManager?.id ?? null))
    setEducationForm(buildEducationForm(selectedManager?.id ?? null))
    setAwardForm(buildAwardForm(selectedManager?.id ?? null))
    setInvestmentForm(buildInvestmentForm(selectedManager?.id ?? null))
    setHistoryForm(buildHistoryForm(selectedManager?.id ?? null, defaultFundId))
    setEditingCareerId(null)
    setEditingEducationId(null)
    setEditingAwardId(null)
    setEditingInvestmentId(null)
    setEditingHistoryId(null)
  }, [defaultFundId, selectedManager?.id])

  const invalidateWorkspace = () => {
    queryClient.invalidateQueries({ queryKey: ['proposal-workspace'] })
    queryClient.invalidateQueries({ queryKey: ['proposal-readiness'] })
    queryClient.invalidateQueries({ queryKey: ['proposal-reference-workspace'] })
    queryClient.invalidateQueries({ queryKey: ['proposal-draft-create-context'] })
    queryClient.invalidateQueries({ queryKey: ['proposal-applications'] })
    queryClient.invalidateQueries({ queryKey: ['proposal-application'] })
  }

  const saveManagerMut = useMutation({
    mutationFn: async () => {
      const payload = { ...managerForm, gp_entity_id: gpEntityId }
      if (selectedManager) return updateProposalFundManager(selectedManager.id, payload)
      return createProposalFundManager(payload)
    },
    onSuccess: (saved) => {
      invalidateWorkspace()
      onSelectManager(saved.id)
      addToast('success', selectedManager ? '운용인력 기본정보를 수정했습니다.' : '운용인력을 등록했습니다.')
    },
  })

  const deleteManagerMut = useMutation({
    mutationFn: (id: number) => deleteProposalFundManager(id),
    onSuccess: () => {
      invalidateWorkspace()
      onSelectManager(null)
      addToast('success', '운용인력을 삭제했습니다.')
    },
  })

  const saveCareerMut = useMutation({
    mutationFn: async () => {
      if (!selectedManager) throw new Error('운용인력을 먼저 선택하세요.')
      const payload = { ...careerForm, fund_manager_id: selectedManager.id }
      if (editingCareerId) return updateManagerCareer(editingCareerId, payload)
      return createManagerCareer(payload)
    },
    onSuccess: () => {
      invalidateWorkspace()
      setCareerForm(buildCareerForm(selectedManager?.id ?? null))
      setEditingCareerId(null)
      addToast('success', editingCareerId ? '경력사항을 수정했습니다.' : '경력사항을 추가했습니다.')
    },
  })

  const deleteCareerMut = useMutation({
    mutationFn: (id: number) => deleteManagerCareer(id),
    onSuccess: () => {
      invalidateWorkspace()
      setCareerForm(buildCareerForm(selectedManager?.id ?? null))
      setEditingCareerId(null)
      addToast('success', '경력사항을 삭제했습니다.')
    },
  })

  const saveEducationMut = useMutation({
    mutationFn: async () => {
      if (!selectedManager) throw new Error('운용인력을 먼저 선택하세요.')
      const payload = { ...educationForm, fund_manager_id: selectedManager.id }
      if (editingEducationId) return updateManagerEducation(editingEducationId, payload)
      return createManagerEducation(payload)
    },
    onSuccess: () => {
      invalidateWorkspace()
      setEducationForm(buildEducationForm(selectedManager?.id ?? null))
      setEditingEducationId(null)
      addToast('success', editingEducationId ? '학력사항을 수정했습니다.' : '학력사항을 추가했습니다.')
    },
  })

  const deleteEducationMut = useMutation({
    mutationFn: (id: number) => deleteManagerEducation(id),
    onSuccess: () => {
      invalidateWorkspace()
      setEducationForm(buildEducationForm(selectedManager?.id ?? null))
      setEditingEducationId(null)
      addToast('success', '학력사항을 삭제했습니다.')
    },
  })

  const saveAwardMut = useMutation({
    mutationFn: async () => {
      if (!selectedManager) throw new Error('운용인력을 먼저 선택하세요.')
      const payload = { ...awardForm, fund_manager_id: selectedManager.id }
      if (editingAwardId) return updateManagerAward(editingAwardId, payload)
      return createManagerAward(payload)
    },
    onSuccess: () => {
      invalidateWorkspace()
      setAwardForm(buildAwardForm(selectedManager?.id ?? null))
      setEditingAwardId(null)
      addToast('success', editingAwardId ? '수상경력을 수정했습니다.' : '수상경력을 추가했습니다.')
    },
  })

  const deleteAwardMut = useMutation({
    mutationFn: (id: number) => deleteManagerAward(id),
    onSuccess: () => {
      invalidateWorkspace()
      setAwardForm(buildAwardForm(selectedManager?.id ?? null))
      setEditingAwardId(null)
      addToast('success', '수상경력을 삭제했습니다.')
    },
  })

  const saveInvestmentMut = useMutation({
    mutationFn: async () => {
      if (!selectedManager) throw new Error('운용인력을 먼저 선택하세요.')
      const payload = { ...investmentForm, fund_manager_id: selectedManager.id }
      if (editingInvestmentId) return updateManagerInvestment(editingInvestmentId, payload)
      return createManagerInvestment(payload)
    },
    onSuccess: () => {
      invalidateWorkspace()
      setInvestmentForm(buildInvestmentForm(selectedManager?.id ?? null))
      setEditingInvestmentId(null)
      addToast('success', editingInvestmentId ? '투자실적을 수정했습니다.' : '투자실적을 추가했습니다.')
    },
  })

  const deleteInvestmentMut = useMutation({
    mutationFn: (id: number) => deleteManagerInvestment(id),
    onSuccess: () => {
      invalidateWorkspace()
      setInvestmentForm(buildInvestmentForm(selectedManager?.id ?? null))
      setEditingInvestmentId(null)
      addToast('success', '투자실적을 삭제했습니다.')
    },
  })

  const saveHistoryMut = useMutation({
    mutationFn: async () => {
      if (!selectedManager) throw new Error('운용인력을 먼저 선택하세요.')
      const payload = { ...historyForm, fund_manager_id: selectedManager.id }
      if (editingHistoryId) return updateFundManagerHistory(editingHistoryId, payload)
      return createFundManagerHistory(payload)
    },
    onSuccess: () => {
      invalidateWorkspace()
      setHistoryForm(buildHistoryForm(selectedManager?.id ?? null, defaultFundId))
      setEditingHistoryId(null)
      addToast('success', editingHistoryId ? '펀드 이력 변경사항을 수정했습니다.' : '펀드 이력 변경사항을 추가했습니다.')
    },
  })

  const deleteHistoryMut = useMutation({
    mutationFn: (id: number) => deleteFundManagerHistory(id),
    onSuccess: () => {
      invalidateWorkspace()
      setHistoryForm(buildHistoryForm(selectedManager?.id ?? null, defaultFundId))
      setEditingHistoryId(null)
      addToast('success', '펀드 이력 변경사항을 삭제했습니다.')
    },
  })

  const primary = (
    <SectionScaffold
      title="운용인력 목록"
      description="선택한 GP 기준 운용인력과 보완 이력을 같은 화면에서 관리합니다."
    >
      <div className="space-y-3">
        <button type="button" className="primary-btn w-full" onClick={() => onSelectManager(null)}>
          새 운용인력 등록
        </button>
        {managers.length === 0 ? (
          <EmptyState message="등록된 운용인력이 없습니다." className="py-8" />
        ) : (
          <div className="space-y-2">
            {managers.map((manager) => {
              const isSelected = manager.id === selectedManager?.id
              return (
                <button
                  key={manager.id}
                  type="button"
                  onClick={() => onSelectManager(manager.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${isSelected ? 'border-[#3b82f6] bg-[#eff6ff]' : 'border-[#d8e5fb] bg-white hover:bg-[#f8fbff]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0f1f3d]">{manager.name}</p>
                      <p className="mt-1 truncate text-xs text-[#64748b]">
                        {manager.position || '직위 미등록'} · {manager.department || '부서 미등록'}
                      </p>
                      <p className="mt-1 text-[11px] text-[#94a3b8]">
                        입사일 {toDateLabel(manager.join_date)} / 재직상태 {manager.resign_date ? '퇴사' : '재직'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {manager.is_representative ? <span className="tag tag-blue">대표</span> : null}
                      {manager.is_core ? <span className="tag tag-amber">핵심</span> : null}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </SectionScaffold>
  )

  const secondary = (
    <div className="space-y-4">
      <SectionScaffold
        title={selectedManager ? `${selectedManager.name} 기본정보` : '운용인력 등록'}
        description="기준 프로필과 현재 소속 정보를 입력합니다."
        actions={selectedManager ? (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              if (window.confirm('선택한 운용인력을 삭제하시겠습니까?')) {
                deleteManagerMut.mutate(selectedManager.id)
              }
            }}
          >
            삭제
          </button>
        ) : null}
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            value={managerForm.name}
            onChange={(event) => setManagerForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="성명"
          />
          <input
            value={managerForm.position ?? ''}
            onChange={(event) => setManagerForm((prev) => ({ ...prev, position: toNullableString(event.target.value) }))}
            placeholder="직위"
          />
          <input
            value={managerForm.department ?? ''}
            onChange={(event) => setManagerForm((prev) => ({ ...prev, department: toNullableString(event.target.value) }))}
            placeholder="부서"
          />
          <input
            type="date"
            value={managerForm.birth_date ?? ''}
            onChange={(event) => setManagerForm((prev) => ({ ...prev, birth_date: event.target.value || null }))}
          />
          <input
            type="date"
            value={managerForm.join_date ?? ''}
            onChange={(event) => setManagerForm((prev) => ({ ...prev, join_date: event.target.value || null }))}
          />
          <input
            type="date"
            value={managerForm.resign_date ?? ''}
            onChange={(event) => setManagerForm((prev) => ({ ...prev, resign_date: event.target.value || null }))}
          />
          <input
            value={managerForm.phone ?? ''}
            onChange={(event) => setManagerForm((prev) => ({ ...prev, phone: toNullableString(event.target.value) }))}
            placeholder="전화번호"
          />
          <input
            value={managerForm.email ?? ''}
            onChange={(event) => setManagerForm((prev) => ({ ...prev, email: toNullableString(event.target.value) }))}
            placeholder="이메일"
          />
          <input
            value={managerForm.nationality ?? ''}
            onChange={(event) => setManagerForm((prev) => ({ ...prev, nationality: toNullableString(event.target.value) }))}
            placeholder="국적"
          />
          <input
            value={managerForm.fax ?? ''}
            onChange={(event) => setManagerForm((prev) => ({ ...prev, fax: toNullableString(event.target.value) }))}
            placeholder="팩스"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-[#475569]">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={managerForm.is_core}
              onChange={(event) => setManagerForm((prev) => ({ ...prev, is_core: event.target.checked }))}
            />
            핵심운용인력
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={managerForm.is_representative}
              onChange={(event) => setManagerForm((prev) => ({ ...prev, is_representative: event.target.checked }))}
            />
            대표자
          </label>
          <button
            type="button"
            className="primary-btn ml-auto"
            onClick={() => saveManagerMut.mutate()}
            disabled={!gpEntityId || !managerForm.name.trim() || saveManagerMut.isPending}
          >
            {selectedManager ? '기본정보 저장' : '운용인력 등록'}
          </button>
        </div>
      </SectionScaffold>

      <SectionScaffold title="보완 데이터 현황" description="경력, 학력, 수상, 투자실적, 조합 이력 입력 상태를 요약합니다.">
        {!selectedManager ? (
          <EmptyState message="왼쪽에서 운용인력을 선택하거나 새로 등록하세요." className="py-10" />
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="metric-tile"><p className="metric-tile-label">경력</p><p className="metric-tile-value">{managerCareers.length}</p></div>
            <div className="metric-tile"><p className="metric-tile-label">학력</p><p className="metric-tile-value">{managerEducations.length}</p></div>
            <div className="metric-tile"><p className="metric-tile-label">수상</p><p className="metric-tile-value">{managerAwards.length}</p></div>
            <div className="metric-tile"><p className="metric-tile-label">투자실적</p><p className="metric-tile-value">{managerInvestments.length}</p></div>
            <div className="metric-tile"><p className="metric-tile-label">펀드 이력</p><p className="metric-tile-value">{managerHistories.length}</p></div>
          </div>
        )}
      </SectionScaffold>

      <SectionScaffold>
        {!selectedManager ? (
          <EmptyState message="운용인력을 선택하면 경력사항을 입력할 수 있습니다." className="py-10" />
        ) : (
          <>
            {subSectionHeader(
              '경력사항',
              '현 회사 이전 경력과 투자경력 여부를 관리합니다.',
              editingCareerId ? '새 경력 입력' : '폼 초기화',
              () => {
                setCareerForm(buildCareerForm(selectedManager.id))
                setEditingCareerId(null)
              },
            )}
            <div className="space-y-2">
              {managerCareers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d8e5fb] bg-[#f8fbff] px-4 py-4 text-sm text-[#64748b]">
                  등록된 경력사항이 없습니다.
                </div>
              ) : (
                managerCareers.map((row) => (
                  <div key={row.id} className="finance-list-row">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0f1f3d]">{row.company_name}</p>
                        <p className="mt-1 text-xs text-[#64748b]">
                          {row.position || '직위 미등록'} · {row.department || '부서 미등록'} · {row.company_type || '회사유형 미등록'}
                        </p>
                        <p className="mt-1 text-[11px] text-[#94a3b8]">
                          {toDateLabel(row.start_date)} ~ {toDateLabel(row.end_date)} / {row.employment_type || '근무유형 미등록'}
                        </p>
                        <p className="mt-2 text-xs text-[#475569]">{row.main_task || '주요업무 미등록'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {row.is_investment_exp ? <span className="tag tag-emerald">투자경력</span> : <span className="tag tag-gray">일반경력</span>}
                        <button
                          type="button"
                          className="secondary-btn btn-xs"
                          onClick={() => {
                            setEditingCareerId(row.id)
                            setCareerForm({
                              fund_manager_id: row.fund_manager_id,
                              company_name: row.company_name,
                              company_type: row.company_type,
                              department: row.department,
                              position: row.position,
                              start_date: row.start_date,
                              end_date: row.end_date,
                              main_task: row.main_task,
                              is_investment_exp: row.is_investment_exp,
                              employment_type: row.employment_type,
                            })
                          }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="secondary-btn btn-xs"
                          onClick={() => {
                            if (window.confirm('이 경력사항을 삭제하시겠습니까?')) {
                              deleteCareerMut.mutate(row.id)
                            }
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                value={careerForm.company_name}
                onChange={(event) => setCareerForm((prev) => ({ ...prev, company_name: event.target.value }))}
                placeholder="회사명"
              />
              <input
                value={careerForm.company_type ?? ''}
                onChange={(event) => setCareerForm((prev) => ({ ...prev, company_type: toNullableString(event.target.value) }))}
                placeholder="회사유형"
              />
              <input
                value={careerForm.employment_type ?? ''}
                onChange={(event) => setCareerForm((prev) => ({ ...prev, employment_type: toNullableString(event.target.value) }))}
                placeholder="근무유형"
              />
              <input
                value={careerForm.department ?? ''}
                onChange={(event) => setCareerForm((prev) => ({ ...prev, department: toNullableString(event.target.value) }))}
                placeholder="부서"
              />
              <input
                value={careerForm.position ?? ''}
                onChange={(event) => setCareerForm((prev) => ({ ...prev, position: toNullableString(event.target.value) }))}
                placeholder="직위"
              />
              <input
                value={careerForm.main_task ?? ''}
                onChange={(event) => setCareerForm((prev) => ({ ...prev, main_task: toNullableString(event.target.value) }))}
                placeholder="주요업무"
              />
              <input
                type="date"
                value={careerForm.start_date ?? ''}
                onChange={(event) => setCareerForm((prev) => ({ ...prev, start_date: event.target.value || null }))}
              />
              <input
                type="date"
                value={careerForm.end_date ?? ''}
                onChange={(event) => setCareerForm((prev) => ({ ...prev, end_date: event.target.value || null }))}
              />
              <label className="flex min-h-[36px] items-center gap-2 rounded-lg border border-[#d8e5fb] bg-[#f8fbff] px-3 text-sm text-[#475569]">
                <input
                  type="checkbox"
                  checked={careerForm.is_investment_exp}
                  onChange={(event) => setCareerForm((prev) => ({ ...prev, is_investment_exp: event.target.checked }))}
                />
                투자경력 여부
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="primary-btn"
                onClick={() => saveCareerMut.mutate()}
                disabled={!careerForm.company_name.trim() || saveCareerMut.isPending}
              >
                {editingCareerId ? '경력 저장' : '경력 추가'}
              </button>
            </div>
          </>
        )}
      </SectionScaffold>

      <SectionScaffold>
        {!selectedManager ? (
          <EmptyState message="운용인력을 선택하면 학력사항을 입력할 수 있습니다." className="py-10" />
        ) : (
          <>
            {subSectionHeader(
              '학력사항',
              '학위와 학교, 전공 정보를 기준일과 무관한 개인 이력으로 관리합니다.',
              editingEducationId ? '새 학력 입력' : '폼 초기화',
              () => {
                setEducationForm(buildEducationForm(selectedManager.id))
                setEditingEducationId(null)
              },
            )}
            <div className="space-y-2">
              {managerEducations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d8e5fb] bg-[#f8fbff] px-4 py-4 text-sm text-[#64748b]">
                  등록된 학력사항이 없습니다.
                </div>
              ) : (
                managerEducations.map((row) => (
                  <div key={row.id} className="finance-list-row">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0f1f3d]">{row.school_name}</p>
                        <p className="mt-1 text-xs text-[#64748b]">
                          {row.degree || '학위 미등록'} · {row.major || '전공 미등록'} · {row.country || '국가 미등록'}
                        </p>
                        <p className="mt-1 text-[11px] text-[#94a3b8]">
                          {toDateLabel(row.admission_date)} ~ {toDateLabel(row.graduation_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="secondary-btn btn-xs"
                          onClick={() => {
                            setEditingEducationId(row.id)
                            setEducationForm({
                              fund_manager_id: row.fund_manager_id,
                              school_name: row.school_name,
                              major: row.major,
                              degree: row.degree,
                              admission_date: row.admission_date,
                              graduation_date: row.graduation_date,
                              country: row.country,
                            })
                          }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="secondary-btn btn-xs"
                          onClick={() => {
                            if (window.confirm('이 학력사항을 삭제하시겠습니까?')) {
                              deleteEducationMut.mutate(row.id)
                            }
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                value={educationForm.school_name}
                onChange={(event) => setEducationForm((prev) => ({ ...prev, school_name: event.target.value }))}
                placeholder="학교명"
              />
              <input
                value={educationForm.major ?? ''}
                onChange={(event) => setEducationForm((prev) => ({ ...prev, major: toNullableString(event.target.value) }))}
                placeholder="전공"
              />
              <input
                value={educationForm.degree ?? ''}
                onChange={(event) => setEducationForm((prev) => ({ ...prev, degree: toNullableString(event.target.value) }))}
                placeholder="학위"
              />
              <input
                type="date"
                value={educationForm.admission_date ?? ''}
                onChange={(event) => setEducationForm((prev) => ({ ...prev, admission_date: event.target.value || null }))}
              />
              <input
                type="date"
                value={educationForm.graduation_date ?? ''}
                onChange={(event) => setEducationForm((prev) => ({ ...prev, graduation_date: event.target.value || null }))}
              />
              <input
                value={educationForm.country ?? ''}
                onChange={(event) => setEducationForm((prev) => ({ ...prev, country: toNullableString(event.target.value) }))}
                placeholder="국가"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="primary-btn"
                onClick={() => saveEducationMut.mutate()}
                disabled={!educationForm.school_name.trim() || saveEducationMut.isPending}
              >
                {editingEducationId ? '학력 저장' : '학력 추가'}
              </button>
            </div>
          </>
        )}
      </SectionScaffold>

      <SectionScaffold>
        {!selectedManager ? (
          <EmptyState message="운용인력을 선택하면 수상경력을 입력할 수 있습니다." className="py-10" />
        ) : (
          <>
            {subSectionHeader(
              '수상경력',
              '모태와 농모태 양식에서 요구하는 개인 수상 이력을 별도 관리합니다.',
              editingAwardId ? '새 수상 입력' : '폼 초기화',
              () => {
                setAwardForm(buildAwardForm(selectedManager.id))
                setEditingAwardId(null)
              },
            )}
            <div className="space-y-2">
              {managerAwards.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d8e5fb] bg-[#f8fbff] px-4 py-4 text-sm text-[#64748b]">
                  등록된 수상경력이 없습니다.
                </div>
              ) : (
                managerAwards.map((row) => (
                  <div key={row.id} className="finance-list-row">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0f1f3d]">{row.award_name}</p>
                        <p className="mt-1 text-xs text-[#64748b]">
                          {row.organization || '수여기관 미등록'} · {toDateLabel(row.award_date)}
                        </p>
                        <p className="mt-2 text-xs text-[#475569]">{row.memo || '비고 없음'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="secondary-btn btn-xs"
                          onClick={() => {
                            setEditingAwardId(row.id)
                            setAwardForm({
                              fund_manager_id: row.fund_manager_id,
                              award_date: row.award_date,
                              award_name: row.award_name,
                              organization: row.organization,
                              memo: row.memo,
                            })
                          }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="secondary-btn btn-xs"
                          onClick={() => {
                            if (window.confirm('이 수상경력을 삭제하시겠습니까?')) {
                              deleteAwardMut.mutate(row.id)
                            }
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                type="date"
                value={awardForm.award_date ?? ''}
                onChange={(event) => setAwardForm((prev) => ({ ...prev, award_date: event.target.value || null }))}
              />
              <input
                value={awardForm.award_name}
                onChange={(event) => setAwardForm((prev) => ({ ...prev, award_name: event.target.value }))}
                placeholder="수상명"
              />
              <input
                value={awardForm.organization ?? ''}
                onChange={(event) => setAwardForm((prev) => ({ ...prev, organization: toNullableString(event.target.value) }))}
                placeholder="수여기관"
              />
            </div>
            <textarea
              className="mt-2 min-h-[88px] w-full"
              value={awardForm.memo ?? ''}
              onChange={(event) => setAwardForm((prev) => ({ ...prev, memo: toNullableString(event.target.value) }))}
              placeholder="비고"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="primary-btn"
                onClick={() => saveAwardMut.mutate()}
                disabled={!awardForm.award_name.trim() || saveAwardMut.isPending}
              >
                {editingAwardId ? '수상 저장' : '수상 추가'}
              </button>
            </div>
          </>
        )}
      </SectionScaffold>

      <SectionScaffold>
        {!selectedManager ? (
          <EmptyState message="운용인력을 선택하면 개인 투자실적을 입력할 수 있습니다." className="py-10" />
        ) : (
          <>
            {subSectionHeader(
              '개인 투자실적',
              '현 회사 외 과거 투자건, 기여율, 회수정보를 수기 보완 데이터로 관리합니다.',
              editingInvestmentId ? '새 투자 입력' : '폼 초기화',
              () => {
                setInvestmentForm(buildInvestmentForm(selectedManager.id))
                setEditingInvestmentId(null)
              },
            )}
            <div className="space-y-2">
              {managerInvestments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d8e5fb] bg-[#f8fbff] px-4 py-4 text-sm text-[#64748b]">
                  등록된 투자실적이 없습니다.
                </div>
              ) : (
                managerInvestments.map((row) => (
                  <div key={row.id} className="finance-list-row">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0f1f3d]">{row.company_name || '투자기업 미등록'}</p>
                        <p className="mt-1 text-xs text-[#64748b]">
                          {(row.fund_name || '펀드명 미등록')} · {(row.instrument || '증권종류 미등록')} · {toDateLabel(row.investment_date)}
                        </p>
                        <p className="mt-1 text-[11px] text-[#94a3b8]">
                          투자금액 {toAmountLabel(row.amount)} / 회수금액 {toAmountLabel(row.exit_amount)} / 소속 {row.source_company_name || '미등록'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {row.is_current_company ? <span className="tag tag-blue">현 회사</span> : <span className="tag tag-gray">과거 회사</span>}
                          {row.role ? <span className="tag tag-indigo">{row.role}</span> : null}
                          {row.contrib_rate != null ? <span className="tag tag-emerald">총기여 {toPercentLabel(row.contrib_rate)}</span> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="secondary-btn btn-xs"
                          onClick={() => {
                            setEditingInvestmentId(row.id)
                            setInvestmentForm({
                              fund_manager_id: row.fund_manager_id,
                              investment_id: row.investment_id,
                              fund_id: row.fund_id,
                              source_company_name: row.source_company_name,
                              fund_name: row.fund_name,
                              company_name: row.company_name,
                              investment_date: row.investment_date,
                              instrument: row.instrument,
                              amount: row.amount,
                              exit_date: row.exit_date,
                              exit_amount: row.exit_amount,
                              role: row.role,
                              discovery_contrib: row.discovery_contrib,
                              review_contrib: row.review_contrib,
                              contrib_rate: row.contrib_rate,
                              is_current_company: row.is_current_company,
                            })
                          }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="secondary-btn btn-xs"
                          onClick={() => {
                            if (window.confirm('이 투자실적을 삭제하시겠습니까?')) {
                              deleteInvestmentMut.mutate(row.id)
                            }
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
              <select
                value={investmentForm.fund_id ?? ''}
                onChange={(event) => {
                  const nextFundId = event.target.value ? Number(event.target.value) : null
                  const matchedFund = fundOptions.find((fund) => fund.id === nextFundId)
                  setInvestmentForm((prev) => ({
                    ...prev,
                    fund_id: nextFundId,
                    fund_name: matchedFund?.name ?? prev.fund_name,
                  }))
                }}
              >
                <option value="">펀드 직접 입력</option>
                {fundOptions.map((fund) => (
                  <option key={fund.id} value={fund.id}>{fund.name}</option>
                ))}
              </select>
              <input
                value={investmentForm.fund_name ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, fund_name: toNullableString(event.target.value) }))}
                placeholder="펀드명"
              />
              <input
                value={investmentForm.company_name ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, company_name: toNullableString(event.target.value) }))}
                placeholder="투자기업명"
              />
              <input
                value={investmentForm.source_company_name ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, source_company_name: toNullableString(event.target.value) }))}
                placeholder="근무회사명"
              />
              <input
                value={investmentForm.role ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, role: toNullableString(event.target.value) }))}
                placeholder="역할"
              />
              <input
                value={investmentForm.instrument ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, instrument: toNullableString(event.target.value) }))}
                placeholder="증권종류"
              />
              <input
                type="date"
                value={investmentForm.investment_date ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, investment_date: event.target.value || null }))}
              />
              <input
                type="date"
                value={investmentForm.exit_date ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, exit_date: event.target.value || null }))}
              />
              <label className="flex min-h-[36px] items-center gap-2 rounded-lg border border-[#d8e5fb] bg-[#f8fbff] px-3 text-sm text-[#475569]">
                <input
                  type="checkbox"
                  checked={investmentForm.is_current_company}
                  onChange={(event) => setInvestmentForm((prev) => ({ ...prev, is_current_company: event.target.checked }))}
                />
                현 회사 실적
              </label>
              <input
                value={investmentForm.amount ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, amount: toNullableNumber(event.target.value) }))}
                placeholder="투자금액"
              />
              <input
                value={investmentForm.exit_amount ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, exit_amount: toNullableNumber(event.target.value) }))}
                placeholder="회수금액"
              />
              <input
                value={investmentForm.contrib_rate ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, contrib_rate: toNullableNumber(event.target.value) }))}
                placeholder="총기여율(0~1)"
              />
              <input
                value={investmentForm.discovery_contrib ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, discovery_contrib: toNullableNumber(event.target.value) }))}
                placeholder="발굴기여율(0~1)"
              />
              <input
                value={investmentForm.review_contrib ?? ''}
                onChange={(event) => setInvestmentForm((prev) => ({ ...prev, review_contrib: toNullableNumber(event.target.value) }))}
                placeholder="심사기여율(0~1)"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="primary-btn"
                onClick={() => saveInvestmentMut.mutate()}
                disabled={!investmentForm.company_name?.trim() || saveInvestmentMut.isPending}
              >
                {editingInvestmentId ? '투자실적 저장' : '투자실적 추가'}
              </button>
            </div>
          </>
        )}
      </SectionScaffold>

      <SectionScaffold>
        {!selectedManager ? (
          <EmptyState message="운용인력을 선택하면 펀드별 변경 이력을 입력할 수 있습니다." className="py-10" />
        ) : (
          <>
            {subSectionHeader(
              '펀드별 이력',
              '선임, 퇴임, 역할변경 등 제안서 전용 인력 변경 이력을 관리합니다.',
              editingHistoryId ? '새 이력 입력' : '폼 초기화',
              () => {
                setHistoryForm(buildHistoryForm(selectedManager.id, defaultFundId))
                setEditingHistoryId(null)
              },
            )}
            <div className="space-y-2">
              {managerHistories.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d8e5fb] bg-[#f8fbff] px-4 py-4 text-sm text-[#64748b]">
                  등록된 펀드 이력이 없습니다.
                </div>
              ) : (
                managerHistories.map((row) => (
                  <div key={row.id} className="finance-list-row">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0f1f3d]">
                          {fundOptions.find((fund) => fund.id === row.fund_id)?.name || `펀드 #${row.fund_id}`}
                        </p>
                        <p className="mt-1 text-xs text-[#64748b]">
                          {row.change_type} · {toDateLabel(row.change_date)}
                        </p>
                        <p className="mt-1 text-[11px] text-[#94a3b8]">
                          변경 전 {row.role_before || '-'} / 변경 후 {row.role_after || '-'}
                        </p>
                        <p className="mt-2 text-xs text-[#475569]">{row.memo || '비고 없음'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="secondary-btn btn-xs"
                          onClick={() => {
                            setEditingHistoryId(row.id)
                            setHistoryForm({
                              fund_id: row.fund_id,
                              fund_manager_id: row.fund_manager_id,
                              change_date: row.change_date,
                              change_type: row.change_type,
                              role_before: row.role_before,
                              role_after: row.role_after,
                              memo: row.memo,
                            })
                          }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="secondary-btn btn-xs"
                          onClick={() => {
                            if (window.confirm('이 펀드 이력을 삭제하시겠습니까?')) {
                              deleteHistoryMut.mutate(row.id)
                            }
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
              <select
                value={historyForm.fund_id || ''}
                onChange={(event) => setHistoryForm((prev) => ({ ...prev, fund_id: Number(event.target.value || 0) }))}
              >
                <option value="">대상 펀드 선택</option>
                {fundOptions.map((fund) => (
                  <option key={fund.id} value={fund.id}>{fund.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={historyForm.change_date}
                onChange={(event) => setHistoryForm((prev) => ({ ...prev, change_date: event.target.value }))}
              />
              <input
                value={historyForm.change_type}
                onChange={(event) => setHistoryForm((prev) => ({ ...prev, change_type: event.target.value }))}
                placeholder="변경구분"
              />
              <input
                value={historyForm.role_before ?? ''}
                onChange={(event) => setHistoryForm((prev) => ({ ...prev, role_before: toNullableString(event.target.value) }))}
                placeholder="변경 전 역할"
              />
              <input
                value={historyForm.role_after ?? ''}
                onChange={(event) => setHistoryForm((prev) => ({ ...prev, role_after: toNullableString(event.target.value) }))}
                placeholder="변경 후 역할"
              />
            </div>
            <textarea
              className="mt-2 min-h-[88px] w-full"
              value={historyForm.memo ?? ''}
              onChange={(event) => setHistoryForm((prev) => ({ ...prev, memo: toNullableString(event.target.value) }))}
              placeholder="비고"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="primary-btn"
                onClick={() => saveHistoryMut.mutate()}
                disabled={!historyForm.fund_id || !historyForm.change_type.trim() || saveHistoryMut.isPending}
              >
                {editingHistoryId ? '펀드 이력 저장' : '펀드 이력 추가'}
              </button>
            </div>
          </>
        )}
      </SectionScaffold>
    </div>
  )

  return <WorkbenchSplit primary={primary} secondary={secondary} />
}
