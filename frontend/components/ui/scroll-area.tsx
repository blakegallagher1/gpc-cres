"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

type ScrollAreaBaseProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  children?: React.ReactNode
  className?: string
}

const ScrollAreaRootBase = ScrollAreaPrimitive.Root as React.ForwardRefExoticComponent<
  ScrollAreaBaseProps & React.RefAttributes<HTMLDivElement>
>

type ScrollAreaProps = ScrollAreaBaseProps

type ScrollAreaViewportBaseProps = React.ComponentPropsWithoutRef<
  typeof ScrollAreaPrimitive.Viewport
> & {
  children?: React.ReactNode
  className?: string
}

const ScrollAreaViewportBase =
  ScrollAreaPrimitive.Viewport as React.ComponentType<ScrollAreaViewportBaseProps>

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, ...props }, ref) => (
  <ScrollAreaRootBase
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaViewportBase className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaViewportBase>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaRootBase>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

type ScrollAreaScrollbarBaseProps = React.ComponentPropsWithoutRef<
  typeof ScrollAreaPrimitive.ScrollAreaScrollbar
> & {
  className?: string
}

const ScrollAreaScrollbarBase =
  ScrollAreaPrimitive.ScrollAreaScrollbar as React.ForwardRefExoticComponent<
    ScrollAreaScrollbarBaseProps & React.RefAttributes<HTMLDivElement>
  >

type ScrollAreaThumbBaseProps = React.ComponentPropsWithoutRef<
  typeof ScrollAreaPrimitive.ScrollAreaThumb
> & {
  className?: string
}

const ScrollAreaThumbBase =
  ScrollAreaPrimitive.ScrollAreaThumb as React.ComponentType<ScrollAreaThumbBaseProps>

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  ScrollAreaScrollbarBaseProps
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaScrollbarBase
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaThumbBase className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaScrollbarBase>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
