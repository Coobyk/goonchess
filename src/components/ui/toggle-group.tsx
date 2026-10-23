import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const toggleGroupVariants = cva(
  'group/toggle-group flex w-fit items-center gap-0.5 rounded-[3px] border p-0.5',
  {
    variants: {
      variant: {
        default: 'bg-muted/40',
        outline: 'bg-transparent',
      },
      size: {
        default: 'h-9',
        sm: 'h-8',
        lg: 'h-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

const toggleGroupItemVariants = cva(
  'text-muted-foreground inline-flex items-center justify-center gap-1.5 rounded-[2px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 data-[state=on]:bg-foreground data-[state=on]:text-background [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
  {
    variants: {
      variant: {
        default: '',
        outline: '',
      },
      size: {
        default: 'h-8 min-w-8 px-2.5',
        sm: 'h-7 min-w-7 px-2',
        lg: 'h-9 min-w-9 px-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleGroupVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(toggleGroupVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleGroupItemVariants>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={variant}
      data-size={size}
      className={cn(toggleGroupItemVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem, toggleGroupVariants }
