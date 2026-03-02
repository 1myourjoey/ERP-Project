import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { useToast } from '../../contexts/ToastContext'
import {
  analyzeTemplateFile,
  fetchFundLPs,
  fetchFunds,
  fetchTemplateInputCache,
  registerTemplate,
  testGenerateRegisteredTemplate,
  type Fund,
  type LP,
  type TemplateAnalyzeMarker,
  type TemplateRegisterInput,
  type TemplateVariableRegistrationInput,
} from '../../lib/api'

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

function normalizeMarker(marker: TemplateAnalyzeMarker, displayOrder: number): TemplateVariableRegistrationInput {
  return {
    marker_name: marker.marker,
    display_label: marker.marker,
    source_type: marker.source,
    source_field: null,
    default_value: '',
    is_required: true,
    display_order: displayOrder,
    text: marker.text || null,
  }
}

interface RegistrationWizardProps {
  onRegistered?: (templateId: number) => void
}

export default function RegistrationWizard({ onRegistered }: RegistrationWizardProps) {
  const { addToast } = useToast()

  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [documentType, setDocumentType] = useState('출자확인서')
  const [extractedText, setExtractedText] = useState('')
  const [existingMarkers, setExistingMarkers] = useState<string[]>([])
  const [variables, setVariables] = useState<TemplateVariableRegistrationInput[]>([])
  const [registeredTemplateId, setRegisteredTemplateId] = useState<number | null>(null)
  const [testFundId, setTestFundId] = useState<number | ''>('')
  const [testLpId, setTestLpId] = useState<number | ''>('')
  const [manualVars, setManualVars] = useState<Record<string, string>>({})

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })

  const { data: lps = [] } = useQuery<LP[]>({
    queryKey: ['fundLps', testFundId],
    queryFn: () => fetchFundLPs(Number(testFundId)),
    enabled: testFundId !== '',
  })

  const analyzeMutation = useMutation({
    mutationFn: analyzeTemplateFile,
    onSuccess: (result) => {
      setExtractedText(result.extracted_text)
      setExistingMarkers(result.existing_markers)
      setVariables(result.identified_markers.map((marker, index) => normalizeMarker(marker, index)))
      setStep(2)
      addToast('success', '템플릿 분석이 완료되었습니다.')
    },
    onError: () => addToast('error', '템플릿 분석에 실패했습니다.'),
  })

  const registerMutation = useMutation({
    mutationFn: registerTemplate,
    onSuccess: (result) => {
      setRegisteredTemplateId(result.template_id)
      onRegistered?.(result.template_id)
      addToast('success', '템플릿이 성공적으로 등록되었습니다.')
    },
    onError: () => addToast('error', '템플릿 등록에 실패했습니다.'),
  })

  const testMutation = useMutation({
    mutationFn: testGenerateRegisteredTemplate,
  })

  useEffect(() => {
    if (testFundId !== '' || funds.length === 0) return
    setTestFundId(funds[0].id)
  }, [testFundId, funds])

  useEffect(() => {
    if (testLpId !== '' || lps.length === 0) return
    setTestLpId(lps[0].id)
  }, [testLpId, lps])

  useEffect(() => {
    if (!file || templateName.trim()) return
    const baseName = file.name.replace(/\.[^/.]+$/, '')
    setTemplateName(baseName)
  }, [file, templateName])

  const manualMarkers = useMemo(
    () => variables.filter((row) => (row.source_type || '').toLowerCase() === 'manual').map((row) => row.marker_name),
    [variables],
  )

  const cacheQuery = useQuery({
    queryKey: ['templateInputCache', registeredTemplateId, testFundId],
    queryFn: () => fetchTemplateInputCache(Number(testFundId), Number(registeredTemplateId)),
    enabled: registeredTemplateId !== null && testFundId !== '',
  })

  useEffect(() => {
    if (!cacheQuery.data) return
    setManualVars((prev) => ({ ...cacheQuery.data.inputs, ...prev }))
  }, [cacheQuery.data])

  const canAnalyze = !!file
  const canProceedStep2 = variables.length > 0
  const canProceedStep3 = variables.some((row) => row.marker_name?.trim())
  const canTest = testFundId !== '' && testLpId !== ''

  const updateVariable = (index: number, patch: Partial<TemplateVariableRegistrationInput>) => {
    setVariables((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)))
  }

  const addVariable = () => {
    setVariables((prev) => [
      ...prev,
      {
        marker_name: '',
        display_label: '',
        source_type: 'manual',
        source_field: null,
        default_value: '',
        is_required: true,
        display_order: prev.length,
        text: '',
      },
    ])
  }

  const removeVariable = (index: number) => {
    setVariables((prev) => prev.filter((_, idx) => idx !== index))
  }

  const ensureRegistered = async (): Promise<number> => {
    if (registeredTemplateId) return registeredTemplateId
    if (!file) throw new Error('템플릿 파일을 선택해주세요.')
    if (!templateName.trim()) throw new Error('템플릿 이름을 입력해주세요.')

    const payload: TemplateRegisterInput = {
      file,
      name: templateName.trim(),
      document_type: documentType.trim() || '기타',
      variables: variables
        .filter((row) => row.marker_name && row.marker_name.trim())
        .map((row, idx) => ({
          ...row,
          marker_name: row.marker_name.trim(),
          display_label: row.display_label?.trim() || row.marker_name.trim(),
          display_order: idx,
        })),
    }
    const result = await registerMutation.mutateAsync(payload)
    return result.template_id
  }

  const handleAnalyze = async () => {
    if (!file) return
    await analyzeMutation.mutateAsync(file)
  }

  const handleRegisterOnly = async () => {
    try {
      await ensureRegistered()
      setStep(4)
    } catch {
      addToast('error', '템플릿 등록에 실패했습니다.')
    }
  }

  const handleTestGenerate = async () => {
    if (!canTest) {
      addToast('warning', '테스트 생성을 위해 펀드와 LP를 선택해주세요.')
      return
    }
    try {
      const templateId = await ensureRegistered()
      const manualPayload: Record<string, string> = {}
      manualMarkers.forEach((marker) => {
        manualPayload[marker] = manualVars[marker] ?? ''
      })
      const blob = await testMutation.mutateAsync({
        template_id: templateId,
        fund_id: Number(testFundId),
        lp_id: Number(testLpId),
        manual_vars: manualPayload,
      })
      downloadBlob(blob, `template_test_${templateId}.docx`)
      addToast('success', '테스트 문서 생성이 완료되었습니다.')
    } catch {
      addToast('error', '테스트 문서 생성에 실패했습니다.')
    }
  }

  return (
    <div className="card-base space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-title text-lg font-semibold text-[#0f1f3d]">템플릿 등록 마법사</h3>
          <p className="text-xs text-[#64748b]">{step}단계 / 4단계</p>
        </div>
        <div className="text-xs text-[#64748b]">DOCX / HWP / HWPX</div>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <div className="rounded-xl border border-dashed border-[#d8e5fb] bg-[#f5f9ff] p-4">
            <label className="text-sm font-semibold text-[#0f1f3d]">템플릿 파일</label>
            <input
              type="file"
              accept=".docx,.hwp,.hwpx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm"
            />
            <p className="mt-2 text-xs text-[#64748b]">{file ? file.name : '선택된 파일이 없습니다.'}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-[#64748b]">템플릿명</span>
              <input
                type="text"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#64748b]">문서 유형</span>
              <input
                type="text"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
                className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <button onClick={handleAnalyze} className="primary-btn" disabled={!canAnalyze || analyzeMutation.isPending}>
            {analyzeMutation.isPending ? '분석 중...' : '템플릿 분석'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
            <p className="text-xs font-semibold uppercase text-[#64748b]">문서 내 기존 마커 목록</p>
            {existingMarkers.length === 0 ? (
              <p className="mt-2 text-sm text-[#64748b]">문서 내에서 기본 {'{{marker}}'} 형태의 마커가 발견되지 않았습니다.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {existingMarkers.map((marker) => (
                  <span key={marker} className="rounded-full border border-[#e7ddb6] bg-[#fff7d6] px-2 py-0.5 text-xs text-[#0f1f3d]">
                    {marker}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {variables.map((row, index) => (
              <div key={`${row.marker_name}-${index}`} className="rounded-xl border border-[#d8e5fb] bg-white p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#64748b]">원문 텍스트</span>
                    <input
                      type="text"
                      value={row.text ?? ''}
                      onChange={(event) => updateVariable(index, { text: event.target.value })}
                      className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#64748b]">마커명</span>
                    <input
                      type="text"
                      value={row.marker_name}
                      onChange={(event) => updateVariable(index, { marker_name: event.target.value })}
                      className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#64748b]">소스</span>
                    <select
                      value={row.source_type ?? 'manual'}
                      onChange={(event) => updateVariable(index, { source_type: event.target.value })}
                      className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                    >
                      <option value="fund">펀드</option>
                      <option value="lp">LP</option>
                      <option value="gp">GP</option>
                      <option value="investment">투자건</option>
                      <option value="manual">수동입력</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button className="secondary-btn" onClick={() => removeVariable(index)}>
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="secondary-btn" onClick={addVariable}>
              변수 추가
            </button>
            <button className="primary-btn" disabled={!canProceedStep2} onClick={() => setStep(3)}>
              다음: 변수 매핑
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="space-y-2">
            {variables.map((row, index) => (
              <div key={`${row.marker_name}-${index}`} className="rounded-xl border border-[#d8e5fb] bg-white p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#64748b]">표시 라벨</span>
                    <input
                      type="text"
                      value={row.display_label ?? ''}
                      onChange={(event) => updateVariable(index, { display_label: event.target.value })}
                      className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#64748b]">소스 필드 (선택)</span>
                    <input
                      type="text"
                      value={row.source_field ?? ''}
                      onChange={(event) => updateVariable(index, { source_field: event.target.value })}
                      className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#64748b]">기본값</span>
                    <input
                      type="text"
                      value={row.default_value ?? ''}
                      onChange={(event) => updateVariable(index, { default_value: event.target.value })}
                      className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-[#64748b]">
                  <input
                    type="checkbox"
                    checked={row.is_required ?? true}
                    onChange={(event) => updateVariable(index, { is_required: event.target.checked })}
                  />
                  필수 항목
                </label>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="secondary-btn" onClick={() => setStep(2)}>
              이전
            </button>
            <button className="primary-btn" disabled={!canProceedStep3} onClick={() => setStep(4)}>
              다음: 등록 및 테스트
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-[#64748b]">테스트 펀드</span>
              <select
                value={testFundId}
                onChange={(event) => setTestFundId(event.target.value ? Number(event.target.value) : '')}
                className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
              >
                <option value="">펀드를 선택</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#64748b]">테스트 LP</span>
              <select
                value={testLpId}
                onChange={(event) => setTestLpId(event.target.value ? Number(event.target.value) : '')}
                className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
              >
                <option value="">LP를 선택</option>
                {lps.map((lp) => (
                  <option key={lp.id} value={lp.id}>
                    {lp.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {manualMarkers.length > 0 && (
            <div className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
              <p className="text-xs font-semibold uppercase text-[#64748b]">수동 입력값 (캐시)</p>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                {manualMarkers.map((marker) => (
                  <label key={marker} className="space-y-1">
                    <span className="text-[11px] text-[#64748b]">{marker}</span>
                    <input
                      type="text"
                      value={manualVars[marker] ?? ''}
                      onChange={(event) =>
                        setManualVars((prev) => ({
                          ...prev,
                          [marker]: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="secondary-btn" onClick={() => setStep(3)}>
              이전
            </button>
            <button className="secondary-btn" onClick={handleRegisterOnly} disabled={registerMutation.isPending}>
              {registerMutation.isPending ? '등록 중...' : '템플릿 등록'}
            </button>
            <button
              className="primary-btn"
              onClick={handleTestGenerate}
              disabled={!canTest || testMutation.isPending || registerMutation.isPending}
            >
              {testMutation.isPending ? '생성 중...' : '테스트 생성'}
            </button>
          </div>
        </div>
      )}

      {extractedText && (
        <details className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase text-[#64748b]">추출된 원문 미리보기</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-[#0f1f3d]">{extractedText}</pre>
        </details>
      )}
    </div>
  )
}

