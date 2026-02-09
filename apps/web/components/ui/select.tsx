"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

type SelectTriggerBaseProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
  children?: React.ReactNode
  className?: string
}

const SelectTriggerBase = SelectPrimitive.Trigger as React.ForwardRefExoticComponent<
  SelectTriggerBaseProps & React.RefAttributes<HTMLButtonElement>
>

type SelectTriggerProps = SelectTriggerBaseProps

type SelectIconBaseProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Icon> & {
  children?: React.ReactNode
  asChild?: boolean
}

const SelectIconBase =
  SelectPrimitive.Icon as React.ComponentType<SelectIconBaseProps>

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, children, ...props }, ref) => (
  <SelectTriggerBase
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectIconBase asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectIconBase>
  </SelectTriggerBase>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

type SelectContentBaseProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
  children?: React.ReactNode
  className?: string
}

const SelectContentBase = SelectPrimitive.Content as React.ForwardRefExoticComponent<
  SelectContentBaseProps & React.RefAttributes<HTMLDivElement>
>

type SelectContentProps = SelectContentBaseProps

type SelectViewportBaseProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Viewport> & {
  children?: React.ReactNode
  className?: string
}

const SelectViewportBase =
  SelectPrimitive.Viewport as React.ComponentType<SelectViewportBaseProps>

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectContentBase
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectViewportBase
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectViewportBase>
    </SelectContentBase>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

type SelectItemBaseProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
  children?: React.ReactNode
  className?: string
}

const SelectItemBase = SelectPrimitive.Item as React.ForwardRefExoticComponent<
  SelectItemBaseProps & React.RefAttributes<HTMLDivElement>
>

type SelectItemProps = SelectItemBaseProps

type SelectItemIndicatorBaseProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.ItemIndicator
> & {
  children?: React.ReactNode
  className?: string
}

const SelectItemIndicatorBase =
  SelectPrimitive.ItemIndicator as React.ComponentType<SelectItemIndicatorBaseProps>

type SelectItemTextBaseProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.ItemText> & {
  children?: React.ReactNode
  className?: string
}

const SelectItemTextBase =
  SelectPrimitive.ItemText as React.ComponentType<SelectItemTextBaseProps>

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(({ className, children, ...props }, ref) => (
  <SelectItemBase
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectItemIndicatorBase>
        <Check className="h-4 w-4" />
      </SelectItemIndicatorBase>
    </span>

    <SelectItemTextBase>{children}</SelectItemTextBase>
  </SelectItemBase>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
}
