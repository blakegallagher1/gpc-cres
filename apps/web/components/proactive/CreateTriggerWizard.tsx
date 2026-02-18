"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Condition = {
  field: string;
  op: "eq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
  value: string;
};

const defaultCondition: Condition = {
  field: "acreage",
  op: "gte",
  value: "5",
};

export function CreateTriggerWizard() {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    name: "New Deal Watcher",
    description: "Alert me when events match my preferred profile.",
    triggerType: "EVENT" as const,
    event: "parcel.created",
    actionType: "NOTIFY" as const,
    requireApproval: true,
    maxRunsPerDay: 10,
    maxAutoCost: 5,
    conditions: [{ ...defaultCondition }],
  });

  function updateCondition(index: number, patch: Partial<Condition>) {
    setConfig((previous) => {
      const next = [...previous.conditions];
      next[index] = { ...next[index], ...patch };
      return { ...previous, conditions: next };
    });
  }

  async function saveTrigger() {
    setSaving(true);
    try {
      const response = await fetch("/api/proactive/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.name,
          description: config.description,
          triggerType: config.triggerType,
          triggerConfig: {
            event: config.event,
            estimatedCost: config.maxAutoCost,
          },
          conditions: config.conditions.map((condition) => ({
            ...condition,
            value:
              Number.isFinite(Number(condition.value)) && condition.value.trim() !== ""
                ? Number(condition.value)
                : condition.value,
          })),
          actionType: config.actionType,
          actionConfig: {},
          requireApproval: config.requireApproval,
          maxRunsPerDay: config.maxRunsPerDay,
          maxAutoCost: config.maxAutoCost,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create trigger.");
      }

      toast.success("Trigger created.");
      setStep(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create trigger.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">Create proactive trigger</h3>
        <p className="text-xs text-muted-foreground">
          Define what to watch, what to filter, and what action to take.
        </p>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <Input
            value={config.name}
            onChange={(event) => setConfig((previous) => ({ ...previous, name: event.target.value }))}
            placeholder="Trigger name"
          />
          <Select
            value={config.event}
            onValueChange={(value) => setConfig((previous) => ({ ...previous, event: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="parcel.created">Parcel created</SelectItem>
              <SelectItem value="parcel.enriched">Parcel enriched</SelectItem>
              <SelectItem value="task.completed">Task completed</SelectItem>
              <SelectItem value="deal.statusChanged">Deal status changed</SelectItem>
              <SelectItem value="triage.completed">Triage completed</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setStep(2)}>Next</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {config.conditions.map((condition, index) => (
            <div key={`${condition.field}-${index}`} className="grid gap-2 md:grid-cols-3">
              <Input
                value={condition.field}
                onChange={(event) => updateCondition(index, { field: event.target.value })}
                placeholder="Field"
              />
              <Select
                value={condition.op}
                onValueChange={(value) =>
                  updateCondition(index, {
                    op: value as Condition["op"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gte">&gt;=</SelectItem>
                  <SelectItem value="lte">&lt;=</SelectItem>
                  <SelectItem value="eq">=</SelectItem>
                  <SelectItem value="contains">contains</SelectItem>
                  <SelectItem value="in">in</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={condition.value}
                onChange={(event) => updateCondition(index, { value: event.target.value })}
                placeholder="Value"
              />
            </div>
          ))}

          <Button
            variant="outline"
            onClick={() =>
              setConfig((previous) => ({
                ...previous,
                conditions: [...previous.conditions, { ...defaultCondition }],
              }))
            }
          >
            Add condition
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)}>Next</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <Select
            value={config.actionType}
            onValueChange={(value) =>
              setConfig((previous) => ({
                ...previous,
                actionType: value as typeof previous.actionType,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOTIFY">Notify only</SelectItem>
              <SelectItem value="CREATE_TASK">Create task</SelectItem>
              <SelectItem value="RUN_WORKFLOW">Run workflow</SelectItem>
              <SelectItem value="AUTO_TRIAGE">Auto triage</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center justify-between rounded-md border p-2">
            <span className="text-sm">Require approval before execution</span>
            <Switch
              checked={config.requireApproval}
              onCheckedChange={(checked) =>
                setConfig((previous) => ({ ...previous, requireApproval: checked }))
              }
            />
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <Input
              type="number"
              min={1}
              max={500}
              value={config.maxRunsPerDay}
              onChange={(event) =>
                setConfig((previous) => ({
                  ...previous,
                  maxRunsPerDay: Number(event.target.value) || 10,
                }))
              }
              placeholder="Max runs per day"
            />
            <Input
              type="number"
              min={0}
              step={0.5}
              value={config.maxAutoCost}
              onChange={(event) =>
                setConfig((previous) => ({
                  ...previous,
                  maxAutoCost: Number(event.target.value) || 0,
                }))
              }
              placeholder="Max auto cost"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => void saveTrigger()} disabled={saving}>
              {saving ? "Saving..." : "Create trigger"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
