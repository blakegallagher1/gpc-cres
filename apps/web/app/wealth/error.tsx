"use client";

import { AlertTriangle } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[wealth] route error", error);

  return (
    <DashboardShell>
      <div className="space-y-3 py-16 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-semibold">Failed to load wealth</h2>
        <p className="mx-auto max-w-lg text-sm text-muted-foreground">
          {error.message}
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </DashboardShell>
  );
}

