"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[map] route error", error);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-paper">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="mt-3 text-xl font-semibold">Failed to load map</h2>
      <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
        {error.message}
      </p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
