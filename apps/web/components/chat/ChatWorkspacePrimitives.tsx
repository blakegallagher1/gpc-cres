'use client';

import type { ReactNode } from 'react';
import {
  ArrowRight,
  Bot,
  Command,
  FileSearch,
  Layers3,
  Paperclip,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const QUICK_ACTION_ICONS = {
  plan: Route,
  verify: ShieldCheck,
  compare: Layers3,
  attach: Paperclip,
  route: Command,
  research: FileSearch,
  default: Sparkles,
} as const;

type QuickActionTone = 'default' | 'highlight';

export interface PageHeaderRoute {
  label: string;
  value: string;
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  routes: PageHeaderRoute[];
  actions?: ReactNode;
}

interface RunMetaItem {
  label: string;
  value: string;
  hint?: string;
}

interface RunMetaPanelProps {
  title: string;
  description: string;
  items: RunMetaItem[];
  controls?: ReactNode;
  footer?: ReactNode;
}

export interface QuickActionItem {
  id: string;
  label: string;
  detail: string;
  icon?: keyof typeof QUICK_ACTION_ICONS;
  tone?: QuickActionTone;
}

interface QuickActionsGridProps {
  title: string;
  description: string;
  actions: QuickActionItem[];
  onAction?: (actionId: string) => void;
}

interface InspectorTabsProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function PageHeader({
  eyebrow = 'Verified Run Workspace',
  title,
  description,
  routes,
  actions,
}: PageHeaderProps) {
  return (
    <header className="relative overflow-hidden rounded-[28px] border border-border bg-background p-6 shadow-[0_18px_65px_-40px_rgba(15,23,42,0.45)] sm:p-7">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-primary/10 via-transparent to-transparent dark:from-primary/15" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {eyebrow}
            </span>
            {routes.map((route) => (
              <Badge
                key={`${route.label}-${route.value}`}
                variant="outline"
                className="rounded-full border-border bg-background px-3 py-1 text-[11px] font-medium text-foreground/88"
              >
                <span className="mr-2 text-muted-foreground">{route.label}</span>
                <span>{route.value}</span>
              </Badge>
            ))}
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-[2.5rem]">
              {title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
              {description}
            </p>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-start">{actions}</div> : null}
      </div>
    </header>
  );
}

export function RunMetaPanel({
  title,
  description,
  items,
  controls,
  footer,
}: RunMetaPanelProps) {
  return (
    <section className="rounded-[26px] border border-border bg-background p-5 shadow-[0_16px_50px_-38px_rgba(15,23,42,0.48)] sm:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-base font-semibold tracking-[-0.03em] text-foreground">
              {title}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
          {controls ? <div className="flex shrink-0 items-start">{controls}</div> : null}
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              className="rounded-2xl border border-border bg-muted px-4 py-3.5"
            >
              <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </dt>
              <dd className="mt-2 text-sm font-medium text-foreground">{item.value}</dd>
              {item.hint ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.hint}</p>
              ) : null}
            </div>
          ))}
        </dl>
        {footer ? <div className="border-t border-border pt-4">{footer}</div> : null}
      </div>
    </section>
  );
}

export function QuickActionsGrid({
  title,
  description,
  actions,
  onAction,
}: QuickActionsGridProps) {
  return (
    <section className="rounded-[26px] border border-border bg-background p-5 shadow-[0_16px_50px_-38px_rgba(15,23,42,0.48)] sm:p-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-base font-semibold tracking-[-0.03em] text-foreground">
            {title}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map((action) => {
            const Icon = QUICK_ACTION_ICONS[action.icon ?? 'default'] ?? QUICK_ACTION_ICONS.default;
            const highlight = action.tone === 'highlight';

            return (
              <Button
                key={action.id}
                type="button"
                variant="ghost"
                onClick={() => onAction?.(action.id)}
                className={cn(
                  'group h-auto justify-start rounded-2xl border px-4 py-4 text-left transition-all duration-200',
                  highlight
                    ? 'border-primary/30 bg-primary/[0.08] hover:border-primary/45 hover:bg-primary/[0.12]'
                    : 'border-border bg-muted hover:border-border hover:bg-muted',
                )}
              >
                <div className="flex w-full items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-muted-foreground transition-colors',
                      highlight
                        ? 'border-primary/30 bg-background text-primary'
                        : 'border-border bg-background group-hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">{action.label}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {action.detail}
                    </span>
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function InspectorTabs({ value, onValueChange }: InspectorTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl border border-border bg-muted p-1">
        <TabsTrigger
          value="guide"
          className="rounded-xl px-3 py-2.5 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          Guide
        </TabsTrigger>
        <TabsTrigger
          value="verification"
          className="rounded-xl px-3 py-2.5 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          Verification
        </TabsTrigger>
        <TabsTrigger
          value="coverage"
          className="rounded-xl px-3 py-2.5 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          Coverage
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function SavedRunListHeader({
  runCount,
  action,
}: {
  runCount: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Saved runs
        </p>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-[-0.03em] text-foreground">
            Recent operator threads
          </h2>
          <Badge variant="outline" className="rounded-full border-border bg-background px-2.5 py-0.5 text-[11px]">
            {runCount}
          </Badge>
        </div>
      </div>
      {action}
    </div>
  );
}

export function ComposerSectionTitle({
  title,
  detail,
  trailing,
}: {
  title: string;
  detail: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-[-0.035em] text-foreground">
          {title}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

export function InlineStatusBadge({
  icon,
  label,
}: {
  icon?: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground/88">
      {icon ?? <Bot className="h-3.5 w-3.5 text-muted-foreground" />}
      <span>{label}</span>
    </span>
  );
}
