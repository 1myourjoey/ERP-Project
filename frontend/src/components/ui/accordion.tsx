import * as React from 'react'

import { cn } from '@/lib/utils'

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: 'single' | 'multiple'
  collapsible?: boolean
}

function Accordion({ className, ...props }: AccordionProps) {
  return <div className={cn('space-y-2', className)} {...props} />
}

function AccordionItem({ className, ...props }: React.HTMLAttributes<HTMLDetailsElement>) {
  return <details className={cn('rounded-lg border border-gray-200 p-3 dark:border-gray-700', className)} {...props} />
}

function AccordionTrigger({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <summary className={cn('cursor-pointer list-none text-sm font-medium', className)} {...props} />
}

function AccordionContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pt-2 text-sm text-gray-600 dark:text-gray-300', className)} {...props} />
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
