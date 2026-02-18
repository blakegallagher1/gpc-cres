import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <DashboardShell>
      <div className="space-y-4 p-6">
        <div className="flex gap-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-40" />
          </div>
          <div className="overflow-hidden rounded-md border">
            <div className="divide-y">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="grid grid-cols-7 gap-4 px-4 py-3">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-8" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

