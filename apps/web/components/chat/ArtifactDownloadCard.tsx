'use client';

import { useState } from 'react';
import { FileText, FileSpreadsheet, Presentation, Download, ChevronDown, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const fileConfig: Record<string, { icon: React.ElementType; accent: string }> = {
  pdf: { icon: FileText, accent: 'border-l-blue-500 text-blue-400' },
  docx: { icon: FileText, accent: 'border-l-blue-500 text-blue-400' },
  pptx: { icon: Presentation, accent: 'border-l-purple-500 text-purple-400' },
  xlsx: { icon: FileSpreadsheet, accent: 'border-l-emerald-500 text-emerald-400' },
};

function getFileConfig(type: string) {
  return fileConfig[type.toLowerCase()] ?? { icon: FileText, accent: 'border-l-slate-500 text-slate-400' };
}

function inferArtifactType(filename: string): string {
  const f = filename.toLowerCase();
  if (f.includes('proforma') || f.includes('underwriting')) return 'underwriting';
  if (f.includes('screen') || f.includes('triage')) return 'screening';
  if (f.includes('checklist') || f.includes('dd') || f.includes('diligence')) return 'checklist';
  if (f.includes('memo') || f.includes('report')) return 'memo';
  if (f.includes('loi') || f.includes('letter')) return 'letter';
  return 'general';
}

function getNextArtifactSuggestions(type: string): Array<{ label: string; prompt: string }> {
  switch (type) {
    case 'underwriting':
      return [
        { label: 'Generate Investment Memo', prompt: 'Generate a comprehensive investment memo based on the underwriting analysis just completed.' },
        { label: 'Draft LOI', prompt: 'Draft a Letter of Intent using the deal terms from the underwriting.' },
      ];
    case 'screening':
      return [
        { label: 'Run Full Underwriting', prompt: 'Run full underwriting based on the screening results.' },
        { label: 'Generate DD Checklist', prompt: 'Generate a due diligence checklist prioritized by the screening findings.' },
      ];
    case 'checklist':
      return [
        { label: 'Generate Investment Memo', prompt: 'Generate an investment memo incorporating the due diligence findings.' },
        { label: 'Prepare Disposition Brief', prompt: 'Prepare a disposition analysis brief for this deal.' },
      ];
    default:
      return [
        { label: 'Generate Investment Memo', prompt: 'Generate a comprehensive investment memo for this deal.' },
        { label: 'Summarize Findings', prompt: 'Summarize all findings and recommendations from the analysis so far.' },
      ];
  }
}

interface ArtifactDownloadCardProps {
  name: string;
  fileType: string;
  version?: string;
  downloadUrl: string;
  type?: string;
  messageId?: string;
  onGenerateNext?: (prompt: string) => void;
}

export function ArtifactDownloadCard({
  name,
  fileType,
  version,
  downloadUrl,
  type,
  messageId,
  onGenerateNext,
}: ArtifactDownloadCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const config = getFileConfig(fileType);
  const Icon = config.icon;
  const [, accentText] = config.accent.split(' ');
  const artifactType = type ?? inferArtifactType(name);
  const suggestions = getNextArtifactSuggestions(artifactType);

  return (
    <Card className="my-2 border-border/70 bg-background/75">
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/25">
            <Icon className={cn('h-5 w-5', accentText)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-medium text-foreground">{name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                {fileType.toUpperCase()}
              </Badge>
              {version ? (
                <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                  v{version}
                </Badge>
              ) : null}
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" asChild>
            <a href={downloadUrl} download>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </a>
          </Button>
        </div>

        {/* Generate Next dropdown */}
        {onGenerateNext && suggestions.length > 0 && (
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs font-mono text-muted-foreground"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', menuOpen && 'rotate-180')}
              />
              Generate Next
            </Button>
            {menuOpen && (
              <div className="mt-1 rounded-lg border border-border/60 bg-background shadow-md">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-left text-xs text-foreground/80 hover:bg-muted/50 first:rounded-t-lg last:rounded-b-lg"
                    onClick={() => {
                      onGenerateNext(s.prompt);
                      setMenuOpen(false);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Source link */}
        {messageId && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
            <Eye className="h-2.5 w-2.5" />
            <span>View source</span>
            <span className="text-foreground/50">#{messageId.slice(0, 8)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
