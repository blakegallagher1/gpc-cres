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
      <div className="flex items-center gap-3">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-[160px]">
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
          className="gap-1.5"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Choose File
        </Button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <FileUp className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {uploading ? "Uploading..." : "Drop files here or click to browse"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          PDF, DOC, XLSX, CSV, images up to 50MB
        </p>
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
