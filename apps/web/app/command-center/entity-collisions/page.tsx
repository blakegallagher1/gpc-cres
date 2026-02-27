"use client";

import useSWR, { mutate } from "swr";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface CollisionAlert {
  id: string;
  entityIdA: string;
  entityIdB: string;
  addressA: string;
  addressB: string;
  similarity: number;
  status: string;
  createdAt: string;
}

export default function EntityCollisionsPage() {
  const { data, isLoading } = useSWR<{ alerts: CollisionAlert[] }>(
    "/api/memory/entity-collisions",
    fetcher,
    { revalidateOnFocus: false },
  );

  async function handleResolve(alertId: string, resolution: "merge" | "distinct" | "ignore") {
    await fetch("/api/memory/entity-collisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId, resolution }),
    });
    mutate("/api/memory/entity-collisions");
  }

  const alerts = data?.alerts ?? [];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Entity Collision Alerts
          </h1>
          <p className="text-sm text-muted-foreground">
            Potential duplicate entities detected by address similarity. Review and
            resolve — never auto-merged.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              Pending Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No entity collisions detected.
              </p>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-lg border p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {(alert.similarity * 100).toFixed(0)}% match
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(alert.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="grid gap-1 text-sm">
                          <div>
                            <span className="font-medium">A:</span>{" "}
                            {alert.addressA}{" "}
                            <span className="text-muted-foreground">
                              ({alert.entityIdA.slice(0, 8)}...)
                            </span>
                          </div>
                          <div>
                            <span className="font-medium">B:</span>{" "}
                            {alert.addressB}{" "}
                            <span className="text-muted-foreground">
                              ({alert.entityIdB.slice(0, 8)}...)
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(alert.id, "ignore")}
                        >
                          Ignore
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(alert.id, "distinct")}
                        >
                          Distinct
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleResolve(alert.id, "merge")}
                        >
                          Merge
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
