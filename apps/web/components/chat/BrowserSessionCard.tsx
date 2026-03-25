'use client';

import { useState } from 'react';
import { Globe, Download, BookOpen, ChevronDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface BrowserSessionCardProps {
  url: string;
  success: boolean;
  screenshots: string[];
  turns: number;
  modeUsed: string;
  cost?: { inputTokens: number; outputTokens: number };
  data?: unknown;
  error?: string;
  finalMessage?: string;
  source?: { url: string; fetchedAt: string };
  onSaveToKnowledgeBase?: () => void;
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return url;
  }
}

function formatCost(cost?: { inputTokens: number; outputTokens: number }): string {
  if (!cost) return '$0.00';
  const inputCost = cost.inputTokens * 0.000003;
  const outputCost = cost.outputTokens * 0.000015;
  const total = inputCost + outputCost;
  return `$${total.toFixed(2)}`;
}

function estimateDuration(turns: number): string {
  const seconds = Math.max(3, turns * 2);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

function JSONViewer({ data }: { data: unknown }) {
  return (
    <ScrollArea className="max-h-64 rounded-xl border border-border/60 bg-muted/35">
      <pre className="whitespace-pre-wrap p-3 font-mono text-xs text-foreground/80">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </pre>
    </ScrollArea>
  );
}

function ErrorAlert({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-destructive/25 bg-destructive/8 p-3">
      <div className="flex gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-destructive font-medium mb-1">
            Error
          </p>
          <p className="text-xs text-destructive/85">{error}</p>
        </div>
      </div>
    </div>
  );
}

export function BrowserSessionCard({
  url,
  success,
  screenshots,
  turns,
  modeUsed,
  cost,
  data,
  error,
  finalMessage,
  source,
  onSaveToKnowledgeBase,
}: BrowserSessionCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const domain = extractDomain(url);
  const duration = estimateDuration(turns);
  const costStr = formatCost(cost);
  const lastScreenshot = screenshots?.[screenshots.length - 1];
  const hasData = data != null && typeof data === 'object' && Object.keys(data as Record<string, unknown>).length > 0;

  return (
    <Card
      className={cn(
        'my-3 border-border/70 bg-background/75',
        !success && 'border-destructive/40 ring-1 ring-destructive/20'
      )}
    >
      {/* Header */}
      <CardHeader className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Browser Session
          </span>
          <Badge
            variant="outline"
            className="rounded-md px-2 py-0.5 font-mono text-[10px] font-medium"
          >
            {domain}
          </Badge>
        </div>
      </CardHeader>

      <Separator />

      {/* Screenshot Preview */}
      <CardContent className="flex flex-col gap-3 p-4">
        {lastScreenshot ? (
          <div className="rounded-lg border border-border/60 bg-muted/35 overflow-hidden">
            <img
              src={lastScreenshot}
              alt={`Browser session screenshot for ${domain}`}
              className="w-full max-h-48 object-cover"
            />
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-lg border border-border/60 bg-muted/35">
            <span className="text-xs text-muted-foreground">No screenshot available</span>
          </div>
        )}

        {/* Stats Row */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Turn</span>
            <span className="font-mono font-medium">{turns}</span>
          </div>
          <div className="w-px h-4 bg-border/40" />
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Mode</span>
            <span className="font-mono font-medium">{modeUsed}</span>
          </div>
          <div className="w-px h-4 bg-border/40" />
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Time</span>
            <span className="font-mono font-medium">{duration}</span>
          </div>
          <div className="w-px h-4 bg-border/40" />
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Cost</span>
            <span className="font-mono font-medium">{costStr}</span>
          </div>
        </div>

        {/* Error Alert */}
        <ErrorAlert error={error} />

        {/* Actions Collapsible */}
        {finalMessage ? (
          <Collapsible open={actionsOpen} onOpenChange={setActionsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 justify-start gap-2 px-2 text-xs font-mono"
              >
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform', actionsOpen && 'rotate-180')}
                />
                <span>Actions</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/80 leading-relaxed">
                  {finalMessage}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {/* Data Collapsible */}
        {hasData ? (
          <Collapsible open={dataOpen} onOpenChange={setDataOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 justify-start gap-2 px-2 text-xs font-mono"
              >
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform', dataOpen && 'rotate-180')}
                />
                <span>Extracted Data</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <JSONViewer data={data} />
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {onSaveToKnowledgeBase ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-full px-3 text-xs"
              onClick={onSaveToKnowledgeBase}
            >
              <BookOpen className="h-3 w-3" />
              Save to Knowledge Base
            </Button>
          ) : null}
          {lastScreenshot ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => {
                const link = document.createElement('a');
                link.href = lastScreenshot;
                link.download = `screenshot-${domain}-${Date.now()}.png`;
                link.click();
              }}
            >
              <Download className="h-3 w-3" />
              Download
            </Button>
          ) : null}
        </div>

        {/* Source Info */}
        {source?.fetchedAt ? (
          <div className="pt-2 text-xs text-muted-foreground font-mono">
            Fetched at {new Date(source.fetchedAt).toLocaleString()}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
