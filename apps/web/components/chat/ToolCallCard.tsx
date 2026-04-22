'use client';

import { useState } from 'react';
import { ChevronDown, Database, Search, Calculator, FileText, Globe, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const toolIcons: Record<string, React.ElementType> = {
  database: Database,
  query: Database,
  search: Search,
  lookup: Search,
  calculate: Calculator,
  compute: Calculator,
  financial: Calculator,
  document: FileText,
  file: FileText,
  api: Globe,
  fetch: Globe,
};

function getToolIcon(toolName: string): React.ElementType {
  const lower = toolName.toLowerCase();
  for (const [key, icon] of Object.entries(toolIcons)) {
    if (lower.includes(key)) return icon;
  }
  return Wrench;
}

interface ToolCallCardProps {
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  latencyMs?: number;
  citations?: number;
  status?: 'ok' | 'error' | 'running';
}

export function ToolCallCard({ name, args, result, latencyMs, citations, status = 'ok' }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(name);

  const statusText =
    status === 'running' ? `running…` :
    status === 'error'   ? `✕ failed` :
    `✓${latencyMs != null ? ` ${latencyMs}ms` : ''}${citations ? ` · ${citations} citations` : ''}`;

  const statusColor =
    status === 'running' ? 'text-ink-fade' :
    status === 'error'   ? 'text-ed-warn' :
    'text-ed-ok';

  return (
    <div className="my-2 overflow-hidden rounded border border-rule-soft bg-paper-soft">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="flex items-center justify-between gap-2 border-b border-rule-soft bg-paper-inset px-3 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
            <span className="truncate font-mono text-[11.5px] font-semibold tracking-[0.02em] text-ink">
              {name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('font-mono text-[10.5px] tracking-[0.04em]', statusColor)}>
              {statusText}
            </span>
            {(result || args) && (
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="size-6 rounded">
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 text-ink-fade transition-transform',
                      expanded && 'rotate-180',
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>
        {result ? (
          <div className="px-3 py-2.5 text-[12.5px] leading-[1.55] text-ink">{result}</div>
        ) : null}
        <CollapsibleContent>
          {args && Object.keys(args).length > 0 ? (
            <div className="border-t border-rule-soft bg-paper-inset px-3 py-2.5">
              <p className="ed-eyebrow mb-1.5">Arguments</p>
              <ScrollArea className="max-h-48 rounded border border-rule-soft bg-paper-panel">
                <pre className="whitespace-pre-wrap p-2.5 font-mono text-[11px] leading-5 text-ink-soft">
                  {JSON.stringify(args, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
