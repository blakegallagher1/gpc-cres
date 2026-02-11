"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { cn } from "@/lib/utils"

const DropdownMenu = DropdownMenuPrimitive.Root

type DropdownMenuTriggerProps =
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger> & {
    children?: React.ReactNode
    className?: string
    asChild?: boolean
  }

const DropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
  DropdownMenuTriggerProps
>((props, ref) => <DropdownMenuPrimitive.Trigger ref={ref} {...props} />)
DropdownMenuTrigger.displayName = DropdownMenuPrimitive.Trigger.displayName

type DropdownMenuContentBaseProps =
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
    children?: React.ReactNode
    className?: string
  }

const DropdownMenuContentBase =
  DropdownMenuPrimitive.Content as React.ForwardRefExoticComponent<
    DropdownMenuContentBaseProps & React.RefAttributes<HTMLDivElement>
  >

type DropdownMenuContentProps = DropdownMenuContentBaseProps

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuContentBase
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md transition-[opacity,transform] duration-150 data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0 data-[state=open]:opacity-100 data-[state=closed]:scale-95 data-[state=open]:scale-100 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

type DropdownMenuItemBaseProps =
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
    children?: React.ReactNode
    className?: string
    asChild?: boolean
    onClick?: React.MouseEventHandler<HTMLDivElement>
  }

const DropdownMenuItemBase =
  DropdownMenuPrimitive.Item as React.ForwardRefExoticComponent<
    DropdownMenuItemBaseProps & React.RefAttributes<HTMLDivElement>
  >

type DropdownMenuItemProps = DropdownMenuItemBaseProps

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuItemBase
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
}
