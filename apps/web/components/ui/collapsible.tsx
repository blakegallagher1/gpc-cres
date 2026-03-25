"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

import { cn } from "@/lib/utils"

const Collapsible = CollapsiblePrimitive.Root

type CollapsibleTriggerProps =
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger> & {
    children?: React.ReactNode
    asChild?: boolean
  }

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
  CollapsibleTriggerProps
>((props, ref) => <CollapsiblePrimitive.Trigger ref={ref} {...props} />)
CollapsibleTrigger.displayName = CollapsiblePrimitive.Trigger.displayName

type CollapsibleContentBaseProps =
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content> & {
    children?: React.ReactNode
    className?: string
  }

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  CollapsibleContentBaseProps
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    className={cn(
      "overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
      className,
    )}
    {...props}
  />
))
CollapsibleContent.displayName = CollapsiblePrimitive.Content.displayName

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
