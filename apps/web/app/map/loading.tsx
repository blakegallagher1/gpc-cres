import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <DashboardShell>
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-6 w-80" />
        <Skeleton className="h-[calc(100vh-14rem)] w-full rounded-lg" />
      </div>
    </DashboardShell>
  );
}

