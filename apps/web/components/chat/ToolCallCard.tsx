'use client';

import { useState } from 'react';
import { ChevronDown, Database, Search, Calculator, FileText, Globe, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
}

export function ToolCallCard({ name, args, result }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(name);

  return (
    <Card className="my-2 overflow-hidden border-border/70 bg-background/75">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/30">
              <Icon className="h-4 w-4 text-foreground/80" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-foreground">
                {name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {args && Object.keys(args).length > 0 ? (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                    Args
                  </Badge>
                ) : null}
                {result ? (
                  <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                    Result
                  </Badge>
                ) : null}
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8 rounded-xl">
                <ChevronDown
                  className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <Separator />
          <CardContent className="flex flex-col gap-3 px-3 py-3">
            {args && Object.keys(args).length > 0 ? (
              <div className="flex flex-col gap-1.5 text-xs">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Arguments
                </p>
                <ScrollArea className="max-h-48 rounded-xl border border-border/60 bg-muted/25">
                  <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-5 text-foreground/80">
                    {JSON.stringify(args, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            ) : null}
            {result ? (
              <div className="flex flex-col gap-1.5 text-xs">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Result
                </p>
                <ScrollArea className="max-h-64 rounded-xl border border-border/60 bg-muted/15">
                  <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-5 text-foreground/85">
                    {result}
                  </pre>
                </ScrollArea>
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
