import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchTaskAttachments,
  fetchWorkflowInstance,
  linkAttachmentToTask,
  removeAttachment,
  type Attachment,
  type TaskAttachmentLinkInput,
  type WorkflowStepInstanceDocument,
  unlinkAttachmentFromTask,
  uploadAttachment,
} from '../../lib/api'
import { invalidateTaskRelated } from '../../lib/queryInvalidation'
import FileAttachmentPanel from './FileAttachmentPanel'

interface TaskAttachmentSectionProps {
  taskId: number | null
  workflowInstanceId?: number | null
  workflowStepOrder?: number | null
  onAttachmentsChange?: (count: number) => void
  onDraftAttachmentIdsChange?: (ids: number[]) => void
  readOnly?: boolean
  compact?: boolean
}

function normalizeToken(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

function resolveAutoWorkflowDocId(
  fileName: string,
  documents: WorkflowStepInstanceDocument[],
): number | null {
  const normalizedFileName = normalizeToken(fileName)
  if (!normalizedFileName) return null
  for (const doc of documents) {
    if (!doc.required) continue
    const normalizedName = normalizeToken(doc.name || '')
    if (!normalizedName) continue
    if (normalizedFileName.includes(normalizedName)) {
      return doc.id
    }
  }
  return null
}

export default function TaskAttachmentSection({
  taskId,
  workflowInstanceId = null,
  workflowStepOrder = null,
  onAttachmentsChange,
  onDraftAttachmentIdsChange,
  readOnly = false,
  compact = false,
}: TaskAttachmentSectionProps) {
  const queryClient = useQueryClient()

  const [draftAttachmentIds, setDraftAttachmentIds] = useState<number[]>([])
  const [selectedWorkflowDocId, setSelectedWorkflowDocId] = useState<number | ''>('')

  const taskAttachmentsQuery = useQuery({
    queryKey: ['task-attachments', taskId],
    queryFn: () => fetchTaskAttachments(taskId as number),
    enabled: taskId != null,
    staleTime: 0,
  })

  const workflowInstanceQuery = useQuery({
    queryKey: ['workflow-instance', workflowInstanceId],
    queryFn: () => fetchWorkflowInstance(workflowInstanceId as number),
    enabled: workflowInstanceId != null,
    staleTime: 0,
  })

  const stepDocuments = useMemo(() => {
    if (!workflowInstanceQuery.data || taskId == null) return []
    return (
      workflowInstanceQuery.data.step_instances.find((step) => step.task_id === taskId)?.step_documents ?? []
    )
  }, [workflowInstanceQuery.data, taskId, workflowStepOrder])

  const attachmentIds = useMemo(
    () =>
      taskId == null
        ? draftAttachmentIds
        : (taskAttachmentsQuery.data ?? []).map((row: Attachment) => row.id),
    [draftAttachmentIds, taskAttachmentsQuery.data, taskId],
  )

  const workflowDocByAttachmentId = useMemo(() => {
    const mapping = new Map<number, string>()
    for (const document of stepDocuments) {
      for (const attachmentId of document.attachment_ids ?? []) {
        if (!mapping.has(attachmentId)) {
          mapping.set(attachmentId, document.name)
        }
      }
    }
    return mapping
  }, [stepDocuments])

  useEffect(() => {
    if (taskId != null) {
      setDraftAttachmentIds([])
      onDraftAttachmentIdsChange?.([])
    }
  }, [taskId, onDraftAttachmentIdsChange])

  useEffect(() => {
    onAttachmentsChange?.(attachmentIds.length)
    if (taskId == null) {
      onDraftAttachmentIdsChange?.(attachmentIds)
    }
  }, [attachmentIds, onAttachmentsChange, onDraftAttachmentIdsChange, taskId])

  const showWorkflowDocStatus = workflowInstanceId != null && taskId != null && stepDocuments.length > 0

  const invalidateTaskAttachmentRelated = async () => {
    if (taskId == null) return
    await queryClient.invalidateQueries({ queryKey: ['task-attachments', taskId] })
    invalidateTaskRelated(queryClient)
    if (workflowInstanceId != null) {
      await queryClient.invalidateQueries({ queryKey: ['workflow-instance', workflowInstanceId] })
      await queryClient.invalidateQueries({ queryKey: ['task-completion-check', taskId] })
    }
  }

  const handleUpload = async (file: File): Promise<number> => {
    const uploaded = await uploadAttachment(
      file,
      taskId != null ? 'task' : 'task_draft',
      taskId != null ? taskId : 0,
    )
    if (taskId == null) {
      setDraftAttachmentIds((prev) => [...new Set([...prev, uploaded.id])])
      return uploaded.id
    }

    const workflowDocId =
      selectedWorkflowDocId === ''
        ? resolveAutoWorkflowDocId(file.name, stepDocuments)
        : selectedWorkflowDocId
    const payload: TaskAttachmentLinkInput = { attachment_id: uploaded.id }
    if (workflowDocId != null) {
      payload.workflow_doc_id = workflowDocId
    }
    await linkAttachmentToTask(taskId, payload)
    await invalidateTaskAttachmentRelated()
    return uploaded.id
  }

  const handleRemove = async (attachmentId: number): Promise<void> => {
    if (taskId == null) {
      await removeAttachment(attachmentId)
      setDraftAttachmentIds((prev) => prev.filter((row) => row !== attachmentId))
      return
    }
    await unlinkAttachmentFromTask(taskId, attachmentId)
    await invalidateTaskAttachmentRelated()
  }

  return (
    <div className="space-y-2">
      {showWorkflowDocStatus && !readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-600">연결 서류:</label>
          <select
            value={selectedWorkflowDocId}
            onChange={(event) => setSelectedWorkflowDocId(event.target.value ? Number(event.target.value) : '')}
            className="rounded border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="">워크플로 자동 연결</option>
            {stepDocuments.map((document) => (
              <option key={document.id} value={document.id}>
                {document.name}
                {document.required ? ' (필수)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <FileAttachmentPanel
        attachmentIds={attachmentIds}
        onUpload={handleUpload}
        onRemove={handleRemove}
        disabled={readOnly}
        compact={compact}
        label="📎 첨부 서류"
      />

      {attachmentIds.length > 0 && workflowDocByAttachmentId.size > 0 && (
        <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2">
          <p className="text-xs font-semibold text-indigo-700">워크플로 연결</p>
          <ul className="mt-1 space-y-1">
            {attachmentIds
              .filter((attachmentId) => workflowDocByAttachmentId.has(attachmentId))
              .map((attachmentId) => (
                <li key={`task-attachment-link-${attachmentId}`} className="text-xs text-indigo-900">
                  첨부 #{attachmentId} → {workflowDocByAttachmentId.get(attachmentId)}
                </li>
              ))}
          </ul>
        </div>
      )}

      {showWorkflowDocStatus && (
        <div className="mt-3 rounded border border-indigo-200 bg-indigo-50 px-3 py-2">
          <p className="text-xs font-semibold text-indigo-700">워크플로 필수 서류 상태</p>
          {workflowInstanceQuery.isLoading ? (
            <p className="mt-1 text-xs text-indigo-600">불러오는 중...</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {stepDocuments
                .filter((document) => document.required)
                .map((document) => (
                  <li key={document.id} className="text-xs text-indigo-900">
                    {document.checked ? '✅' : '⬜'} {document.name}
                    {!document.checked ? ' — 미첨부' : ' — 첨부됨'}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

