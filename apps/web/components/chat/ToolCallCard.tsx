'use client';

import { useState } from 'react';
import { ChevronDown, Database, Search, Calculator, FileText, Globe, Wrench } from 'lucide-react';
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
    <div className="my-2 rounded-lg border bg-muted/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 font-medium">{name}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>
      {expanded && (
        <div className="border-t px-3 py-2 text-xs">
          {args && Object.keys(args).length > 0 && (
            <div className="mb-2">
              <p className="mb-1 font-medium text-muted-foreground">Arguments</p>
              <pre className="overflow-x-auto rounded bg-background p-2">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result && (
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Result</p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background p-2">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
