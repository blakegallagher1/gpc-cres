'use client';

import { FileText, FileSpreadsheet, Presentation, Download } from 'lucide-react';
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
  const [, accentText] = config.accent.split(' ');

  return (
    <Card className="my-2 border-border/70 bg-background/75">
      <CardContent className="flex items-center gap-3 p-3">
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
      </CardContent>
    </Card>
  );
}
