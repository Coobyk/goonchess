import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:border-ring aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-[3px] border bg-transparent px-3 py-2 text-sm transition-colors outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
