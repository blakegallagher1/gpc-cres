"use client";

import { useState } from "react";
import { Play, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface RunTriageButtonProps {
  dealId: string;
  hasParcels: boolean;
  onComplete: (result: { triage: Record<string, unknown>; sources: { url: string; title?: string }[] }) => void;
}

export function RunTriageButton({ dealId, hasParcels, onComplete }: RunTriageButtonProps) {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");

  const runTriage = async () => {
    setStatus("running");
    try {
      const res = await fetch(`/api/deals/${dealId}/triage`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Triage failed");
      }

      const data = await res.json();
      setStatus("done");
      onComplete({ triage: data.triage, sources: data.sources || [] });
      toast.success(`Triage complete: ${data.triage.decision}`);
    } catch (error) {
      setStatus("idle");
      console.error("Triage error:", error);
      toast.error(error instanceof Error ? error.message : "Triage failed");
    }
  };

  return (
    <Button
      onClick={runTriage}
      disabled={!hasParcels || status === "running"}
      variant={status === "done" ? "outline" : "default"}
      size="sm"
      className="gap-1.5"
      title={!hasParcels ? "Add parcels first" : undefined}
    >
      {status === "running" ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Running Triage...
        </>
      ) : status === "done" ? (
        <>
          <CheckCircle2 className="h-4 w-4" />
          Re-run Triage
        </>
      ) : (
        <>
          <Play className="h-4 w-4" />
          Run Triage
        </>
      )}
    </Button>
  );
}
