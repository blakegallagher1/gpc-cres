"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";

const artifactTypeLabels: Record<string, string> = {
  TRIAGE_PDF: "Triage Report",
  SUBMISSION_CHECKLIST_PDF: "Submission Checklist",
  HEARING_DECK_PPTX: "Hearing Deck",
  EXIT_PACKAGE_PDF: "Exit Package",
  BUYER_TEASER_PDF: "Buyer Teaser",
};

export interface ArtifactItem {
  id: string;
  artifactType: string;
  version: number;
  storageObjectKey: string;
  createdAt: string;
}

interface ArtifactListProps {
  artifacts: ArtifactItem[];
}

export function ArtifactList({ artifacts }: ArtifactListProps) {
  if (artifacts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No artifacts generated yet. Run triage or generate documents to see them here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {artifacts.map((artifact) => (
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
      ))}
    </div>
  );
}
