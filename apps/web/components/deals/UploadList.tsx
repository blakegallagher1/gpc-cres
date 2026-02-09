"use client";

import { useState } from "react";
import { Download, Trash2, FileText, FileSpreadsheet, Image, File, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import { toast } from "sonner";
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

const kindColors: Record<string, string> = {
  title: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  environmental: "bg-green-500/10 text-green-700 dark:text-green-400",
  survey: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  financial: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  legal: "bg-red-500/10 text-red-700 dark:text-red-400",
  other: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
};

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
      <p className="py-8 text-center text-sm text-muted-foreground">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {uploads.map((upload) => {
        const Icon = getFileIcon(upload.contentType);
        return (
          <div
            key={upload.id}
            className="flex items-center gap-3 rounded-lg border p-3"
          >
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{upload.filename}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatBytes(upload.sizeBytes)}</span>
                <span>{timeAgo(upload.createdAt)}</span>
              </div>
            </div>
            <Badge
              variant="secondary"
              className={kindColors[upload.kind] || kindColors.other}
            >
              {upload.kind}
            </Badge>
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
              className="h-8 w-8 text-destructive hover:text-destructive"
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
        );
      })}
    </div>
  );
}
