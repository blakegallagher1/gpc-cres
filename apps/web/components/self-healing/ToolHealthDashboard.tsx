"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ToolHealth = {
  toolName: string;
  totalCalls: number;
  successRate: number;
  avgLatency: number;
  fallbackRate: number;
  lastFailure: string | null;
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
};

function statusVariant(status: ToolHealth["status"]): "default" | "secondary" | "destructive" {
  if (status === "HEALTHY") return "default";
  if (status === "DEGRADED") return "secondary";
  return "destructive";
}

export function ToolHealthDashboard() {
  const [tools, setTools] = useState<ToolHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch("/api/tools/health");
      if (!response.ok) {
        if (active) {
          setTools([]);
          setLoading(false);
        }
        return;
      }
      const payload = (await response.json()) as { tools: ToolHealth[] };
      if (active) {
        setTools(payload.tools ?? []);
        setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Loading tool health...
        </CardContent>
      </Card>
    );
  }

  if (tools.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          No tool health metrics available yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => (
        <Card key={tool.toolName}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{tool.toolName}</CardTitle>
              <Badge variant={statusVariant(tool.status)}>{tool.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span>Success rate</span>
                <span>{tool.successRate.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${Math.max(0, Math.min(100, tool.successRate))}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <p>Calls: {tool.totalCalls}</p>
              <p>Latency: {tool.avgLatency}ms</p>
              <p>Fallback: {(tool.fallbackRate * 100).toFixed(1)}%</p>
              <p>
                Last fail:{" "}
                {tool.lastFailure ? new Date(tool.lastFailure).toLocaleString() : "None"}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
