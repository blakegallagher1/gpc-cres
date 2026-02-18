import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <DashboardShell>
      <div className="space-y-5 p-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-80 w-full" />
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </DashboardShell>
  );
}

