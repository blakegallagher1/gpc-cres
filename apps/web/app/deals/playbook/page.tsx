import { ChevronLeft, FileText, Search } from "lucide-react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DealsPlaybookPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Screening Playbook</h1>
            <p className="text-sm text-muted-foreground">
              Apply standardized triage logic before advancing each deal.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/deals?view=triage">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to Triage Queue
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Import parcels and run ingestion + enrichment.</li>
              <li>Execute triage and review the recommendation.</li>
              <li>
                For ADVANCE, proceed with valuation, entitlement strategy, and
                financing preparation.
              </li>
              <li>
                For HOLD, apply required conditions then rerun triage after
                remediation.
              </li>
              <li>
                For KILL, document the blockers and archive outreach tasks.
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" />
              Confirm parcel geometry and acreage match legal survey.
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" />
              Confirm parish pack coverage and key constraints.
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" />
              Confirm first-pass diligence task plan before owner outreach.
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" />
              Review risk flags and confidence confidence thresholds before move-forward.
            </label>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
