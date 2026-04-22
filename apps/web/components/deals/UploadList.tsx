"use client";

import { useState } from "react";
import { Download, Trash2, FileText, FileSpreadsheet, Image, File, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { UploadItem } from "./FileUploadZone";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(contentType: string) {
  if (contentType.includes("pdf")) return FileText;
  if (contentType.includes("sheet") || contentType.includes("excel") || contentType.includes("csv"))
    return FileSpreadsheet;
  if (contentType.startsWith("image/")) return Image;
  return File;
}

const categoryConfig: Record<string, { bg: string; icon: string; border: string; badge: string }> = {
  title: {
    bg: "bg-blue-500/10 dark:bg-blue-500/15",
    icon: "text-blue-600 dark:text-blue-400",
    border: "border-l-blue-500",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  environmental: {
    bg: "bg-green-500/10 dark:bg-green-500/15",
    icon: "text-green-600 dark:text-green-400",
    border: "border-l-green-500",
    badge: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  },
  survey: {
    bg: "bg-purple-500/10 dark:bg-purple-500/15",
    icon: "text-purple-600 dark:text-purple-400",
    border: "border-l-purple-500",
    badge: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  },
  financial: {
    bg: "bg-amber-500/10 dark:bg-amber-500/15",
    icon: "text-amber-600 dark:text-amber-400",
    border: "border-l-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
  legal: {
    bg: "bg-red-500/10 dark:bg-red-500/15",
    icon: "text-red-600 dark:text-red-400",
    border: "border-l-red-500",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  },
  other: {
    bg: "bg-slate-500/10 dark:bg-slate-500/15",
    icon: "text-slate-600 dark:text-slate-400",
    border: "border-l-slate-400",
    badge: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
  },
};

function getCategoryConfig(kind: string) {
  return categoryConfig[kind] ?? categoryConfig.other;
}

interface UploadListProps {
  dealId: string;
  uploads: UploadItem[];
  onDelete?: (uploadId: string) => void;
}

export function UploadList({ dealId, uploads, onDelete }: UploadListProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDownload = async (upload: UploadItem) => {
    setDownloadingId(upload.id);
    try {
      const res = await fetch(`/api/deals/${dealId}/uploads/${upload.id}`);
      if (!res.ok) throw new Error("Failed to get download URL");
      const data = await res.json();
      window.open(data.url, "_blank");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download file");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (upload: UploadItem) => {
    if (!confirm(`Delete "${upload.filename}"?`)) return;
    setDeletingId(upload.id);
    try {
      const res = await fetch(`/api/deals/${dealId}/uploads/${upload.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      onDelete?.(upload.id);
      toast.success("File deleted");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  };

  if (uploads.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
          <File className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-mono text-sm font-medium text-foreground">No documents yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload title docs, environmental reports, surveys, and financials above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {uploads.map((upload) => {
        const Icon = getFileIcon(upload.contentType);
        const cat = getCategoryConfig(upload.kind);

        return (
          <div
            key={upload.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border border-l-4 p-3 transition-all hover:-translate-y-px hover:shadow-md",
              cat.border,
            )}
          >
            {/* Icon in colored circle */}
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", cat.bg)}>
              <Icon className={cn("h-5 w-5", cat.icon)} />
            </div>

            {/* File info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{upload.filename}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {formatBytes(upload.sizeBytes)} · {timeAgo(upload.createdAt)}
              </p>
            </div>

            {/* Category badge */}
            <Badge variant="outline" className={cn("shrink-0 text-xs", cat.badge)}>
              {upload.kind.charAt(0).toUpperCase() + upload.kind.slice(1)}
            </Badge>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleDownload(upload)}
                disabled={downloadingId === upload.id}
              >
                {downloadingId === upload.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(upload)}
                disabled={deletingId === upload.id}
              >
                {deletingId === upload.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
