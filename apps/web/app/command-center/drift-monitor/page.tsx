"use client";

import useSWR from "swr";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Lock } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface DriftSegment {
  id: string;
  orgId: string;
  propertyType: string;
  sampleN: number;
  mae: number | null;
  variance: number | null;
}

export default function DriftMonitorPage() {
  const { data, isLoading } = useSWR<{ segments: DriftSegment[] }>(
    "/api/memory/events?type=segments",
    fetcher,
    { revalidateOnFocus: false },
  );

  const segments = data?.segments ?? [];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Drift Monitor
          </h1>
          <p className="text-sm text-muted-foreground">
            Calibration segment health — tracks MAE drift and freeze status.
            Segments freeze after 3 consecutive MAE worsenings.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Segments</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <div className="text-2xl font-bold">{segments.length}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Frozen</CardTitle>
              <Lock className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <div className="text-2xl font-bold text-red-600">
                  {/* Frozen count would come from drift_freeze_states — placeholder */}
                  0
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Calibration Segments</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : segments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No calibration segments found. Segments are created as outcome
                data is ingested.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Property Type</th>
                      <th className="pb-2 pr-4 font-medium">Samples</th>
                      <th className="pb-2 pr-4 font-medium">MAE</th>
                      <th className="pb-2 pr-4 font-medium">Variance</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((seg) => (
                      <tr key={seg.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{seg.propertyType}</td>
                        <td className="py-2 pr-4 tabular-nums">{seg.sampleN}</td>
                        <td className="py-2 pr-4 tabular-nums">
                          {seg.mae !== null ? seg.mae.toFixed(4) : "—"}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {seg.variance !== null ? seg.variance.toFixed(4) : "—"}
                        </td>
                        <td className="py-2">
                          <Badge variant="default">Active</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
