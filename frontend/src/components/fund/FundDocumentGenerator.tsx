import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createDocumentVariable,
  deleteGeneration,
  downloadGeneratedDocuments,
  fetchAutoFillVariables,
  fetchDocumentVariables,
  fetchGenerationHistory,
  fetchMarkers,
  fetchTemplateStructure,
  generateDocuments,
  type DocumentGenerateRequest,
  type MarkerInfo,
} from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import DocumentGenerationProgress from './DocumentGenerationProgress'

type FundDocumentGeneratorProps = {
  fundId: number
  fundName: string
}

const STAGE_OPTIONS = [
  { value: 1, label: '1. 고유번호증 발급' },
  { value: 2, label: '2. 수탁업무' },
  { value: 3, label: '3. 결성총회 전 통지' },
  { value: 4, label: '4. 결성총회' },
  { value: 5, label: '5. 벤처투자조합 등록' },
]

const FALLBACK_MARKERS: MarkerInfo[] = [
  { section: '조합 기본정보', label: '조합명', key: '조합명', required: true, description: '공식 조합 이름', default_value: '트리거 메디테크  호 조합' },
  { section: '조합 기본정보', label: '조합명 (파일명용, 띄어쓰기 없음)', key: '조합명_파일명', required: true, description: '파일명용 조합명', default_value: '트리거메디테크호조합' },
  { section: '조합 기본정보', label: '조합 호수', key: '조합_호수', required: false, description: '호수 단독 표기', default_value: '3호' },
  { section: '조합 기본정보', label: '업무집행조합원 (정식)', key: '업무집행조합원_정식', required: true, description: 'GP 법적 정식 명칭', default_value: '트리거투자파트너스 유한회사' },
  { section: '조합 기본정보', label: '업무집행조합원 (약칭)', key: '업무집행조합원_약칭', required: true, description: 'GP 약칭', default_value: '트리거투자파트너스(유)' },
  { section: '조합 기본정보', label: '대표이사', key: '대표이사', required: true, description: '대표이사', default_value: '서원일' },
  { section: '조합 기본정보', label: '대표펀드매니저', key: '대표펀드매니저', required: false, description: '대표 펀드매니저', default_value: '서원일' },
  { section: '번호', label: '사업자등록번호', key: '사업자등록번호', required: true, description: '사업자등록번호', default_value: '786-88-02871' },
  { section: '번호', label: '법인등록번호', key: '법인등록번호', required: false, description: '법인등록번호', default_value: '164714-0005810' },
  { section: '번호', label: '고유번호', key: '고유번호', required: true, description: '고유번호', default_value: '479-80-03340' },
  { section: '규모', label: '총 출자금 (숫자)', key: '총출자금_숫자', required: true, description: '숫자 표기', default_value: '2,275,000,000' },
  { section: '규모', label: '총 출자금 (한글)', key: '총출자금_한글', required: true, description: '한글 표기', default_value: '금이십이억칠천오백만원' },
  { section: '규모', label: '총 출자금 (원화기호 포함)', key: '총출자금_기호', required: true, description: '원화 표기', default_value: '₩2,275,000,000' },
  { section: '규모', label: '총 출자좌수', key: '총출자좌수', required: true, description: '총 좌수', default_value: '2,275' },
  { section: '규모', label: '조합원 총수', key: '조합원총수', required: true, description: '조합원 총수', default_value: '19' },
  { section: '규모', label: '유한책임조합원 수', key: '유한책임조합원수', required: true, description: 'LP 수', default_value: '18' },
  { section: '규모', label: '존속기간', key: '존속기간', required: true, description: '존속기간', default_value: '5년' },
  { section: '일정', label: '결성총회 일시 (전체)', key: '결성총회일시_풀', required: true, description: '결성총회 전체 일시', default_value: '2025년 10월 24일(금요일) 오전 10시' },
  { section: '일정', label: '결성총회 날짜', key: '결성총회일_날짜', required: true, description: '결성총회 날짜', default_value: '2025년 10월 24일' },
  { section: '일정', label: '결성총회 요일', key: '결성총회일_요일', required: false, description: '결성총회 요일', default_value: '금요일' },
  { section: '일정', label: '결성총회 날짜 (약식)', key: '결성총회일_약식', required: false, description: '약식 날짜', default_value: '2025.10.24' },
  { section: '일정', label: '소집통지 날짜', key: '소집통지날짜', required: true, description: '소집통지 날짜', default_value: '2025년 10월 15일' },
  { section: '일정', label: '소집통지 날짜 (약식)', key: '소집통지날짜_약식', required: false, description: '약식 소집통지 날짜', default_value: '2025. 10. 20' },
  { section: '일정', label: '등록신청일', key: '등록신청일', required: true, description: '등록신청일', default_value: '2025년   10월  27일' },
  { section: '일정', label: '납입기한', key: '납입기한', required: true, description: '납입기한', default_value: '2025년 10월 24일(금) 오전 10시까지' },
  { section: '일정', label: '개업일', key: '개업일', required: true, description: '개업일', default_value: '2025.09.19' },
  { section: '일정', label: '임대차 시작일', key: '임대차_시작', required: false, description: '임대차 시작일', default_value: '2025.09.19' },
  { section: '일정', label: '임대차 종료일', key: '임대차_종료', required: false, description: '임대차 종료일', default_value: '2027.01.19' },
  { section: '일정', label: '임대차 기간', key: '임대차_기간', required: false, description: '임대차 기간', default_value: '2025.09.19 ~ 2027.01.19' },
  { section: '장소·계좌', label: '사업장 주소 (정식)', key: '사업장주소_정식', required: true, description: '정식 주소', default_value: '서울특별시 마포구 양화로7길 70, 5층(서교동)' },
  { section: '장소·계좌', label: '사업장 주소 (약식)', key: '사업장주소_약식', required: false, description: '약식 주소', default_value: '서울 마포구 양화로7길 70,컬처큐브 5층' },
  { section: '장소·계좌', label: '우편번호', key: '우편번호', required: false, description: '우편번호', default_value: '04029' },
  { section: '장소·계좌', label: '전화번호', key: '전화번호', required: false, description: '전화번호', default_value: '02-2038-2456' },
  { section: '장소·계좌', label: '팩스번호', key: '팩스번호', required: false, description: '팩스번호', default_value: '02-6953-2456' },
  { section: '장소·계좌', label: '납입계좌 은행', key: '납입계좌은행', required: true, description: '납입 은행명', default_value: '국민은행' },
  { section: '장소·계좌', label: '납입계좌 번호', key: '납입계좌번호', required: true, description: '납입 계좌번호', default_value: '003190-15-050045' },
  { section: '장소·계좌', label: '임대차 면적', key: '임대차_면적', required: false, description: '임대차 면적', default_value: '111.83㎡' },
  { section: '기관·보수', label: '수탁기관', key: '수탁기관', required: true, description: '수탁기관', default_value: '유안타증권' },
  { section: '기관·보수', label: '수탁보수', key: '수탁보수', required: true, description: '수탁보수', default_value: '연간 400만원' },
  { section: '기관·보수', label: '외부감사인', key: '외부감사인', required: true, description: '외부감사인', default_value: '태성회계법인' },
  { section: '기관·보수', label: '감사보수', key: '감사보수', required: true, description: '감사보수', default_value: '150만원' },
  { section: '문서번호·담당자', label: '문서번호 (결성총회 통지)', key: '문서번호_통지', required: false, description: '문서번호(통지)', default_value: '트리거-2025-23호' },
  { section: '문서번호·담당자', label: '문서번호 (벤처투자조합 등록)', key: '문서번호_등록', required: false, description: '문서번호(등록)', default_value: '트리거-2025-28호' },
  { section: '문서번호·담당자', label: '담당자명', key: '담당자명', required: false, description: '담당자명', default_value: '홍운학' },
  { section: '문서번호·담당자', label: '담당자 이메일', key: '담당자이메일', required: false, description: '담당자 이메일', default_value: 'hwh@triggerip.com' },
  { section: '문서번호·담당자', label: '담당자 연락처', key: '담당자연락처', required: false, description: '담당자 연락처', default_value: '010-9473-3142' },
]

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

