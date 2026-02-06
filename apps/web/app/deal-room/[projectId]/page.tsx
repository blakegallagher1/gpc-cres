"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  Download,
  Gauge,
  Loader2,
  MessageCircle,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CollaborativeMemo } from "@/components/deal-room/CollaborativeMemo";
import { supabase } from "@/lib/db/supabase";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { streamAgentRun } from "@/lib/agentStream";
import {
  Citation,
  DealRoom,
  DealRoomArtifact,
  DealRoomEvent,
  DealRoomMessage,
  ExportJob,
  IngestionJob,
  Project,
  Scenario,
  ScenarioRun,
  Task,
} from "@/types";

const SWIMLANES = [
  "Intake",
  "Underwrite",
  "DD",
  "Legal",
  "Design",
  "Marketing",
];

const DEFAULT_BASE_ASSUMPTIONS = {
  noi: 1250000,
  exit_cap_rate: 0.058,
  debt_rate: 0.055,
  ltc: 0.65,
  opex_ratio: 0.35,
  cash_flows: [-5000000, 520000, 560000, 610000, 680000, 6200000],
};

const DEFAULT_SLIDERS = {
  rentGrowth: 0.03,
  exitCapRate: 0.058,
  debtRate: 0.055,
  ltc: 0.65,
  opexRatio: 0.35,
};

const EXPORT_TYPES = [
  { id: "memo", label: "Investment Memo" },
  { id: "ic_deck", label: "IC Deck" },
  { id: "underwriting_packet", label: "Underwriting Packet" },
  { id: "dd_report", label: "DD Report" },
];

function calculateIRR(cashFlows: number[]) {
  let rate = 0.12;
  for (let i = 0; i < 40; i += 1) {
    let npv = 0;
    let derivative = 0;
    cashFlows.forEach((cf, index) => {
      const factor = Math.pow(1 + rate, index);
      npv += cf / factor;
      derivative -= (index * cf) / (factor * (1 + rate));
    });
    if (Math.abs(derivative) < 1e-6) break;
    const nextRate = rate - npv / derivative;
    if (Math.abs(nextRate - rate) < 1e-6) {
      rate = nextRate;
      break;
    }
    rate = nextRate;
  }
  return Number.isFinite(rate) ? rate : 0;
}

function computeScenario(
  baseAssumptions: typeof DEFAULT_BASE_ASSUMPTIONS,
  sliders: typeof DEFAULT_SLIDERS
) {
  const noi = baseAssumptions.noi * (1 + sliders.rentGrowth);
  const propertyValue = noi / sliders.exitCapRate;
  const loanAmount = propertyValue * sliders.ltc;
  const debtService = loanAmount * sliders.debtRate;
  const cashFlows = (baseAssumptions.cash_flows || []).map((cf, idx) =>
    idx === 0 ? cf : cf * (1 + sliders.rentGrowth)
  );
  const irr = calculateIRR(cashFlows);
  const dscr = debtService > 0 ? noi / debtService : 0;

  return {
    noi,
    propertyValue,
    debtService,
    irr,
    dscr,
  };
}

