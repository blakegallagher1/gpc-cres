"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { KeyedMutator } from "swr";

interface VerifiedFactRow {
  id: string;
  entityId: string;
  entityAddress: string;
  entityType: string;
  factType: string;
  sourceType: string;
  economicWeight: number;
  volatilityClass: string;
  payloadJson: Record<string, unknown>;
  tier: number;
  createdAt: string;
}

interface EntityRow {
  id: string;
  canonicalAddress: string | null;
  parcelId: string | null;
  type: string;
  factsCount: number;
  createdAt: string;
}

interface MemoryData {
  subTab: "facts" | "entities";
  rows: VerifiedFactRow[] | EntityRow[];
  total: number;
  page: number;
}

interface Props {
  data: MemoryData | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<Record<string, unknown>>;
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

function confidenceColor(weight: number): string {
  if (weight >= 0.8) return "bg-green-500";
  if (weight >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
}

export default function MemoryTab({ data, isLoading, mutate }: Props) {
  const [subTab, setSubTab] = useState<"facts" | "entities">("facts");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteMemory(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/memory/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Memory record deleted");
      mutate();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      {/* Sub-tab pills */}
      <div className="flex gap-2">
        <Button
          variant={subTab === "facts" ? "default" : "outline"}
          size="sm"
          onClick={() => setSubTab("facts")}
        >
          Verified Facts
        </Button>
        <Button
          variant={subTab === "entities" ? "default" : "outline"}
          size="sm"
          onClick={() => setSubTab("entities")}
        >
          Entities
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{data.total.toLocaleString()} records</p>

      {subTab === "facts" ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Fact Type</TableHead>
                  <TableHead>Payload</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-[80px]">Weight</TableHead>
                  <TableHead className="w-[80px]">Created</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows as VerifiedFactRow[]).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No verified memories yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data.rows as VerifiedFactRow[]).map((row) => (
                    <>
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                      >
                        <TableCell className="truncate max-w-[160px]">
                          {row.entityAddress}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.factType}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {JSON.stringify(row.payloadJson).slice(0, 80)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.sourceType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${confidenceColor(row.economicWeight)}`} />
                            <span className="text-xs">{row.economicWeight.toFixed(2)}</span>
                          </div>
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
                              handleDeleteMemory(row.id);
                            }}
                          >
                            {confirmDeleteId === row.id ? "Confirm?" : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedId === row.id && (
                        <TableRow key={`${row.id}-detail`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            <pre className="text-xs overflow-x-auto">
                              {JSON.stringify(row.payloadJson, null, 2)}
                            </pre>
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
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Parcel ID</TableHead>
                  <TableHead className="w-[80px]">Facts</TableHead>
                  <TableHead className="w-[80px]">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows as EntityRow[]).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No entities tracked yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data.rows as EntityRow[]).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.canonicalAddress ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.parcelId ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">{row.factsCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatRelativeTime(row.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