function statusChip(status: string): { label: string; className: string } {
  if (status === 'pending') return { label: '대기', className: 'bg-amber-100 text-amber-700' }
  if (status === 'processing') return { label: '처리 중', className: 'bg-blue-100 text-blue-700' }
  if (status === 'completed') return { label: '완료', className: 'bg-emerald-100 text-emerald-700' }
  return { label: '실패', className: 'bg-red-100 text-red-700' }
}

export default function FundDocumentGenerator({ fundId, fundName }: FundDocumentGeneratorProps) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()

  const [variables, setVariables] = useState<Record<string, string>>({})
  const [selectedPresetId, setSelectedPresetId] = useState<number | ''>('')
  const [selectedStages, setSelectedStages] = useState<number[]>(STAGE_OPTIONS.map((item) => item.value))
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [highlightKeys, setHighlightKeys] = useState<string[]>([])
  const [progressOpen, setProgressOpen] = useState(false)
  const [activeGenerationId, setActiveGenerationId] = useState<number | null>(null)
  const [downloadingGenerationId, setDownloadingGenerationId] = useState<number | null>(null)
  const [initialized, setInitialized] = useState(false)

  const markersQuery = useQuery({
    queryKey: ['document-generation-markers'],
    queryFn: fetchMarkers,
  })

  const templatesQuery = useQuery({
    queryKey: ['document-generation-templates'],
    queryFn: fetchTemplateStructure,
  })

  const presetsQuery = useQuery({
    queryKey: ['document-generation-presets', fundId],
    queryFn: () => fetchDocumentVariables(fundId),
    enabled: fundId > 0,
  })

  const historyQuery = useQuery({
    queryKey: ['document-generation-history', fundId],
    queryFn: () => fetchGenerationHistory(fundId),
    enabled: fundId > 0,
    refetchInterval: 5000,
  })

  const markerDefs = useMemo(
    () => (markersQuery.data && markersQuery.data.length > 0 ? markersQuery.data : FALLBACK_MARKERS),
    [markersQuery.data],
  )

  const defaults = useMemo(() => {
    const initial: Record<string, string> = {}
    markerDefs.forEach((marker) => {
      initial[marker.key] = marker.default_value || ''
    })
    return initial
  }, [markerDefs])

  const groupedSections = useMemo(() => {
    const grouped = new Map<string, MarkerInfo[]>()
    markerDefs.forEach((marker) => {
      const current = grouped.get(marker.section) ?? []
      current.push(marker)
      grouped.set(marker.section, current)
    })
    return Array.from(grouped.entries())
  }, [markerDefs])

  const requiredMissingKeys = useMemo(
    () =>
      markerDefs
        .filter((marker) => marker.required)
        .filter((marker) => !(variables[marker.key] || '').trim())
        .map((marker) => marker.key),
    [markerDefs, variables],
  )

  const createPresetMut = useMutation({
    mutationFn: (payload: { fund_id: number; name: string; variables: Record<string, string> }) =>
      createDocumentVariable(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-generation-presets', fundId] })
      addToast('success', '프리셋을 저장했습니다.')
    },
    onError: (error) => addToast('error', error instanceof Error ? error.message : '프리셋 저장에 실패했습니다.'),
  })

  const autoFillMut = useMutation({
    mutationFn: () => fetchAutoFillVariables(fundId),
    onSuccess: (result) => {
      setVariables((prev) => ({ ...prev, ...result.variables }))
      const empties = Object.entries(result.variables)
        .filter(([, value]) => !String(value || '').trim())
        .map(([key]) => key)
      setHighlightKeys(empties)
      addToast('success', `자동 채움 완료 (${result.mapped_keys.length}개 필드 반영)`)
    },
    onError: (error) => addToast('error', error instanceof Error ? error.message : '자동 채움에 실패했습니다.'),
  })

  const generateMut = useMutation({
    mutationFn: (payload: DocumentGenerateRequest) => generateDocuments(payload),
    onSuccess: (result) => {
      setActiveGenerationId(result.generation_id)
      setProgressOpen(true)
      queryClient.invalidateQueries({ queryKey: ['document-generation-history', fundId] })
      addToast('success', '서류 생성이 시작되었습니다.')
    },
    onError: (error) => addToast('error', error instanceof Error ? error.message : '서류 생성 요청에 실패했습니다.'),
  })

  const deleteHistoryMut = useMutation({
    mutationFn: (id: number) => deleteGeneration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-generation-history', fundId] })
      addToast('success', '생성 이력을 삭제했습니다.')
    },
    onError: (error) => addToast('error', error instanceof Error ? error.message : '생성 이력 삭제에 실패했습니다.'),
  })

  useEffect(() => {
    setInitialized(false)
    setVariables({})
    setSelectedPresetId('')
    setSelectedStages(STAGE_OPTIONS.map((item) => item.value))
    setHighlightKeys([])
    setProgressOpen(false)
    setActiveGenerationId(null)
  }, [fundId])

  useEffect(() => {
    if (initialized || markerDefs.length === 0) return
    setVariables(defaults)
    const firstSection = markerDefs[0].section
    setExpandedSections({ [firstSection]: true })
    setInitialized(true)
  }, [defaults, initialized, markerDefs])

  const canGenerate = requiredMissingKeys.length === 0 && selectedStages.length > 0 && !generateMut.isPending
  const totalTemplates = templatesQuery.data?.total_templates ?? 0
  const presets = presetsQuery.data ?? []
  const historyRows = historyQuery.data ?? []

  const onToggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const onToggleStage = (stage: number) => {
    setSelectedStages((prev) =>
      prev.includes(stage) ? prev.filter((item) => item !== stage) : [...prev, stage].sort((a, b) => a - b),
    )
  }

  const onChangeField = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }))
    if (highlightKeys.includes(key)) {
      setHighlightKeys((prev) => prev.filter((item) => item !== key))
    }
  }

  const onApplyPreset = (presetId: number | '') => {
    setSelectedPresetId(presetId)
    if (presetId === '') return
    const preset = presets.find((item) => item.id === presetId)
    if (!preset) return
    setVariables((prev) => ({ ...prev, ...preset.variables }))
    setHighlightKeys([])
  }

  const onResetDefaults = () => {
    setVariables(defaults)
    setHighlightKeys([])
    setSelectedPresetId('')
  }

  const onSavePreset = () => {
    const nameInput = prompt('프리셋 이름을 입력하세요.')
    const name = (nameInput || '').trim()
    if (!name) return
    createPresetMut.mutate({ fund_id: fundId, name, variables })
  }

  const onGenerate = () => {
    if (!canGenerate) return
    const selectedStageLabels = STAGE_OPTIONS
      .filter((item) => selectedStages.includes(item.value))
      .map((item) => item.label)
      .join(', ')
    const confirmed = confirm(
      `선택 단계(${selectedStages.length}개): ${selectedStageLabels}\n서류 생성을 시작하시겠습니까?`,
    )
    if (!confirmed) return
    generateMut.mutate({
      fund_id: fundId,
      variables,
      stages: [...selectedStages].sort((a, b) => a - b),
    })
  }

  const onDownload = async (generationId: number) => {
    setDownloadingGenerationId(generationId)
    try {
      const blob = await downloadGeneratedDocuments(generationId)
      const datePart = new Date().toISOString().slice(0, 10)
      const filename = `${fundName.replace(/\s+/g, '_')}_서류_${generationId}_${datePart}.zip`
      downloadBlob(blob, filename)
      addToast('success', 'ZIP 다운로드를 시작했습니다.')
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : '다운로드에 실패했습니다.')
    } finally {
      setDownloadingGenerationId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-base space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">📄 조합 서류 자동 생성</h3>
            <p className="mt-1 text-xs text-gray-500">템플릿: {totalTemplates}개 | 마커: {markerDefs.length}개</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedPresetId}
              onChange={(event) => onApplyPreset(event.target.value ? Number(event.target.value) : '')}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">프리셋 선택</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}{preset.is_default ? ' (기본)' : ''}
                </option>
              ))}
            </select>
            <button onClick={onSavePreset} disabled={createPresetMut.isPending} className="secondary-btn">
              {createPresetMut.isPending ? '저장 중...' : '💾 저장'}
            </button>
            <button onClick={onResetDefaults} className="secondary-btn">↻ 초기화</button>
            <button onClick={() => autoFillMut.mutate()} disabled={autoFillMut.isPending} className="secondary-btn">
              {autoFillMut.isPending ? '자동채움 중...' : '🔄 자동채움'}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">생성 단계 선택</p>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setSelectedStages(STAGE_OPTIONS.map((item) => item.value))}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-600 hover:bg-gray-50"
              >
                전체 선택
              </button>
              <button
                onClick={() => setSelectedStages([])}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-600 hover:bg-gray-50"
              >
                전체 해제
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1 text-sm md:grid-cols-2 xl:grid-cols-3">
            {STAGE_OPTIONS.map((stage) => (
              <label key={stage.value} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedStages.includes(stage.value)}
                  onChange={() => onToggleStage(stage.value)}
                />
                <span>{stage.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {groupedSections.map(([section, markers]) => {
            const opened = Boolean(expandedSections[section])
            return (
              <div key={section} className="rounded-lg border border-gray-200">
                <button
                  onClick={() => onToggleSection(section)}
                  className="flex w-full items-center justify-between rounded-t-lg bg-gray-50 px-3 py-2 text-left"
                >
                  <span className="text-sm font-semibold text-gray-700">{section}</span>
                  <span className="text-xs text-gray-500">{opened ? '접기' : '열기'}</span>
                </button>
                {opened && (
                  <div className="space-y-2 px-3 py-3">
                    {markers.map((marker) => {
                      const value = variables[marker.key] ?? ''
                      const isMissingRequired = marker.required && !value.trim()
                      const isHighlighted = highlightKeys.includes(marker.key) && !value.trim()
                      return (
                        <div key={marker.key} className="grid grid-cols-1 gap-1 md:grid-cols-12 md:items-center">
                          <label className="text-xs font-medium text-gray-600 md:col-span-4">
                            {marker.required ? '* ' : ''}{marker.label}
                          </label>
                          <div className="md:col-span-8">
                            <input
                              value={value}
                              onChange={(event) => onChangeField(marker.key, event.target.value)}
                              className={`w-full rounded border px-3 py-2 text-sm ${
                                isMissingRequired
                                  ? 'border-red-300 bg-red-50'
                                  : isHighlighted
                                    ? 'border-amber-300 bg-amber-50'
                                    : 'border-gray-300 bg-white'
                              }`}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-blue-900">
              선택 단계 {selectedStages.length}개 / 총 {STAGE_OPTIONS.length}개
            </p>
            <p className="text-xs text-blue-700">필수 미입력 {requiredMissingKeys.length}개</p>
          </div>
          <button onClick={onGenerate} disabled={!canGenerate} className="primary-btn w-full">
            {generateMut.isPending ? '생성 요청 중...' : `🚀 서류 생성 (${selectedStages.length}개 단계)`}
          </button>
          {!canGenerate && (
            <p className="mt-2 text-xs text-red-600">필수 항목 및 단계 선택을 확인하세요.</p>
          )}
        </div>
      </div>

      <div className="card-base">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-800">생성 이력</h4>
          <button
            onClick={() => historyQuery.refetch()}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            새로고침
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">생성일시</th>
                <th className="px-3 py-2 text-left">상태</th>
                <th className="px-3 py-2 text-right">성공</th>
                <th className="px-3 py-2 text-right">실패</th>
                <th className="px-3 py-2 text-left">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {historyRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">
                    생성 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                historyRows.map((row) => {
                  const chip = statusChip(row.status)
                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2">{row.id}</td>
                      <td className="px-3 py-2">{new Date(row.created_at).toLocaleString('ko-KR')}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}>{chip.label}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{row.success_count}</td>
                      <td className="px-3 py-2 text-right">{row.failed_count}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(row.status === 'processing' || row.status === 'pending') && (
                            <button
                              onClick={() => {
                                setActiveGenerationId(row.id)
                                setProgressOpen(true)
                              }}
                              className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                            >
                              진행 보기
                            </button>
                          )}
                          {row.status === 'completed' && (
                            <button
                              onClick={() => onDownload(row.id)}
                              disabled={downloadingGenerationId === row.id}
                              className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              {downloadingGenerationId === row.id ? '다운로드 중...' : '다운로드'}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (!confirm('이 생성 이력을 삭제하시겠습니까?')) return
                              deleteHistoryMut.mutate(row.id)
                            }}
                            disabled={deleteHistoryMut.isPending}
                            className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DocumentGenerationProgress
        open={progressOpen}
        generationId={activeGenerationId}
        onClose={() => setProgressOpen(false)}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['document-generation-history', fundId] })
        }}
        onDownload={onDownload}
        downloadPending={activeGenerationId != null && downloadingGenerationId === activeGenerationId}
      />
    </div>
  )
}

