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
    <div className="my-2 overflow-hidden rounded-lg border border-[#2a2f3e] bg-[#12141c]/80">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 bg-[#0f1118]/60 px-3 py-2 text-left text-sm transition-colors hover:bg-[#1a1d28]"
      >
        <Icon className="h-4 w-4 shrink-0 text-blue-400" />
        <span className="flex-1 font-mono font-medium text-slate-300">{name}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </button>
      {expanded && (
        <div className="border-t border-[#1e2230] text-xs">
          {args && Object.keys(args).length > 0 && (
            <div className="border-b border-[#1e2230] px-3 py-2">
              <p className="mb-1 font-mono text-[11px] font-medium text-slate-500">Arguments</p>
              <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap font-mono text-slate-400">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result && (
            <div className="px-3 py-2">
              <p className="mb-1 font-mono text-[11px] font-medium text-slate-500">Result</p>
              <pre className="max-h-64 overflow-x-auto whitespace-pre-wrap font-mono text-emerald-400/80">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
