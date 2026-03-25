import { Suspense } from "react";
import { connection } from "next/server";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AutomationPageClient } from "./AutomationPageClient";

function AutomationPageFallback() {
  return (
    <DashboardShell>
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        Loading automation dashboard...
      </div>
    </DashboardShell>
  );
}

export default async function AutomationPage() {
  await connection();

  return (
    <Suspense fallback={<AutomationPageFallback />}>
      <AutomationPageClient />
    </Suspense>
  );
}
