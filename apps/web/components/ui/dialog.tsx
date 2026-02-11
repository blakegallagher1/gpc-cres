"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

type DialogTriggerProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger> & {
  children?: React.ReactNode
  asChild?: boolean
}

const DialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  DialogTriggerProps
>((props, ref) => <DialogPrimitive.Trigger ref={ref} {...props} />)
DialogTrigger.displayName = DialogPrimitive.Trigger.displayName

const DialogPortal = DialogPrimitive.Portal

type DialogCloseProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close> & {
  children?: React.ReactNode
  className?: string
  asChild?: boolean
}

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  DialogCloseProps
>((props, ref) => <DialogPrimitive.Close ref={ref} {...props} />)
DialogClose.displayName = DialogPrimitive.Close.displayName

type DialogOverlayBaseProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
  asChild?: boolean
  children?: React.ReactNode
}

const DialogOverlayBase = DialogPrimitive.Overlay as React.ComponentType<DialogOverlayBaseProps>

type DialogOverlayProps = DialogOverlayBaseProps & {
  className?: string
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  DialogOverlayProps
>(({ className, ...props }, ref) => (
  <DialogOverlayBase asChild {...props}>
    <div
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/80 transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
        className
      )}
    />
  </DialogOverlayBase>
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

type DialogContentBaseProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  children?: React.ReactNode
  className?: string
}

const DialogContentBase = DialogPrimitive.Content as React.ForwardRefExoticComponent<
  DialogContentBaseProps & React.RefAttributes<HTMLDivElement>
>

type DialogContentProps = DialogContentBaseProps

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogContentBase
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg transition-[opacity,transform] duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100 data-[state=closed]:scale-95 data-[state=open]:scale-100 sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogClose>
    </DialogContentBase>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

type DialogTitleBaseProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
  children?: React.ReactNode
  className?: string
}

const DialogTitleBase = DialogPrimitive.Title as React.ForwardRefExoticComponent<
  DialogTitleBaseProps & React.RefAttributes<React.ElementRef<typeof DialogPrimitive.Title>>
>

type DialogTitleProps = DialogTitleBaseProps

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  DialogTitleProps
>(({ className, ...props }, ref) => (
  <DialogTitleBase
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

type DialogDescriptionBaseProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Description
> & {
  children?: React.ReactNode
  className?: string
}

const DialogDescriptionBase =
  DialogPrimitive.Description as React.ForwardRefExoticComponent<
    DialogDescriptionBaseProps &
      React.RefAttributes<React.ElementRef<typeof DialogPrimitive.Description>>
  >

type DialogDescriptionProps = DialogDescriptionBaseProps

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  DialogDescriptionProps
>(({ className, ...props }, ref) => (
  <DialogDescriptionBase
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
