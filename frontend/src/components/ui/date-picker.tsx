import * as React from 'react'

import { Calendar } from '@/components/ui/calendar'

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value?: string
}

export function DatePicker(props: DatePickerProps) {
  return <Calendar {...props} />
}
