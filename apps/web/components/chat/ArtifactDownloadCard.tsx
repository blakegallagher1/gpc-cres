'use client';

import { FileText, FileSpreadsheet, Presentation, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface ArtifactDownloadCardProps {
  name: string;
  fileType: string;
  version?: string;
  downloadUrl: string;
}

export function ArtifactDownloadCard({
  name,
  fileType,
  version,
  downloadUrl,
}: ArtifactDownloadCardProps) {
  const config = getFileConfig(fileType);
  const Icon = config.icon;

  return (
    <div className={cn(
      'my-2 flex items-center gap-3 rounded-lg border border-[#2a2f3e] border-l-4 bg-[#12141c]/80 p-3 transition-colors hover:bg-[#1a1d28]',
      config.accent.split(' ')[0],
    )}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1e2230]">
        <Icon className={cn('h-5 w-5', config.accent.split(' ')[1])} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm font-medium text-slate-200">{name}</p>
        <p className="font-mono text-xs text-slate-500">
          {fileType.toUpperCase()}
          {version ? ` v${version}` : ''}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="border-[#2a2f3e] bg-transparent text-slate-300 hover:bg-[#1e2230] hover:text-white"
        asChild
      >
        <a href={downloadUrl} download>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download
        </a>
      </Button>
    </div>
  );
}
