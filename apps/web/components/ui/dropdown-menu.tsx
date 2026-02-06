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
        "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
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
