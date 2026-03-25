import { Suspense } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DealDetailPageClient } from "./DealDetailPageClient";

function DealDetailPageFallback() {
  return (
    <DashboardShell>
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading deal workspace...
      </div>
    </DashboardShell>
  );
}

export default function DealDetailPage() {
  return (
    <Suspense fallback={<DealDetailPageFallback />}>
      <DealDetailPageClient />
    </Suspense>
  );
}
