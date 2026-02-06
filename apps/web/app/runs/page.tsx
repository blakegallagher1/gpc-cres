"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PlayCircle,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  MoreHorizontal,
  Trash2,
  Download,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { formatNumber, formatCurrency, timeAgo } from "@/lib/utils";
import { Run } from "@/types";
import { toast } from "sonner";
import { useAgents } from "@/lib/hooks/useAgents";
import { useRuns } from "@/lib/hooks/useRuns";


function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { icon: React.ElementType; class: string; label: string }> = {
    success: { icon: CheckCircle2, class: "bg-green-500/10 text-green-500", label: "Success" },
    running: { icon: Loader2, class: "bg-blue-500/10 text-blue-500", label: "Running" },
    error: { icon: XCircle, class: "bg-red-500/10 text-red-500", label: "Error" },
    pending: { icon: Clock, class: "bg-yellow-500/10 text-yellow-500", label: "Pending" },
  };

  const variant = variants[status] || variants.pending;
  const Icon = variant.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${variant.class}`}>
      <Icon className={`h-3.5 w-3.5 ${status === "running" ? "animate-spin" : ""}`} />
      {variant.label}
    </span>
  );
}

export default function RunsPage() {
  const { agents } = useAgents();
  const { runs, mutate: mutateRuns } = useRuns();
  const [searchQuery, setSearchQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set());
  const sortBy: keyof Run = "started_at";

  const filteredRuns = runs.filter((run) => {
    const agent = agents.find((a) => a.id === run.agent_id);
    const matchesSearch =
      run.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent?.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAgent = agentFilter === "all" || run.agent_id === agentFilter;
    const matchesStatus = statusFilter === "all" || run.status === statusFilter;
    return matchesSearch && matchesAgent && matchesStatus;
  });

  const sortedRuns = [...filteredRuns].sort((a, b) => {
    const aVal = a[sortBy as keyof Run];
    const bVal = b[sortBy as keyof Run];
    const aComparable = aVal ?? "";
    const bComparable = bVal ?? "";
    return aComparable < bComparable ? 1 : -1;
  });

  const toggleSelectAll = () => {
    if (selectedRuns.size === sortedRuns.length) {
      setSelectedRuns(new Set());
    } else {
      setSelectedRuns(new Set(sortedRuns.map((r) => r.id)));
    }
  };

  const toggleSelectRun = (runId: string) => {
    const newSelected = new Set(selectedRuns);
    if (newSelected.has(runId)) {
      newSelected.delete(runId);
    } else {
      newSelected.add(runId);
    }
    setSelectedRuns(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedRuns.size === 0) return;

    try {
      await Promise.all(
        Array.from(selectedRuns).map((runId) =>
          fetch(`/api/runs/${runId}`, { method: "DELETE" })
        )
      );
      await mutateRuns();
      setSelectedRuns(new Set());
      toast.success(`${selectedRuns.size} runs deleted`);
    } catch {
      toast.error("Failed to delete runs");
    }
  };

  const handleBulkExport = () => {
    const selectedRunsData = runs.filter((r) => selectedRuns.has(r.id));
    const blob = new Blob([JSON.stringify(selectedRunsData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `runs-export-${new Date().toISOString()}.json`;
    a.click();
    toast.success(`${selectedRuns.size} runs exported`);
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Run History</h1>
            <p className="text-muted-foreground">
              Trace and inspect agent executions
            </p>
          </div>
          {selectedRuns.size > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleBulkExport}>
                <Download className="mr-2 h-4 w-4" />
                Export ({selectedRuns.size})
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete ({selectedRuns.size})
              </Button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search runs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Runs Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        sortedRuns.length > 0 && selectedRuns.size === sortedRuns.length
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRuns.map((run) => {
                  const agent = agents.find((a) => a.id === run.agent_id);
                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedRuns.has(run.id)}
                          onCheckedChange={() => toggleSelectRun(run.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{run.id}</TableCell>
                      <TableCell>{agent?.name || "Unknown"}</TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell>
                        {run.duration_ms
                          ? `${Math.round(run.duration_ms / 1000)}s`
                          : "—"}
                      </TableCell>
                      <TableCell>{formatNumber(run.tokens_used ?? 0)}</TableCell>
                      <TableCell>{formatCurrency(run.cost ?? 0)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {timeAgo(run.started_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/runs/${run.id}`}>View Trace</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                navigator.clipboard.writeText(run.id);
                                toast.success("Run ID copied");
                              }}
                            >
                              Copy ID
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {sortedRuns.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <PlayCircle className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No runs found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
