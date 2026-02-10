"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, Loader2, Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

const artifactTypeLabels: Record<string, string> = {
  TRIAGE_PDF: "Triage Report",
  SUBMISSION_CHECKLIST_PDF: "Submission Checklist",
  HEARING_DECK_PPTX: "Hearing Deck",
  EXIT_PACKAGE_PDF: "Exit Package",
  BUYER_TEASER_PDF: "Buyer Teaser",
  INVESTMENT_MEMO_PDF: "Investment Memo",
  OFFERING_MEMO_PDF: "Offering Memorandum",
  COMP_ANALYSIS_PDF: "Comparative Analysis",
};

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
        <p className="py-8 text-center text-sm text-muted-foreground">
          No artifacts generated yet. Run triage or generate documents to see them here.
        </p>
      ) : (
        artifacts.map((artifact) => (
          <Card key={artifact.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {artifactTypeLabels[artifact.artifactType] ?? artifact.artifactType}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Version {artifact.version} -- {formatDate(artifact.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  v{artifact.version}
                </Badge>
                <Button variant="ghost" size="icon" asChild>
                  <a
                    href={`/api/deals/artifacts/${artifact.id}/download`}
                    download
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
