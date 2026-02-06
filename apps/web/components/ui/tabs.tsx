"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

type TabsRootBaseProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & {
  children?: React.ReactNode
  className?: string
}

const TabsRootBase = TabsPrimitive.Root as React.ForwardRefExoticComponent<
  TabsRootBaseProps & React.RefAttributes<HTMLDivElement>
>

type TabsProps = TabsRootBaseProps

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  TabsProps
>(({ children, className, ...props }, ref) => (
  <TabsRootBase ref={ref} className={className} {...props}>
    {children}
  </TabsRootBase>
))
Tabs.displayName = TabsPrimitive.Root.displayName

type TabsListBaseProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  children?: React.ReactNode
  className?: string
}

const TabsListBase = TabsPrimitive.List as React.ForwardRefExoticComponent<
  TabsListBaseProps & React.RefAttributes<HTMLDivElement>
>

type TabsListProps = TabsListBaseProps

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, ...props }, ref) => (
  <TabsListBase
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

type TabsTriggerBaseProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  children?: React.ReactNode
  className?: string
}

const TabsTriggerBase = TabsPrimitive.Trigger as React.ForwardRefExoticComponent<
  TabsTriggerBaseProps & React.RefAttributes<HTMLButtonElement>
>

type TabsTriggerProps = TabsTriggerBaseProps

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, ...props }, ref) => (
  <TabsTriggerBase
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

type TabsContentBaseProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & {
  children?: React.ReactNode
  className?: string
}

const TabsContentBase = TabsPrimitive.Content as React.ForwardRefExoticComponent<
  TabsContentBaseProps & React.RefAttributes<HTMLDivElement>
>

type TabsContentProps = TabsContentBaseProps

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  TabsContentProps
>(({ className, ...props }, ref) => (
  <TabsContentBase
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
