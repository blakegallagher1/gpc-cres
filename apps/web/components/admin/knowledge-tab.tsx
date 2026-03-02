"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyedMutator } from "swr";

interface KnowledgeRow {
  id: string;
  contentType: string;
  sourceId: string;
  contentText: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface KnowledgeData {
  rows: KnowledgeRow[];
  total: number;
  page: number;
  contentTypes: string[];
}

interface Props {
  data: KnowledgeData | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<Record<string, unknown>>;
  page: number;
  onPageChange: (page: number) => void;
  search: string;
  onSearchChange: (search: string) => void;
  contentType: string;
  onContentTypeChange: (contentType: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function KnowledgeTab({ data, isLoading, mutate, page, onPageChange, search, onSearchChange, contentType, onContentTypeChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Knowledge entry deleted");
      mutate();
    } catch {
      toast.error("Failed to delete entry");
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  }

  async function handleExport() {
    try {
      const res = await fetch("/api/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "knowledge" }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed");
    }
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totalPages = Math.ceil(data.total / 25);

  return (
    <div className="space-y-4 pt-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search content..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-48"
        />
        <Select value={contentType || "all"} onValueChange={(v) => onContentTypeChange(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {data.contentTypes.map((ct) => (
              <SelectItem key={ct} value={ct}>{ct}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {data.total.toLocaleString()} entries
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Type</TableHead>
                <TableHead className="w-[140px]">Source ID</TableHead>
                <TableHead>Content</TableHead>
                <TableHead className="w-[100px]">Created</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No knowledge entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((row) => (
                  <>
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        setExpandedId(expandedId === row.id ? null : row.id)
                      }
                    >
                      <TableCell>
                        <Badge variant="secondary">{row.contentType}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[140px]">
                        {row.sourceId}
                      </TableCell>
                      <TableCell className="truncate max-w-[300px]">
                        {row.contentText.slice(0, 120)}
                        {row.contentText.length > 120 ? "..." : ""}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatRelativeTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant={confirmDeleteId === row.id ? "destructive" : "ghost"}
                          size="sm"
                          disabled={deleting}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(row.id);
                          }}
                        >
                          {confirmDeleteId === row.id ? "Confirm?" : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedId === row.id && (
                      <TableRow key={`${row.id}-detail`}>
                        <TableCell colSpan={5} className="bg-muted/30 p-4">
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="font-medium">Full content:</span>
                              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                                {row.contentText}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Metadata:</span>
                              <pre className="mt-1 text-xs bg-background p-2 rounded overflow-x-auto">
                                {JSON.stringify(row.metadata, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
