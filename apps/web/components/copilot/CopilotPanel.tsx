"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  FileText,
  ListChecks,
  Loader2,
  Send,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { streamAgentRun } from "@/lib/agentStream";

const DEFAULT_ACTIONS = [
  {
    id: "underwrite",
    label: "Run Full Underwriting",
    description: "NOI, DSCR, IRR, sensitivities",
    agent: "finance",
    prompt:
      "Run a full underwriting summary with NOI, DSCR, IRR, debt sizing, and key risks.",
    icon: Zap,
  },
  {
    id: "loi",
    label: "Generate LOI Draft",
    description: "IC-ready LOI terms",
    agent: "legal",
    prompt:
      "Draft a concise LOI with price, diligence timeline, closing terms, and contingencies.",
    icon: FileText,
  },
  {
    id: "comps",
    label: "Summarize Comps",
    description: "Closest sales + pricing context",
    agent: "research",
    prompt:
      "Summarize the top comps with pricing, cap rates, and supporting rationale.",
    icon: Sparkles,
  },
  {
    id: "dd",
    label: "Create DD Checklist",
    description: "Phase-based checklist",
    agent: "operations",
    prompt:
      "Create a due diligence checklist with owners, SLAs, and dependencies.",
    icon: ListChecks,
  },
];

function extractProjectId(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const dealRoomIndex = segments.indexOf("deal-room");
  if (dealRoomIndex >= 0 && segments[dealRoomIndex + 1]) {
    return segments[dealRoomIndex + 1];
  }
  return null;
}

export function CopilotPanel() {
  const { copilotOpen, toggleCopilot } = useUIStore();
  const pathname = usePathname();
  const projectId = useMemo(() => pathname ? extractProjectId(pathname) : null, [pathname]);
  const [selectedAction, setSelectedAction] = useState(DEFAULT_ACTIONS[0]);
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    const query = prompt.trim() || selectedAction.prompt;
    if (!query) return;

    setStreaming(true);
    setOutput("");
    setError(null);

    await streamAgentRun({
      apiBaseUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
      agentName: selectedAction.agent,
      query,
      projectId,
      onChunk: (chunk) => {
        if (chunk.event === "chunk" && typeof chunk.data.content === "string") {
          setOutput((prev) => `${prev}${chunk.data.content}`);
        }
        if (chunk.event === "complete") {
          setStreaming(false);
        }
      },
      onError: (err) => {
        setStreaming(false);
        setError(err.message);
      },
    });
  };

  return (
    <aside
      className={cn(
        "fixed right-0 top-16 z-40 h-[calc(100vh-4rem)] w-[360px] border-l bg-background/95 shadow-xl transition-transform duration-300",
        copilotOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Copilot</p>
              <p className="text-xs text-muted-foreground">Page-aware sidekick</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCopilot}
            aria-label="Close Copilot"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-2">
            {DEFAULT_ACTIONS.map((action) => {
              const Icon = action.icon;
              const active = action.id === selectedAction.id;
              return (
                <Button
                  key={action.id}
                  variant={active ? "secondary" : "ghost"}
                  className="justify-start gap-3"
                  onClick={() => setSelectedAction(action)}
                >
                  <Icon className="h-4 w-4" />
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium">{action.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {action.description}
                    </span>
                  </div>
                </Button>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Live Output</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedAction.agent}</Badge>
                {projectId && (
                  <Badge variant="outline">Project {projectId.slice(0, 6)}</Badge>
                )}
              </div>
              <div className="min-h-[120px] whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                {output || "Run a command to see streaming output."}
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </CardContent>
          </Card>
        </div>

        <div className="border-t p-4">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask the copilot to refine, draft, or analyze..."
            className="min-h-[90px] resize-none"
          />
          <Button
            className="mt-3 w-full gap-2"
            onClick={handleRun}
            disabled={streaming}
          >
            {streaming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Streaming
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Run Copilot
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
