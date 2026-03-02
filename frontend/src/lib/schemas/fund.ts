import { z } from 'zod'

export const fundCreateSchema = z.object({
  name: z.string().min(1, '조합명을 입력해주세요'),
  type: z.string().min(1, '조합 유형을 선택해주세요'),
  formation_date: z.string().optional().nullable(),
  gp: z.string().optional().nullable(),
  fund_manager: z.string().optional().nullable(),
  mgmt_fee_rate: z.number().min(0).max(1).optional().nullable(),
  performance_fee_rate: z.number().min(0).max(1).optional().nullable(),
  hurdle_rate: z.number().min(0).max(1).optional().nullable(),
})

export const lpCreateSchema = z.object({
  name: z.string().min(1, 'LP명을 입력해주세요'),
  type: z.string().min(1, '유형을 선택해주세요'),
  commitment: z.number().min(0, '약정금액을 입력해주세요'),
  paid_in: z.number().min(0).default(0),
  business_number: z.string().optional().nullable(),
  contact: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
})

export type FundCreateInput = z.infer<typeof fundCreateSchema>
export type LPCreateInput = z.infer<typeof lpCreateSchema>