export default function DealRoomPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId
    ? (Array.isArray(params.projectId) ? params.projectId[0] : params.projectId)
    : undefined;

  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<DealRoom | null>(null);
  const [messages, setMessages] = useState<DealRoomMessage[]>([]);
  const [events, setEvents] = useState<DealRoomEvent[]>([]);
  const [artifacts, setArtifacts] = useState<DealRoomArtifact[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [scenarioRuns, setScenarioRuns] = useState<ScenarioRun[]>([]);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [ingestionJobs, setIngestionJobs] = useState<IngestionJob[]>([]);
  const [memoContent, setMemoContent] = useState("");
  const [memoArtifactId, setMemoArtifactId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [newTask, setNewTask] = useState("");
  const [selectedSwimlane, setSelectedSwimlane] = useState(SWIMLANES[0]);
  const [agentStreaming, setAgentStreaming] = useState(false);
  const [agentOutput, setAgentOutput] = useState("");
  const [baseAssumptions, setBaseAssumptions] = useState(DEFAULT_BASE_ASSUMPTIONS);
  const [sliders, setSliders] = useState(DEFAULT_SLIDERS);

  const baseResults = useMemo(
    () => computeScenario(baseAssumptions, { ...sliders, rentGrowth: 0 }),
    [baseAssumptions, sliders]
  );
  const scenarioResults = useMemo(
    () => computeScenario(baseAssumptions, sliders),
    [baseAssumptions, sliders]
  );

  const scenarioDelta = {
    irr: scenarioResults.irr - baseResults.irr,
    dscr: scenarioResults.dscr - baseResults.dscr,
    propertyValue: scenarioResults.propertyValue - baseResults.propertyValue,
  };

  const tasksBySwimlane = useMemo(() => {
    return SWIMLANES.reduce<Record<string, Task[]>>((acc, lane) => {
      acc[lane] = tasks.filter((task) => (task.swimlane || "Intake") === lane);
      return acc;
    }, {});
  }, [tasks]);

  const completedTasks = tasks.filter((task) => task.status === "completed");
  const progress = tasks.length ? completedTasks.length / tasks.length : 0;
  const dealHealth = Math.round(
    Math.min(
      100,
      progress * 60 + (scenarioResults.dscr > 1.2 ? 20 : 10) +
        (scenarioResults.irr > 0.15 ? 20 : 10)
    )
  );

  const badgeUnlocks = [
    {
      label: "First Export",
      unlocked: exportJobs.some((job) => job.status === "complete"),
    },
    {
      label: "5 Agent Updates",
      unlocked: messages.filter((msg) => msg.sender_type === "agent").length >= 5,
    },
    {
      label: "Scenario Sprint",
      unlocked: scenarioRuns.length >= 3,
    },
  ];

  useEffect(() => {
    if (!projectId) return;

    const loadDealRoom = async () => {
      const { data: projectRecord } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      if (projectRecord) setProject(projectRecord as Project);

      const { data: roomRecord } = await supabase
        .from("deal_rooms")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();

      let activeRoom = roomRecord as DealRoom | null;
      if (!activeRoom) {
        const { data: newRoom } = await supabase
          .from("deal_rooms")
          .insert({ project_id: projectId, name: "Deal Room", status: "active" })
          .select("*")
          .single();
        activeRoom = newRoom as DealRoom;
      }

      if (!activeRoom) return;
      setRoom(activeRoom);

      const [messagesRes, eventsRes, artifactsRes, tasksRes, citationsRes] =
        await Promise.all([
          supabase
            .from("deal_room_messages")
            .select("*")
            .eq("room_id", activeRoom.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("deal_room_events")
            .select("*")
            .eq("room_id", activeRoom.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("deal_room_artifacts")
            .select("*")
            .eq("room_id", activeRoom.id),
          supabase
            .from("tasks")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),
          supabase
            .from("citations")
            .select("*")
            .eq("project_id", projectId)
            .order("accessed_at", { ascending: false }),
        ]);

      setMessages((messagesRes.data as DealRoomMessage[]) || []);
      setEvents((eventsRes.data as DealRoomEvent[]) || []);
      setArtifacts((artifactsRes.data as DealRoomArtifact[]) || []);
      setTasks((tasksRes.data as Task[]) || []);
      setCitations((citationsRes.data as Citation[]) || []);

      const { data: scenarioRecord } = await supabase
        .from("scenarios")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();

      let activeScenario = scenarioRecord as Scenario | null;
      if (!activeScenario) {
        const { data: newScenario } = await supabase
          .from("scenarios")
          .insert({ project_id: projectId, base_assumptions: baseAssumptions })
          .select("*")
          .single();
        activeScenario = newScenario as Scenario;
      }

      if (activeScenario) {
        setScenario(activeScenario);
        if (activeScenario.base_assumptions) {
          setBaseAssumptions({
            ...DEFAULT_BASE_ASSUMPTIONS,
            ...(activeScenario.base_assumptions as Record<string, number>),
          });
        }
        const { data: runs } = await supabase
          .from("scenario_runs")
          .select("*")
          .eq("scenario_id", activeScenario.id)
          .order("created_at", { ascending: false });
        setScenarioRuns((runs as ScenarioRun[]) || []);
      }

      const { data: exportRecords } = await supabase
        .from("export_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      setExportJobs((exportRecords as ExportJob[]) || []);

      const { data: ingestionRecords } = await supabase
        .from("ingestion_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      setIngestionJobs((ingestionRecords as IngestionJob[]) || []);
    };

    loadDealRoom();
  }, [projectId]);

  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`deal-room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "deal_room_messages",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as DealRoomMessage]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "deal_room_events",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          setEvents((prev) => [payload.new as DealRoomEvent, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${room.project_id}`,
        },
        (payload) => {
          setTasks((prev) => [payload.new as Task, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scenario_runs",
        },
        (payload) => {
          setScenarioRuns((prev) => [payload.new as ScenarioRun, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "export_jobs",
          filter: `project_id=eq.${room.project_id}`,
        },
        (payload) => {
          setExportJobs((prev) => [payload.new as ExportJob, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ingestion_jobs",
          filter: `project_id=eq.${room.project_id}`,
        },
        (payload) => {
          setIngestionJobs((prev) => [payload.new as IngestionJob, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room]);

  useEffect(() => {
    if (!room) return;

    const memoArtifact = artifacts.find((artifact) => artifact.type === "memo");
    const loadMemo = async () => {
      let memo = memoArtifact;
      if (!memo) {
        const { data: created } = await supabase
          .from("deal_room_artifacts")
          .insert({ room_id: room.id, type: "memo", title: "Live Memo" })
          .select("*")
          .single();
        memo = created as DealRoomArtifact;
      }

      if (!memo) return;
      setMemoArtifactId(memo.id);

      const { data: versions } = await supabase
        .from("deal_room_artifact_versions")
        .select("*")
        .eq("artifact_id", memo.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (versions && versions.length > 0) {
        setMemoContent((versions[0] as { content_md?: string }).content_md || "");
      }
    };

    loadMemo();
  }, [artifacts, room]);

  const handleSendMessage = async () => {
    if (!room || !newMessage.trim()) return;
    const { error } = await supabase.from("deal_room_messages").insert({
      room_id: room.id,
      sender_type: "user",
      content_md: newMessage.trim(),
    });

    if (error) {
      toast.error("Failed to send message");
      return;
    }
    setNewMessage("");
  };

  const handleRunAgentUpdate = async () => {
    if (!room) return;
    setAgentStreaming(true);
    setAgentOutput("");
    await streamAgentRun({
      apiBaseUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
      agentName: "finance",
      query: "Provide a deal room update with underwriting highlights and next steps.",
      projectId: room.project_id,
      onChunk: (chunk) => {
        if (chunk.event === "chunk" && typeof chunk.data.content === "string") {
          setAgentOutput((prev) => `${prev}${chunk.data.content}`);
        }
        if (chunk.event === "complete") {
          setAgentStreaming(false);
        }
      },
      onError: () => {
        setAgentStreaming(false);
        toast.error("Agent stream failed");
      },
    });

    if (agentOutput.trim()) {
      await supabase.from("deal_room_messages").insert({
        room_id: room.id,
        sender_type: "agent",
        content_md: agentOutput,
      });
    }
  };

  const handleSaveMemo = async () => {
    if (!room || !memoArtifactId) return;

    const { data: version, error } = await supabase
      .from("deal_room_artifact_versions")
      .insert({
        artifact_id: memoArtifactId,
        content_md: memoContent,
        content_json: {},
      })
      .select("*")
      .single();

    if (error || !version) {
      toast.error("Failed to save memo version");
      return;
    }

    await supabase
      .from("deal_room_artifacts")
      .update({ current_version_id: version.id })
      .eq("id", memoArtifactId);

    await supabase.from("deal_room_events").insert({
      room_id: room.id,
      event_type: "artifact_update",
      payload: { artifact_id: memoArtifactId, version_id: version.id },
    });

    toast.success("Memo version saved");
  };

  const handleAddTask = async () => {
    if (!projectId || !newTask.trim()) return;

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        title: newTask,
        swimlane: selectedSwimlane,
        status: "pending",
        priority: "medium",
        agent_generated: false,
      })
      .select("*")
      .single();

    if (error || !task) {
      toast.error("Failed to add task");
      return;
    }

    if (room) {
      await supabase.from("deal_room_events").insert({
        room_id: room.id,
        event_type: "task_created",
        payload: { task_id: task.id, swimlane: selectedSwimlane },
      });
    }

    setNewTask("");
  };

  const handleScenarioSave = async () => {
    if (!scenario) return;

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/scenarios/run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenario.id,
          base_assumptions: baseAssumptions,
          delta_assumptions: {
            rent_growth: sliders.rentGrowth,
            exit_cap_rate: sliders.exitCapRate,
            debt_rate: sliders.debtRate,
            ltc: sliders.ltc,
            opex_ratio: sliders.opexRatio,
          },
        }),
      }
    );

    if (!response.ok) {
      toast.error("Failed to save scenario run");
      return;
    }

    toast.success("Scenario run saved");
  };

  const handleExport = async (type: string) => {
    if (!room) return;

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/exports`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: room.project_id,
          room_id: room.id,
          type,
          payload: {},
        }),
      }
    );

    if (!response.ok) {
      toast.error("Failed to create export job");
      return;
    }

    toast.success("Export queued");
  };

  const handleUpload = async (file?: File) => {
    if (!file || !room) return;

    const storagePath = `${room.project_id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("deal-room-uploads")
      .upload(storagePath, file, { upsert: true });

    if (uploadError) {
      toast.error("Upload failed");
      return;
    }

    const { data: publicUrl } = supabase.storage
      .from("deal-room-uploads")
      .getPublicUrl(storagePath);

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/ingestion/upload`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: room.project_id,
          document_type: "offering_memorandum",
          file_name: file.name,
          file_path: storagePath,
          storage_path: storagePath,
          storage_url: publicUrl.publicUrl,
          mime_type: file.type,
        }),
      }
    );

    if (!response.ok) {
      toast.error("Failed to register document");
      return;
    }

    const payload = (await response.json()) as { document?: { id?: string } };
    const documentId = payload.document?.id;
    if (documentId) {
      await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/ingestion/process/${documentId}`,
        { method: "POST" }
      );
      toast.success("Ingestion started");
    }
  };

  if (!projectId) {
    return (
      <DashboardShell>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Missing project ID.
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{project?.name || "Deal Room"}</h1>
            <p className="text-sm text-muted-foreground">
              Multimodal collaboration for underwriting, DD, and investor packaging.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {room ? "Live" : "Initializing"}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Gauge className="h-3 w-3" />
              Deal Health {dealHealth}%
            </Badge>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1.4fr_1.05fr]">
          {/* Left column */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Deal Room Chat</CardTitle>
                <Button size="sm" variant="secondary" onClick={handleRunAgentUpdate}>
                  {agentStreaming ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Streaming
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-3 w-3" />
                      Agent Update
                    </>
                  )}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-[260px] rounded-lg border">
                  <div className="space-y-3 p-3 text-sm">
                    {messages.length === 0 ? (
                      <p className="text-muted-foreground">
                        Start the conversation to capture deal context.
                      </p>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className="rounded-lg border bg-muted/20 p-3"
                        >
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <MessageCircle className="h-3 w-3" />
                            {message.sender_type}
                            <span>·</span>
                            {timeAgo(message.created_at)}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm">
                            {message.content_md}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                {agentOutput && (
                  <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                    {agentOutput}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(event) => setNewMessage(event.target.value)}
                    placeholder="Drop a note or request an update..."
                  />
                  <Button onClick={handleSendMessage}>Send</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Workstreams</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={newTask}
                    onChange={(event) => setNewTask(event.target.value)}
                    placeholder="New task"
                  />
                  <select
                    value={selectedSwimlane}
                    onChange={(event) => setSelectedSwimlane(event.target.value)}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {SWIMLANES.map((lane) => (
                      <option key={lane} value={lane}>
                        {lane}
                      </option>
                    ))}
                  </select>
                  <Button onClick={handleAddTask}>Add</Button>
                </div>
                <div className="grid gap-3">
                  {SWIMLANES.map((lane) => (
                    <div key={lane} className="rounded-lg border p-3">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-semibold">{lane}</span>
                        <Badge variant="secondary">
                          {tasksBySwimlane[lane]?.length || 0}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-xs text-muted-foreground">
                        {tasksBySwimlane[lane]?.length ? (
                          tasksBySwimlane[lane].map((task) => (
                            <div
                              key={task.id}
                              className="rounded-md border bg-muted/20 p-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-foreground">
                                  {task.title}
                                </span>
                                <Badge variant="outline">{task.status}</Badge>
                              </div>
                              {task.description && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {task.description}
                                </p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p>No tasks yet.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Center column */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Live Memo</CardTitle>
                <Button size="sm" variant="secondary" onClick={handleSaveMemo}>
                  Save Version
                </Button>
              </CardHeader>
              <CardContent>
                {room && memoArtifactId ? (
                  <CollaborativeMemo
                    roomId={room.id}
                    artifactId={memoArtifactId}
                    initialContent={memoContent}
                    onContentChange={setMemoContent}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Initializing memo...
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scenario Sandbox</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Rent Growth: {(sliders.rentGrowth * 100).toFixed(1)}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={0.08}
                      step={0.005}
                      value={sliders.rentGrowth}
                      onChange={(event) =>
                        setSliders((prev) => ({
                          ...prev,
                          rentGrowth: Number(event.target.value),
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Exit Cap: {(sliders.exitCapRate * 100).toFixed(2)}%
                    </label>
                    <input
                      type="range"
                      min={0.045}
                      max={0.075}
                      step={0.0025}
                      value={sliders.exitCapRate}
                      onChange={(event) =>
                        setSliders((prev) => ({
                          ...prev,
                          exitCapRate: Number(event.target.value),
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Debt Rate: {(sliders.debtRate * 100).toFixed(2)}%
                    </label>
                    <input
                      type="range"
                      min={0.035}
                      max={0.08}
                      step={0.0025}
                      value={sliders.debtRate}
                      onChange={(event) =>
                        setSliders((prev) => ({
                          ...prev,
                          debtRate: Number(event.target.value),
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      LTC: {(sliders.ltc * 100).toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min={0.5}
                      max={0.8}
                      step={0.01}
                      value={sliders.ltc}
                      onChange={(event) =>
                        setSliders((prev) => ({
                          ...prev,
                          ltc: Number(event.target.value),
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-muted-foreground">
                      Opex Ratio: {(sliders.opexRatio * 100).toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min={0.25}
                      max={0.5}
                      step={0.01}
                      value={sliders.opexRatio}
                      onChange={(event) =>
                        setSliders((prev) => ({
                          ...prev,
                          opexRatio: Number(event.target.value),
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Card className="border-dashed">
                    <CardContent className="py-4">
                      <p className="text-xs text-muted-foreground">IRR</p>
                      <p className="text-lg font-semibold">
                        {(scenarioResults.irr * 100).toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Δ {(scenarioDelta.irr * 100).toFixed(1)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-dashed">
                    <CardContent className="py-4">
                      <p className="text-xs text-muted-foreground">DSCR</p>
                      <p className="text-lg font-semibold">
                        {scenarioResults.dscr.toFixed(2)}x
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Δ {scenarioDelta.dscr.toFixed(2)}x
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-dashed">
                    <CardContent className="py-4">
                      <p className="text-xs text-muted-foreground">Value</p>
                      <p className="text-lg font-semibold">
                        {formatCurrency(scenarioResults.propertyValue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Δ {formatCurrency(scenarioDelta.propertyValue)}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <Button className="w-full" onClick={handleScenarioSave}>
                  Save Scenario Run
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[240px]">
                  <div className="space-y-3 text-sm">
                    {events.length === 0 ? (
                      <p className="text-muted-foreground">
                        Timeline updates will appear here.
                      </p>
                    ) : (
                      events.map((event) => (
                        <div key={event.id} className="rounded-md border p-3">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {event.event_type}
                            <span>·</span>
                            {timeAgo(event.created_at)}
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Artifacts + Packaging</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {artifacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No artifacts yet.</p>
                  ) : (
                    artifacts.map((artifact) => (
                      <div
                        key={artifact.id}
                        className="flex items-center justify-between rounded-md border p-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{artifact.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {artifact.type}
                          </p>
                        </div>
                        <Badge variant="secondary">v{artifact.current_version_id ? "+" : "0"}</Badge>
                      </div>
                    ))
                  )}
                </div>
                <div className="grid gap-2">
                  {EXPORT_TYPES.map((exportType) => (
                    <Button
                      key={exportType.id}
                      variant="secondary"
                      onClick={() => handleExport(exportType.id)}
                      className="justify-start gap-2"
                    >
                      <Download className="h-4 w-4" />
                      {exportType.label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  {exportJobs.slice(0, 3).map((job) => (
                    <div key={job.id} className="flex items-center justify-between">
                      <span>{job.type}</span>
                      <Badge variant="outline">{job.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ingestion Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  <Upload className="h-5 w-5" />
                  Drag & drop or click to upload
                  <input
                    type="file"
                    className="hidden"
                    onChange={(event) => handleUpload(event.target.files?.[0])}
                  />
                </label>
                <div className="space-y-2 text-xs text-muted-foreground">
                  {ingestionJobs.slice(0, 3).map((job) => (
                    <div key={job.id} className="flex items-center justify-between">
                      <span>{job.status}</span>
                      <Badge variant="outline">{timeAgo(job.created_at)}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Citations + Traceability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {citations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Research citations will appear here.
                  </p>
                ) : (
                  citations.slice(0, 4).map((citation) => (
                    <div key={citation.id} className="rounded-md border p-2">
                      <p className="text-sm font-medium">
                        {citation.title || "Source"}
                      </p>
                      {citation.url && (
                        <p className="text-xs text-muted-foreground">{citation.url}</p>
                      )}
                      {citation.snippet && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {citation.snippet}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Momentum</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span>Workflow progress</span>
                    <span>{Math.round(progress * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  {badgeUnlocks.map((badge) => (
                    <div
                      key={badge.label}
                      className="flex items-center justify-between rounded-md border p-2 text-xs"
                    >
                      <span>{badge.label}</span>
                      <Badge variant={badge.unlocked ? "default" : "secondary"}>
                        {badge.unlocked ? "Unlocked" : "Locked"}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  {completedTasks.length} tasks completed this week
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
