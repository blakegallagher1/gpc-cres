"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type AdminTabNoticeProps = {
  hasData: boolean;
  onRetry: () => void;
};

/** Shared retry/fallback notice for admin tabs during fetch failures. */
export function AdminTabNotice({ hasData, onRetry }: AdminTabNoticeProps) {
  return (
    <div
      className={
        hasData
          ? "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          : "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-4 text-sm text-destructive"
      }
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        <span>
          {hasData
            ? "Showing the last successful snapshot while this section retries."
            : "This section is temporarily unavailable."}
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
