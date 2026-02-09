'use client';

import { FileText, FileSpreadsheet, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

const fileIcons: Record<string, React.ElementType> = {
  pdf: FileText,
  pptx: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  docx: FileText,
};

function getFileIcon(type: string): React.ElementType {
  return fileIcons[type.toLowerCase()] ?? FileText;
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
  const Icon = getFileIcon(fileType);

  return (
    <div className="my-2 flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">
          {fileType.toUpperCase()}
          {version ? ` v${version}` : ''}
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <a href={downloadUrl} download>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download
        </a>
      </Button>
    </div>
  );
}
