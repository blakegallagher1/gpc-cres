"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { formatNumber, timeAgo } from "@/lib/utils";
import { WorkflowRun } from "@/types";
import { toast } from "sonner";
import { useRuns } from "@/lib/hooks/useRuns";
import { RunIntelligenceTab } from "@/components/runs/RunIntelligenceTab";
import type { RunDashboardPayload } from "@/lib/hooks/useRunDashboard";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { icon: React.ElementType; class: string; label: string }> = {
    succeeded: { icon: CheckCircle2, class: "bg-green-500/10 text-green-500", label: "Succeeded" },
    running: { icon: Loader2, class: "bg-blue-500/10 text-blue-500", label: "Running" },
    failed: { icon: XCircle, class: "bg-red-500/10 text-red-500", label: "Failed" },
    canceled: { icon: Clock, class: "bg-yellow-500/10 text-yellow-500", label: "Canceled" },
  };

  const variant = variants[status] || variants.running;
  const Icon = variant.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${variant.class}`}>
      <Icon className={`h-3.5 w-3.5 ${status === "running" ? "animate-spin" : ""}`} />
      {variant.label}
    </span>
  );
}

type RunsPageTab = "history" | "intelligence";

type RunsHistoryTabProps = {
  initialRuns?: WorkflowRun[];
};

function RunsHistoryTab({ initialRuns = [] }: RunsHistoryTabProps) {
  const { runs, mutate: mutateRuns } = useRuns({}, { fallbackData: { runs: initialRuns } });
  const [searchQuery, setSearchQuery] = useState("");
  const [runTypeFilter, setRunTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set());
  const sortBy: keyof WorkflowRun = "startedAt";

  const runTypes = Array.from(new Set(runs.map((run) => run.runType))).sort(
    (a, b) => a.localeCompare(b),
  );

  const filteredRuns = runs.filter((run) => {
    const lastAgentName = run.summary?.lastAgentName;
    const matchesSearch =
      run.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.runType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lastAgentName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesRunType = runTypeFilter === "all" || run.runType === runTypeFilter;
    const matchesStatus = statusFilter === "all" || run.status === statusFilter;
    return matchesSearch && matchesRunType && matchesStatus;
  });

  const sortedRuns = [...filteredRuns].sort((a, b) => {
    const aVal = a[sortBy as keyof WorkflowRun];
    const bVal = b[sortBy as keyof WorkflowRun];
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Run History</h1>
          <p className="text-muted-foreground">Trace and inspect agent executions</p>
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
        <Select value={runTypeFilter} onValueChange={setRunTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Run Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Run Types</SelectItem>
            {runTypes.map((runType) => (
              <SelectItem key={runType} value={runType}>
                {runType}
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
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Agent</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRuns.map((run) => {
                return (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedRuns.has(run.id)}
                        onCheckedChange={() => toggleSelectRun(run.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{run.id}</TableCell>
                    <TableCell>{run.runType}</TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell>{run.summary?.lastAgentName ?? "—"}</TableCell>
                    <TableCell>
                      {run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : "—"}
                    </TableCell>
                    <TableCell>{formatNumber(run.summary?.evidenceCount ?? 0)}</TableCell>
                    <TableCell>
                      {typeof run.summary?.confidence === "number"
                        ? `${Math.round(run.summary.confidence * 100)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeAgo(run.startedAt)}
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
          <p className="text-muted-foreground">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
}

type RunsPageProps = {
  initialRuns?: WorkflowRun[];
  initialDashboard?: RunDashboardPayload;
  initialActiveTab?: RunsPageTab;
};

function RunsPageContent({
  initialRuns = [],
  initialDashboard,
  initialActiveTab = "history",
}: RunsPageProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<RunsPageTab>(initialActiveTab);

  const handleTabChange = (value: string) => {
    const nextTab = (value as RunsPageTab) === "intelligence" ? "intelligence" : "history";
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams();
    if (nextTab === "history") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", nextTab);
    }
    const query = nextParams.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };

  return (
    <DashboardShell>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <RunsHistoryTab initialRuns={initialRuns} />
        </TabsContent>
        <TabsContent value="intelligence">
          <RunIntelligenceTab initialDashboard={initialDashboard} />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}

export default function RunsPage({
  initialRuns = [],
  initialDashboard,
  initialActiveTab = "history",
}: RunsPageProps) {
  return (
    <RunsPageContent
      initialRuns={initialRuns}
      initialDashboard={initialDashboard}
      initialActiveTab={initialActiveTab}
    />
  );
}
