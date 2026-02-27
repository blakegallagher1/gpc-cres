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
import { Lightbulb } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface InnovationItem {
  id: string;
  entityId: string;
  factType: string;
  sourceReliability: number;
  agreementScore: number;
  noveltyReason: string;
  status: string;
  createdAt: string;
}

export default function InnovationQueuePage() {
  const { data, isLoading } = useSWR<{ items: InnovationItem[] }>(
    "/api/memory/innovation-queue",
    fetcher,
    { revalidateOnFocus: false },
  );

  async function handleReview(innovationId: string, decision: "approve" | "reject") {
    await fetch("/api/memory/innovation-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ innovationId, decision }),
    });
    mutate("/api/memory/innovation-queue");
  }

  const items = data?.items ?? [];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Innovation Queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Novel memory writes flagged for human review — high source reliability
            with low cross-memory agreement.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4" />
              Pending Reviews ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No novel memory writes pending review.
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{item.factType}</Badge>
                        <span className="text-xs text-muted-foreground">
                          Entity: {item.entityId.slice(0, 8)}...
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.noveltyReason}
                      </p>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>
                          Source reliability: {(item.sourceReliability * 100).toFixed(0)}%
                        </span>
                        <span>
                          Agreement: {(item.agreementScore * 100).toFixed(0)}%
                        </span>
                        <span>
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReview(item.id, "reject")}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleReview(item.id, "approve")}
                      >
                        Approve
                      </Button>
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
