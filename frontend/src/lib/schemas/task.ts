import { z } from 'zod'

export const taskCreateSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  quadrant: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  deadline: z.string().optional().nullable(),
  estimated_time: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  fund_id: z.number().optional().nullable(),
  investment_id: z.number().optional().nullable(),
  gp_entity_id: z.number().optional().nullable(),
})

export type TaskCreateInput = z.infer<typeof taskCreateSchema>

export const taskCompleteSchema = z.object({
  actual_time: z.string().min(1, '실제 소요시간을 입력해주세요'),
  auto_worklog: z.boolean().default(true),
  memo: z.string().optional().nullable(),
})

export type TaskCompleteInput = z.infer<typeof taskCompleteSchema>
