"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bot,
  Search,
  Wrench,
  GitBranch,
  Play,
  Settings,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/utils";
import { useAgentStore } from "@/stores/agentStore";
import { toast } from "sonner";
import { useAgents } from "@/lib/hooks/useAgents";

export default function AgentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [runInput, setRunInput] = useState("");
  const { runAgent, isLoading } = useAgentStore();
  const { agents, isLoading: agentsLoading } = useAgents();

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesModel =
      modelFilter === "all" || agent.model === modelFilter;
    const matchesStatus =
      statusFilter === "all" || agent.status === statusFilter;
    return matchesSearch && matchesModel && matchesStatus;
  });

  const handleRunAgent = async () => {
    if (!selectedAgentId || !runInput.trim()) return;

    try {
      await runAgent(selectedAgentId, { query: runInput });
      toast.success("Agent started successfully");
      setRunInput("");
      setSelectedAgentId(null);
    } catch {
      toast.error("Failed to run agent");
    }
  };

  const openRunDialog = (agentId: string) => {
    setSelectedAgentId(agentId);
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Agent Library</h1>
            <p className="text-muted-foreground">
              {agentsLoading ? "Loading agents..." : `${agents.length} specialized agents available`}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={modelFilter} onValueChange={setModelFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Models</SelectItem>
              <SelectItem value="gpt-5.2">GPT-5.2</SelectItem>
              <SelectItem value="gpt-5.1">GPT-5.1</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="idle">Idle</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Agent Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {filteredAgents.map((agent) => (
            <Card
              key={agent.id}
              className="group transition-all hover:border-primary/50 hover:shadow-md"
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${agent.color}20` }}
                    >
                      <Bot
                        className="h-7 w-7"
                        style={{ color: agent.color }}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold">
                        {agent.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {agent.model}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={agent.status === "active" ? "default" : "secondary"}
                    className={
                      agent.status === "active"
                        ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                        : ""
                    }
                  >
                    {agent.status === "active" ? "Active" : "Idle"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {agent.description}
                </p>

                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Wrench className="h-4 w-4" />
                    <span>{agent.tools.length} tools</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <GitBranch className="h-4 w-4" />
                    <span>{agent.handoffs.length} handoffs</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Play className="h-4 w-4" />
                    <span>{formatNumber(agent.run_count)} runs</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        className="flex-1"
                        onClick={() => openRunDialog(agent.id)}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Run Agent
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Run {agent.name}</DialogTitle>
                        <DialogDescription>
                          Enter your query or task for the agent to process.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="input">Input</Label>
                          <Textarea
                            id="input"
                            placeholder="Enter your query..."
                            value={runInput}
                            onChange={(e) => setRunInput(e.target.value)}
                            rows={4}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button
                          onClick={handleRunAgent}
                          disabled={!runInput.trim() || isLoading}
                        >
                          {isLoading ? "Running..." : "Run Agent"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Link href={`/agents/${agent.id}`}>
                    <Button variant="outline">
                      <Settings className="mr-2 h-4 w-4" />
                      Configure
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No agents found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
