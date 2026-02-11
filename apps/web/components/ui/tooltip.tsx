"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

type TooltipTriggerProps =
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger> & {
    children?: React.ReactNode
    className?: string
    asChild?: boolean
  }

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  TooltipTriggerProps
>((props, ref) => <TooltipPrimitive.Trigger ref={ref} {...props} />);
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

type TooltipContentProps =
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    children?: React.ReactNode
    className?: string
  }

const TooltipContentBase =
  TooltipPrimitive.Content as React.ForwardRefExoticComponent<
    TooltipContentProps & React.RefAttributes<HTMLDivElement>
  >

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipContentBase
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md transition-[opacity,transform] duration-150 data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0 data-[state=delayed-open]:opacity-100 data-[state=instant-open]:opacity-100 data-[state=closed]:scale-95 data-[state=delayed-open]:scale-100 data-[state=instant-open]:scale-100",
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
