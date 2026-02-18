import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Eye, RotateCcw, Save, X } from 'lucide-react'

import type { DocumentTemplate, Fund } from '../lib/api'

export type TemplateCustomData = Record<string, unknown>
export type TemplateKind = 'official' | 'assembly' | 'resolution'

interface DocumentEditorModalProps {
  open: boolean
  onClose: () => void
  template: DocumentTemplate
  templateKind: TemplateKind
  editData: TemplateCustomData
  onEditDataChange: (data: TemplateCustomData) => void
  onSave: () => void
  onPreview: () => void
  onReset: () => void
  isSaving: boolean
  isPreviewing: boolean
  funds: Fund[]
  previewFundId: number | ''
  onPreviewFundIdChange: (id: number | '') => void
}

interface AttachmentItem {
  no: string
  name: string
  ref: string
  stamp_required: boolean
}

interface LayoutFitConfig {
  enabled: boolean
  scale: number
  balanced: boolean
}

interface LayoutTuning {
  scale: number
  lineHeight: number
  letterSpacing: number
  wordSpacing: number
  paddingY: number
  paddingX: number
  paragraphGap: number
  tableCellPaddingY: number
  tableCellPaddingX: number
}

const DOC_MIN_SCALE = 0.74
const DOC_MAX_SCALE = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? ''))
}

function asAttachmentList(value: unknown): AttachmentItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const row = asRecord(item)
    return {
      no: String(row.no ?? index + 1),
      name: String(row.name ?? ''),
      ref: String(row.ref ?? ''),
      stamp_required: Boolean(row.stamp_required),
    }
  })
}

function clampScale(value: number) {
  return Math.max(DOC_MIN_SCALE, Math.min(DOC_MAX_SCALE, value))
}

function readLayoutFitConfig(data: TemplateCustomData): LayoutFitConfig {
  const raw = asRecord(data.__layout_fit__)
  const enabled = Boolean(raw.enabled)
  const parsedScale = Number(raw.scale)
  const scale = Number.isFinite(parsedScale) ? clampScale(parsedScale) : 1
  return {
    enabled,
    scale: enabled ? scale : 1,
    balanced: true,
  }
}

function computeLayoutTuning(scale: number): LayoutTuning {
  const normalized = clampScale(scale)
  const compression = 1 - normalized
  return {
    scale: normalized,
    lineHeight: Math.max(1.22, 1.55 - compression * 1.15),
    letterSpacing: Math.max(-0.45, -compression * 1.35),
    wordSpacing: Math.max(-0.8, -compression * 2.2),
    paddingY: Math.max(14, 24 - compression * 52),
    paddingX: Math.max(20, 34 - compression * 52),
    paragraphGap: Math.max(0.74, 1 - compression * 1.4),
    tableCellPaddingY: Math.max(2, 4 - compression * 8),
    tableCellPaddingX: Math.max(3, 6 - compression * 10),
  }
}

function VariableChip({ text }: { text: string }) {
  return <span className="variable-chip">{text}</span>
}

function renderTextWithVariables(text: string) {
  const parts = text.split(/(\{\{[^}]+\}\})/g)
  return parts.map((part, index) => {
    if (/^\{\{[^}]+\}\}$/.test(part)) {
      return <VariableChip key={`${part}-${index}`} text={part} />
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

function EditableText({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div>
        <label className="mb-1 block text-[10px] font-medium text-gray-500">{placeholder || '입력'}</label>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              setEditing(false)
            }
          }}
          autoFocus
          className={`editable-area w-full rounded-sm border border-blue-400 bg-blue-50 px-1 py-0.5 text-sm outline-none ${className}`}
        />
      </div>
    )
  }

  return (
    <span
      className={`editable-area inline-block min-w-6 rounded-sm px-1 py-0.5 ${className}`}
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setEditing(true)
        }
      }}
    >
      {value ? renderTextWithVariables(value) : <span className="text-gray-300">{placeholder || '클릭하여 입력'}</span>}
    </span>
  )
}

