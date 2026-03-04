"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, Loader2, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FILE_CATEGORIES = [
  { value: "title", label: "Title" },
  { value: "environmental", label: "Environmental" },
  { value: "survey", label: "Survey" },
  { value: "financial", label: "Financial" },
  { value: "legal", label: "Legal" },
  { value: "other", label: "Other" },
] as const;

const ACCEPTED_TYPES = ".pdf,.doc,.docx,.xlsx,.xls,.csv,.jpg,.png,.tif";
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export interface UploadItem {
  id: string;
  kind: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

interface FileUploadZoneProps {
  dealId: string;
  onUploadComplete: (upload: UploadItem) => void;
}

export function FileUploadZone({ dealId, onUploadComplete }: FileUploadZoneProps) {
  const [kind, setKind] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_SIZE) {
        toast.error("File too large. Maximum size is 50MB.");
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", kind);

        const res = await fetch(`/api/deals/${dealId}/uploads`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }

        const data = await res.json();
        onUploadComplete(data.upload);
        toast.success(`Uploaded ${file.name}`);
      } catch (error) {
        console.error("Upload error:", error);
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [dealId, kind, onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all duration-300",
          dragOver
            ? "border-blue-500 bg-blue-500/5 shadow-inner shadow-blue-500/10"
            : "upload-zone-breathe border-blue-400/25 bg-gradient-to-br from-blue-500/[0.03] to-slate-500/[0.02] hover:border-blue-400/40 hover:bg-blue-500/[0.04]",
        )}
      >
        {/* Gradient overlay */}
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-t from-blue-500/[0.04] to-transparent" />

        <div className="relative z-10 flex flex-col items-center gap-4">
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/10 transition-transform duration-300",
              dragOver && "scale-110",
            )}
          >
            <FileUp
              className={cn(
                "h-7 w-7 text-blue-500 transition-transform dark:text-blue-400",
                dragOver && "animate-bounce",
              )}
            />
          </div>

          <div className="text-center">
            <p className="font-mono text-sm font-medium text-foreground">
              {uploading ? "Uploading..." : dragOver ? "Drop to upload" : "Drop files here"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, Excel, Word, or images — up to 50MB
            </p>
          </div>

          {/* Inline category select + button */}
          <div className="flex items-center gap-2 pt-2">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-9 w-[140px] text-xs" onClick={(e) => e.stopPropagation()}>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {FILE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              disabled={uploading}
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Choose File
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
