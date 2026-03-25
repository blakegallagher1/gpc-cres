"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

type PopoverTriggerProps =
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger> & {
    children?: React.ReactNode
    asChild?: boolean
  }

const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  PopoverTriggerProps
>((props, ref) => <PopoverPrimitive.Trigger ref={ref} {...props} />)
PopoverTrigger.displayName = PopoverPrimitive.Trigger.displayName

type PopoverContentBaseProps =
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    children?: React.ReactNode
    className?: string
  }

const PopoverContentBase =
  PopoverPrimitive.Content as React.ForwardRefExoticComponent<
    PopoverContentBaseProps & React.RefAttributes<HTMLDivElement>
  >

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentBaseProps
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverContentBase
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-xl border border-border/70 bg-popover/96 p-0 text-popover-foreground shadow-lg backdrop-blur-xl outline-none data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
