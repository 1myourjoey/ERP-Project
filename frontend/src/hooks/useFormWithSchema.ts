import { zodResolver } from '@hookform/resolvers/zod'
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
} from 'react-hook-form'
import type { ZodTypeAny } from 'zod'

export function useFormWithSchema<TFieldValues extends FieldValues>(
  schema: ZodTypeAny,
  defaultValues?: DefaultValues<TFieldValues>,
): UseFormReturn<TFieldValues> {
  return useForm<TFieldValues>({
    resolver: zodResolver(schema as any) as Resolver<TFieldValues>,
    defaultValues,
    mode: 'onBlur',
  })
}
