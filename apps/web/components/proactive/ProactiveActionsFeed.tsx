"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type ProactiveAction = {
  id: string;
  actionType: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  title: string;
  description: string;
  status: string;
  matchConfidence?: number | null;
  context?: {
    dealId?: string;
  };
  createdAt: string;
};

function badgeForPriority(priority: string): "outline" | "secondary" | "default" | "destructive" {
  if (priority === "URGENT") return "destructive";
  if (priority === "HIGH") return "default";
  if (priority === "MEDIUM") return "secondary";
  return "outline";
}

export function ProactiveActionsFeed() {
  const [actions, setActions] = useState<ProactiveAction[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await fetch("/api/proactive/actions?status=PENDING");
    if (!response.ok) {
      setActions([]);
      setLoading(false);
      return;
    }
    const payload = (await response.json()) as { actions: ProactiveAction[] };
    setActions(payload.actions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(interval);
  }, []);

  async function respond(actionId: string, response: "APPROVE" | "REJECT" | "MODIFY") {
    const request = await fetch(`/api/proactive/actions/${actionId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    if (!request.ok) {
      toast.error("Failed to submit response.");
      return;
    }
    toast.success(`Action ${response.toLowerCase()}d.`);
    await load();
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Loading actions...
        </CardContent>
      </Card>
    );
  }

  if (actions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          No pending proactive actions right now.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <Card key={action.id} className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm">{action.title}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={badgeForPriority(action.priority)}>{action.priority}</Badge>
                {typeof action.matchConfidence === "number" && (
                  <Badge variant="outline">
                    {Math.round(action.matchConfidence * 100)}% match
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void respond(action.id, "APPROVE")}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void respond(action.id, "MODIFY")}
            >
              Modify
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void respond(action.id, "REJECT")}
            >
              Reject
            </Button>
            {action.context?.dealId && (
              <a
                href={`/deals/${action.context.dealId}`}
                className="text-xs text-primary hover:underline"
              >
                View deal
              </a>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
