"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type PortfolioDeal,
  PIPELINE_STAGES,
} from "@/lib/data/portfolioConstants";

interface PipelineFunnelProps {
  deals: PortfolioDeal[];
}

export function PipelineFunnel({ deals }: PipelineFunnelProps) {
  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    count: deals.filter((d) => d.status === stage.key).length,
  }));

  const maxCount = Math.max(...stageCounts.map((s) => s.count), 1);

  // Separate active pipeline from terminal states
  const activeStages = stageCounts.filter(
    (s) => s.key !== "KILLED" && s.key !== "EXITED"
  );
  const terminalStages = stageCounts.filter(
    (s) => s.key === "KILLED" || s.key === "EXITED"
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Deal Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {activeStages.map((stage) => (
            <div key={stage.key} className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-right">
                <span className="text-xs font-medium text-muted-foreground">
                  {stage.label}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-7 rounded-sm transition-all duration-500"
                    style={{
                      width: `${Math.max((stage.count / maxCount) * 100, 4)}%`,
                      backgroundColor: stage.color,
                      opacity: stage.count > 0 ? 1 : 0.2,
                    }}
                  />
                  <span className="text-sm font-semibold tabular-nums">
                    {stage.count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Terminal states */}
        <div className="mt-4 flex gap-4 border-t pt-3">
          {terminalStages.map((stage) => (
            <div key={stage.key} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              <span className="text-xs text-muted-foreground">
                {stage.label}:{" "}
                <span className="font-semibold text-foreground">{stage.count}</span>
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