function EditableTextarea({
  value,
  onChange,
  placeholder,
  minRows = 3,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minRows?: number
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div>
        <label className="mb-1 block text-[10px] font-medium text-gray-500">{placeholder || '내용'}</label>
        <textarea
          value={value}
          rows={minRows}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          className="editable-area w-full rounded-sm border border-blue-400 bg-blue-50 px-2 py-1 text-sm outline-none"
        />
      </div>
    )
  }

  return (
    <div
      className="editable-area min-h-10 rounded-sm px-2 py-1 text-sm whitespace-pre-wrap"
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setEditing(true)
        }
      }}
    >
      {value ? renderTextWithVariables(value) : <span className="text-gray-300">{placeholder || '클릭하여 입력'}</span>}
    </div>
  )
}

function InlineAttachmentTable({
  attachments,
  onChange,
}: {
  attachments: AttachmentItem[]
  onChange: (next: AttachmentItem[]) => void
}) {
  const addRow = () => {
    onChange([...attachments, { no: String(attachments.length + 1), name: '', ref: '', stamp_required: false }])
  }

  const updateRow = (index: number, patch: Partial<AttachmentItem>) => {
    onChange(attachments.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  const removeRow = (index: number) => {
    onChange(
      attachments
        .filter((_, rowIndex) => rowIndex !== index)
        .map((row, rowIndex) => ({ ...row, no: String(rowIndex + 1) })),
    )
  }

  return (
    <>
      <table className="attachment-table gongmun-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>No.</th>
            <th>목 록</th>
            <th style={{ width: 70 }}>해당 자료</th>
            <th style={{ width: 60 }}>날인</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {attachments.map((attachment, index) => (
            <tr key={`${index}-${attachment.no}-${attachment.name}`}>
              <td style={{ textAlign: 'center' }}>{attachment.no}</td>
              <td><EditableText value={attachment.name} onChange={(next) => updateRow(index, { name: next })} placeholder="문서명" /></td>
              <td style={{ textAlign: 'center' }}><EditableText value={attachment.ref} onChange={(next) => updateRow(index, { ref: next })} placeholder="별첨" /></td>
              <td style={{ textAlign: 'center' }}>
                <label className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                  날인
                  <input type="checkbox" checked={attachment.stamp_required} onChange={(event) => updateRow(index, { stamp_required: event.target.checked })} />
                </label>
              </td>
              <td style={{ textAlign: 'center' }}><button onClick={() => removeRow(index)} type="button" className="text-xs text-red-500 hover:text-red-700">×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} type="button" className="mt-1 text-xs text-blue-600 hover:text-blue-800">+ 행 추가</button>
    </>
  )
}

function InlineAgendaList({
  agendas,
  onChange,
  title,
  addLabel,
  tableMode = false,
}: {
  agendas: string[]
  onChange: (next: string[]) => void
  title: string
  addLabel?: string
  tableMode?: boolean
}) {
  const addAgenda = () => onChange([...agendas, `${agendas.length + 1}호 안건: `])
  const updateAgenda = (index: number, next: string) => onChange(agendas.map((agenda, i) => (i === index ? next : agenda)))
  const removeAgenda = (index: number) => onChange(agendas.filter((_, i) => i !== index))

  return (
    <div className="space-y-2">
      {title ? <div className="section-title">{title}</div> : null}
      {tableMode ? (
        <table className="attachment-table gongmun-table">
          <thead>
            <tr>
              <th style={{ width: 52 }}>No.</th>
              <th>안 건</th>
              <th style={{ width: 70 }}>찬성</th>
              <th style={{ width: 70 }}>반대</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {agendas.map((agenda, index) => (
              <tr key={`${index}-${agenda}`}>
                <td style={{ textAlign: 'center' }}>{index + 1}</td>
                <td><EditableText value={agenda} onChange={(next) => updateAgenda(index, next)} placeholder="안건 입력" /></td>
                <td />
                <td />
                <td style={{ textAlign: 'center' }}><button onClick={() => removeAgenda(index)} type="button" className="text-xs text-red-500 hover:text-red-700">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="space-y-1">
          {agendas.map((agenda, index) => (
            <div key={`${index}-${agenda}`} className="flex items-center gap-2">
              <span className="w-6 text-right text-xs text-gray-500">{index + 1}.</span>
              <EditableText value={agenda} onChange={(next) => updateAgenda(index, next)} placeholder="안건 입력" className="flex-1" />
              <button onClick={() => removeAgenda(index)} type="button" className="text-xs text-red-500 hover:text-red-700">×</button>
            </div>
          ))}
        </div>
      )}
      <button onClick={addAgenda} type="button" className="text-xs text-blue-600 hover:text-blue-800">{addLabel || '+ 안건 추가'}</button>
    </div>
  )
}

function DocumentFrame({ previewStyle, children }: { previewStyle: CSSProperties; children: ReactNode }) {
  return (
    <div className="document-preview">
      <div className="document-sheet" style={previewStyle}>{children}</div>
    </div>
  )
}

function OfficialLayout({
  editData,
  setField,
  previewStyle,
}: {
  editData: TemplateCustomData
  setField: (key: string, value: unknown) => void
  previewStyle: CSSProperties
}) {
  const header = asRecord(editData.company_header)
  const payment = asRecord(editData.payment_info)
  const attachments = asAttachmentList(editData.attachments)
  const coverAttachments = asStringList(editData.cover_attachments)

  const updateHeader = (patch: Record<string, unknown>) => setField('company_header', { ...header, ...patch })
  const updatePayment = (patch: Record<string, unknown>) => setField('payment_info', { ...payment, ...patch })

  return (
    <DocumentFrame previewStyle={previewStyle}>
      <div style={{ borderBottom: '2px solid #1f2937', paddingBottom: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <span className="serif-font" style={{ fontSize: 36, fontWeight: 800, fontStyle: 'italic' }}>T</span>
          <EditableText value={String(header.company_name ?? '트리거투자파트너스(유)')} onChange={(next) => updateHeader({ company_name: next })} />
        </h1>
        <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right', lineHeight: 1.6 }}>
          <EditableText value={String(header.address ?? '서울특별시 마포구 양화로7길 70')} onChange={(next) => updateHeader({ address: next })} placeholder="회사 주소" />
          <div>
            TEL <EditableText value={String(header.tel ?? '02-0000-0000')} onChange={(next) => updateHeader({ tel: next })} placeholder="02-0000-0000" />
            {' / FAX '}
            <EditableText value={String(header.fax ?? '02-0000-0000')} onChange={(next) => updateHeader({ fax: next })} placeholder="02-0000-0000" />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '6px 0', fontSize: 14, marginBottom: 24 }}>
        <div style={{ fontWeight: 700 }}>날 짜 :</div><div><VariableChip text="{{document_date}}" /></div>
        <div style={{ fontWeight: 700 }}>문서번호 :</div><div><VariableChip text="{{document_number}}" /></div>
        <div style={{ fontWeight: 700 }}>수 신 :</div><div><VariableChip text="{{fund_name}}" /> 조합원</div>
        <div style={{ fontWeight: 700 }}>참 조 :</div>
        <div>
          담당자 <EditableText value={String(header.contact_name ?? '000')} onChange={(next) => updateHeader({ contact_name: next })} />
          {' / 이메일 '}<EditableText value={String(header.contact_email ?? '000')} onChange={(next) => updateHeader({ contact_email: next })} />
          {' / 연락처 '}<EditableText value={String(header.contact_phone ?? '000')} onChange={(next) => updateHeader({ contact_phone: next })} />
        </div>
      </div>

      <EditableTextarea value={String(editData.body_text ?? '')} onChange={(next) => setField('body_text', next)} placeholder="본문 텍스트를 입력하세요" minRows={4} />

      <div style={{ marginTop: 10 }}>
        <p><b>1) 결성총회 일시 :</b> <VariableChip text="{{assembly_date}}" /> <VariableChip text="{{assembly_time}}" /></p>
        <p><b>2) 결성총회 방법 :</b> <VariableChip text="{{assembly_method}}" /></p>
      </div>

      <div style={{ background: '#f9fafb', padding: 12, border: '1px solid #e5e7eb', marginTop: 12 }}>
        <p style={{ fontWeight: 700, marginBottom: 6 }}>- 다 음 -</p>
        <p>납입계좌: <EditableText value={String(payment.bank_account ?? '(국민은행) 000-000000-00-000')} onChange={(next) => updatePayment({ bank_account: next })} /></p>
      </div>

      <h3 style={{ fontWeight: 700, marginTop: 14 }}>[첨부서류]</h3>
      <ol className="mb-3 list-decimal pl-5 text-sm">
        {coverAttachments.map((item, index) => (
          <li key={`${index}-${item}`}>
            <EditableText value={item} onChange={(next) => setField('cover_attachments', coverAttachments.map((line, i) => (i === index ? next : line)))} placeholder="첨부 항목" />
          </li>
        ))}
      </ol>
      <button onClick={() => setField('cover_attachments', [...coverAttachments, ''])} type="button" className="mb-3 text-xs text-blue-600 hover:text-blue-800">+ 항목 추가</button>

      <InlineAttachmentTable attachments={attachments} onChange={(next) => setField('attachments', next)} />

      <div style={{ background: '#fefce8', padding: 10, border: '1px solid #fde68a', marginTop: 10, display: 'flex', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#92400e', whiteSpace: 'nowrap' }}>[조합원 제출서류]</span>
        <EditableText value={String(editData.required_documents_text ?? '신분증 사본, 개인인감증명서')} onChange={(next) => setField('required_documents_text', next)} className="flex-1" />
      </div>
    </DocumentFrame>
  )
}

function AssemblyLayout({
  editData,
  setField,
  previewStyle,
}: {
  editData: TemplateCustomData
  setField: (key: string, value: unknown) => void
  previewStyle: CSSProperties
}) {
  const agendas = asStringList(editData.agendas)
  return (
    <DocumentFrame previewStyle={previewStyle}>
      <div className="text-right text-[11px] text-gray-500">[첨부 1] 결성총회 소집통지서</div>
      <div className="mt-2 text-center text-lg font-bold"><VariableChip text="{{fund_name}}" /></div>
      <div className="text-center text-xl font-bold">결성총회 소집통지서</div>
      <div className="mt-6"><EditableText value={String(editData.greeting ?? '')} onChange={(next) => setField('greeting', next)} placeholder="인사말" /></div>
      <div className="mt-4">규약 조항: <EditableText value={String(editData.regulation_article ?? '')} onChange={(next) => setField('regulation_article', next)} placeholder="제15조" /></div>
      <div className="mt-4"><EditableTextarea value={String(editData.body_text ?? '')} onChange={(next) => setField('body_text', next)} placeholder="본문 텍스트" minRows={4} /></div>
      <div className="mt-4 space-y-1 text-sm">
        <div>1) 결성총회 일시 : <VariableChip text="{{assembly_date}}" /> <VariableChip text="{{assembly_time}}" /></div>
        <div>2) 결성총회 방법 : <VariableChip text="{{assembly_method}}" /></div>
      </div>
      <div className="mt-5"><InlineAgendaList agendas={agendas} onChange={(next) => setField('agendas', next)} title="안건 목록" addLabel="+ 안건 추가" /></div>
    </DocumentFrame>
  )
}

function ResolutionLayout({
  editData,
  setField,
  previewStyle,
}: {
  editData: TemplateCustomData
  setField: (key: string, value: unknown) => void
  previewStyle: CSSProperties
}) {
  const agendas = asStringList(editData.agendas)
  return (
    <DocumentFrame previewStyle={previewStyle}>
      <div className="text-right text-[11px] text-gray-500">[별첨] 서면결의서</div>
      <div className="mt-4"><EditableTextarea value={String(editData.introduction_text ?? '')} onChange={(next) => setField('introduction_text', next)} placeholder="도입 문구" minRows={4} /></div>
      <div className="mt-5"><InlineAgendaList agendas={agendas} onChange={(next) => setField('agendas', next)} title="안건 목록" addLabel="+ 안건 추가" tableMode /></div>
      <div className="mt-4"><EditableText value={String(editData.vote_note ?? '')} onChange={(next) => setField('vote_note', next)} placeholder="의결 안내 문구" /></div>
    </DocumentFrame>
  )
}

export default function DocumentEditorModal({
  open,
  onClose,
  template,
  templateKind,
  editData,
  onEditDataChange,
  onSave,
  onPreview,
  onReset,
  isSaving,
  isPreviewing,
  funds,
  previewFundId,
  onPreviewFundIdChange,
}: DocumentEditorModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [pageOverflow, setPageOverflow] = useState(false)
  const [layoutScale, setLayoutScale] = useState(1)

  const effectiveScale = clampScale(layoutScale)
  const effectiveTuning = useMemo(() => computeLayoutTuning(effectiveScale), [effectiveScale])
  const persistedLayoutScale = useMemo(() => readLayoutFitConfig(editData).scale, [editData])

  const previewStyle = useMemo(
    () => ({
      ['--doc-scale' as string]: effectiveTuning.scale.toFixed(3),
      ['--doc-line-height' as string]: effectiveTuning.lineHeight.toFixed(3),
      ['--doc-letter-spacing' as string]: `${effectiveTuning.letterSpacing.toFixed(3)}px`,
      ['--doc-word-spacing' as string]: `${effectiveTuning.wordSpacing.toFixed(3)}px`,
      ['--doc-padding-y' as string]: `${effectiveTuning.paddingY.toFixed(2)}px`,
      ['--doc-padding-x' as string]: `${effectiveTuning.paddingX.toFixed(2)}px`,
      ['--doc-paragraph-gap' as string]: effectiveTuning.paragraphGap.toFixed(3),
      ['--doc-table-cell-py' as string]: `${effectiveTuning.tableCellPaddingY.toFixed(2)}px`,
      ['--doc-table-cell-px' as string]: `${effectiveTuning.tableCellPaddingX.toFixed(2)}px`,
    }) as CSSProperties,
    [effectiveTuning],
  )

  const setField = useCallback((key: string, value: unknown) => {
    onEditDataChange({ ...editData, [key]: value })
  }, [editData, onEditDataChange])

  const persistLayoutFit = useCallback((scale: number, enabled: boolean) => {
    const nextScale = Number(clampScale(scale).toFixed(3))
    onEditDataChange({
      ...editData,
      __layout_fit__: {
        enabled,
        scale: nextScale,
        balanced: true,
      },
    })
  }, [editData, onEditDataChange])

  const applyScaleToPreview = useCallback((scale: number) => {
    const preview = panelRef.current?.querySelector('.document-preview') as HTMLElement | null
    if (!preview) return null
    const sheet = preview.querySelector('.document-sheet') as HTMLElement | null
    if (!sheet) return null

    const tuning = computeLayoutTuning(scale)
    sheet.style.setProperty('--doc-scale', tuning.scale.toFixed(3))
    sheet.style.setProperty('--doc-line-height', tuning.lineHeight.toFixed(3))
    sheet.style.setProperty('--doc-letter-spacing', `${tuning.letterSpacing.toFixed(3)}px`)
    sheet.style.setProperty('--doc-word-spacing', `${tuning.wordSpacing.toFixed(3)}px`)
    sheet.style.setProperty('--doc-padding-y', `${tuning.paddingY.toFixed(2)}px`)
    sheet.style.setProperty('--doc-padding-x', `${tuning.paddingX.toFixed(2)}px`)
    sheet.style.setProperty('--doc-paragraph-gap', tuning.paragraphGap.toFixed(3))
    sheet.style.setProperty('--doc-table-cell-py', `${tuning.tableCellPaddingY.toFixed(2)}px`)
    sheet.style.setProperty('--doc-table-cell-px', `${tuning.tableCellPaddingX.toFixed(2)}px`)
    return preview
  }, [])

  const measureOverflow = useCallback((preview: HTMLElement) => {
    const sheet = preview.querySelector('.document-sheet') as HTMLElement | null
    if (!sheet) return false
    const previewRect = preview.getBoundingClientRect()
    const sheetRect = sheet.getBoundingClientRect()
    return sheetRect.height > previewRect.height + 1 || sheetRect.width > previewRect.width + 1
  }, [])

  const optimizeToSinglePage = useCallback(() => {
    const preview = panelRef.current?.querySelector('.document-preview') as HTMLElement | null
    if (!preview) return

    let candidate = DOC_MAX_SCALE
    let overflow = true
    for (let step = 0; step <= 26; step += 1) {
      const node = applyScaleToPreview(candidate)
      if (!node) break
      overflow = measureOverflow(node)
      if (!overflow) break
      candidate = clampScale(candidate - 0.01)
    }

    setLayoutScale(candidate)
    setPageOverflow(overflow)
    persistLayoutFit(candidate, true)
  }, [applyScaleToPreview, measureOverflow, persistLayoutFit])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    setLayoutScale(persistedLayoutScale)
  }, [open, template.id, persistedLayoutScale])

  useEffect(() => {
    if (!open) return

    const measureCurrentLayout = () => {
      const node = applyScaleToPreview(effectiveScale)
      if (!node) return
      setPageOverflow(measureOverflow(node))
    }

    const raf = window.requestAnimationFrame(measureCurrentLayout)
    const timer = window.setTimeout(measureCurrentLayout, 100)
    window.addEventListener('resize', measureCurrentLayout)

    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      window.removeEventListener('resize', measureCurrentLayout)
    }
  }, [open, editData, templateKind, effectiveScale, applyScaleToPreview, measureOverflow])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] bg-black/45 p-2 sm:p-4 md:p-6" onClick={onClose}>
      <div
        ref={panelRef}
        className="mx-auto flex h-full max-h-[calc(100vh-16px)] w-full max-w-[1120px] min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-xl sm:max-h-[calc(100vh-32px)] md:h-[88vh] md:max-h-[88vh] md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{template.name}</h3>
            <p className="text-xs text-gray-500">WYSIWYG 문서 편집</p>
          </div>
          <button ref={closeButtonRef} onClick={onClose} type="button" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-100 px-3 py-4 md:px-6">
          {templateKind === 'official' && <OfficialLayout editData={editData} setField={setField} previewStyle={previewStyle} />}
          {templateKind === 'assembly' && <AssemblyLayout editData={editData} setField={setField} previewStyle={previewStyle} />}
          {templateKind === 'resolution' && <ResolutionLayout editData={editData} setField={setField} previewStyle={previewStyle} />}
        </div>

        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="mb-1 text-xs font-semibold text-blue-700">변수 치트시트</p>
              <div className="flex flex-wrap gap-1">
                <VariableChip text="{{fund_name}}" />
                <VariableChip text="{{gp_name}}" />
                <VariableChip text="{{assembly_date}}" />
                <VariableChip text="{{document_date}}" />
                <VariableChip text="{{document_number}}" />
                <VariableChip text="{{lp_count}}" />
                <VariableChip text="{{total_commitment_amount}}" />
              </div>
              {pageOverflow && <p className="mt-2 text-xs font-medium text-amber-700">현재 내용이 A4 1장을 초과합니다. A4 최적화를 눌러 조정하세요.</p>}
              {!pageOverflow && layoutScale < 0.999 && <p className="mt-2 text-xs font-medium text-emerald-700">A4 최적화가 적용되었습니다.</p>}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">현재 배율 {Math.round(effectiveTuning.scale * 100)}%</span>
              <button type="button" className="secondary-btn px-2 py-1 text-xs" onClick={optimizeToSinglePage}>A4 최적화</button>
              <button
                type="button"
                className="secondary-btn px-2 py-1 text-xs"
                onClick={() => {
                  setLayoutScale(1)
                  persistLayoutFit(1, false)
                }}
              >
                배율 초기화
              </button>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">미리보기 조합</label>
                <select
                  value={previewFundId}
                  onChange={(event) => onPreviewFundIdChange(event.target.value ? Number(event.target.value) : '')}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="">미리보기용 조합 선택</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>{fund.name}</option>
                  ))}
                </select>
              </div>

              <button onClick={onPreview} type="button" disabled={isPreviewing} className="secondary-btn inline-flex items-center gap-1">
                <Eye size={14} /> 미리보기 (.docx)
              </button>

              <button onClick={onSave} type="button" disabled={isSaving} className="primary-btn inline-flex items-center gap-1">
                <Save size={14} /> 저장
              </button>

              <button onClick={onReset} type="button" className="secondary-btn inline-flex items-center gap-1">
                <RotateCcw size={14} /> 초기화
              </button>

              <button onClick={onClose} type="button" className="secondary-btn">닫기</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
