"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  FileText,
  Loader2,
  Plus,
  Presentation,
  ClipboardCheck,
  BookOpen,
  Eye,
  Package,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const artifactTypeLabels: Record<string, string> = {
  TRIAGE_PDF: "Triage Report",
  SUBMISSION_CHECKLIST_PDF: "Submission Checklist",
  HEARING_DECK_PPTX: "Hearing Deck",
  IC_DECK_PPTX: "IC Deck",
  EXIT_PACKAGE_PDF: "Exit Package",
  BUYER_TEASER_PDF: "Buyer Teaser",
  INVESTMENT_MEMO_PDF: "Investment Memo",
  OFFERING_MEMO_PDF: "Offering Memorandum",
  COMP_ANALYSIS_PDF: "Comparative Analysis",
};

const artifactTypeConfig: Record<string, { icon: React.ElementType; bg: string; iconColor: string }> = {
  TRIAGE_PDF: { icon: FileText, bg: "bg-blue-500/10 dark:bg-blue-500/15", iconColor: "text-blue-600 dark:text-blue-400" },
  SUBMISSION_CHECKLIST_PDF: { icon: ClipboardCheck, bg: "bg-emerald-500/10 dark:bg-emerald-500/15", iconColor: "text-emerald-600 dark:text-emerald-400" },
  HEARING_DECK_PPTX: { icon: Presentation, bg: "bg-purple-500/10 dark:bg-purple-500/15", iconColor: "text-purple-600 dark:text-purple-400" },
  IC_DECK_PPTX: { icon: Presentation, bg: "bg-purple-500/10 dark:bg-purple-500/15", iconColor: "text-purple-600 dark:text-purple-400" },
  EXIT_PACKAGE_PDF: { icon: FileText, bg: "bg-slate-500/10 dark:bg-slate-500/15", iconColor: "text-slate-600 dark:text-slate-400" },
  BUYER_TEASER_PDF: { icon: Eye, bg: "bg-amber-500/10 dark:bg-amber-500/15", iconColor: "text-amber-600 dark:text-amber-400" },
  INVESTMENT_MEMO_PDF: { icon: BookOpen, bg: "bg-indigo-500/10 dark:bg-indigo-500/15", iconColor: "text-indigo-600 dark:text-indigo-400" },
  OFFERING_MEMO_PDF: { icon: BookOpen, bg: "bg-indigo-500/10 dark:bg-indigo-500/15", iconColor: "text-indigo-600 dark:text-indigo-400" },
  COMP_ANALYSIS_PDF: { icon: FileText, bg: "bg-cyan-500/10 dark:bg-cyan-500/15", iconColor: "text-cyan-600 dark:text-cyan-400" },
};

function getArtifactConfig(type: string) {
  return artifactTypeConfig[type] ?? { icon: FileText, bg: "bg-slate-500/10", iconColor: "text-slate-500" };
}

// Deal statuses ordered by progression
const STATUS_ORDER = [
  "INTAKE",
  "TRIAGE_DONE",
  "PREAPP",
  "CONCEPT",
  "NEIGHBORS",
  "SUBMITTED",
  "HEARING",
  "APPROVED",
  "EXIT_MARKETED",
  "EXITED",
  "KILLED",
];

const STAGE_PREREQUISITES: Record<string, string> = {
  TRIAGE_PDF: "TRIAGE_DONE",
  SUBMISSION_CHECKLIST_PDF: "PREAPP",
  HEARING_DECK_PPTX: "SUBMITTED",
  IC_DECK_PPTX: "TRIAGE_DONE",
  EXIT_PACKAGE_PDF: "APPROVED",
  BUYER_TEASER_PDF: "EXIT_MARKETED",
  INVESTMENT_MEMO_PDF: "TRIAGE_DONE",
  OFFERING_MEMO_PDF: "APPROVED",
  COMP_ANALYSIS_PDF: "TRIAGE_DONE",
};

function isAtOrPast(current: string, required: string): boolean {
  const ci = STATUS_ORDER.indexOf(current);
  const ri = STATUS_ORDER.indexOf(required);
  if (ci < 0) return false;
  return ci >= ri;
}

export interface ArtifactItem {
  id: string;
  artifactType: string;
  version: number;
  storageObjectKey: string;
  createdAt: string;
}

interface ArtifactListProps {
  artifacts: ArtifactItem[];
  dealId?: string;
  dealStatus?: string;
  onArtifactGenerated?: (artifact: ArtifactItem) => void;
}

export function ArtifactList({ artifacts, dealId, dealStatus, onArtifactGenerated }: ArtifactListProps) {
  const [generating, setGenerating] = useState<string | null>(null);

  const availableTypes = dealStatus
    ? Object.entries(STAGE_PREREQUISITES)
        .filter(([, required]) => isAtOrPast(dealStatus, required))
        .map(([type]) => type)
    : [];

  const handleGenerate = async (artifactType: string) => {
    if (!dealId) return;
    setGenerating(artifactType);
    try {
      const res = await fetch(`/api/deals/${dealId}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactType }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate artifact");
      }
      const data = await res.json();
      toast.success(`${artifactTypeLabels[artifactType] ?? artifactType} generated`);
      onArtifactGenerated?.(data.artifact);
    } catch (error) {
      console.error("Artifact generation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate artifact");
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-3">
      {dealId && dealStatus && availableTypes.length > 0 && (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={generating !== null} className="gap-1.5">
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {generating ? `Generating ${artifactTypeLabels[generating] ?? ""}...` : "Generate"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {availableTypes.map((type) => (
                <DropdownMenuItem
                  key={type}
                  onClick={() => handleGenerate(type)}
                  disabled={generating !== null}
                >
                  {artifactTypeLabels[type] ?? type}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {artifacts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-mono text-sm font-medium text-foreground">No artifacts yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Artifacts unlock as your deal progresses through stages.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {artifacts.map((artifact) => {
            const config = getArtifactConfig(artifact.artifactType);
            const ArtifactIcon = config.icon;
            const isGenerating = generating === artifact.artifactType;

            return (
              <div
                key={artifact.id}
                className={cn(
                  "flex items-center gap-4 rounded-lg border p-4 transition-all hover:-translate-y-px hover:shadow-md",
                  isGenerating && "animate-pulse border-amber-500/30",
                )}
              >
                {/* Type icon */}
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", config.bg)}>
                  <ArtifactIcon className={cn("h-5 w-5", config.iconColor)} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {artifactTypeLabels[artifact.artifactType] ?? artifact.artifactType}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    v{artifact.version} · {formatDate(artifact.createdAt)}
                  </p>
                </div>

                {/* Version badge + download */}
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    v{artifact.version}
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
                    <a
                      href={`/api/deals/artifacts/${artifact.id}/download`}
                      download
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
