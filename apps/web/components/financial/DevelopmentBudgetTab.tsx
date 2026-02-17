"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  summarizeDevelopmentBudget,
  type DevelopmentBudgetCalcInput,
  type DevelopmentBudgetLineItemInput,
} from "@entitlement-os/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DevelopmentBudgetRecord = {
  id: string;
  dealId: string;
  orgId: string;
  lineItems: DevelopmentBudgetLineItemInput[];
  contingencies: {
    hardCostContingencyPct?: number;
    softCostContingencyPct?: number;
    otherCostContingencyPct?: number;
  };
  createdAt: string;
  updatedAt: string;
};

type ContingencyState = NonNullable<DevelopmentBudgetCalcInput["contingencies"]>;

type DevelopmentBudgetTabProps = {
  dealId: string;
  developmentBudget: DevelopmentBudgetRecord | null;
  onBudgetSaved: (budget: DevelopmentBudgetRecord | null) => void;
};

function toCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function DevelopmentBudgetTab({
  dealId,
  developmentBudget,
  onBudgetSaved,
}: DevelopmentBudgetTabProps) {
  const [lineItems, setLineItems] = useState<DevelopmentBudgetLineItemInput[]>(
    developmentBudget?.lineItems ?? [],
  );
  const [contingencies, setContingencies] = useState<ContingencyState>(
    developmentBudget?.contingencies ?? {},
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLineItems(developmentBudget?.lineItems ?? []);
    setContingencies(developmentBudget?.contingencies ?? {});
  }, [developmentBudget]);

  const summary = useMemo(
    () => summarizeDevelopmentBudget({ lineItems, contingencies }),
    [lineItems, contingencies],
  );

  function addLineItem(): void {
    setLineItems((current) => [
      ...current,
      { name: "", category: "hard", amount: 0 },
    ]);
  }

  function updateLineItem(
    index: number,
    patch: Partial<DevelopmentBudgetLineItemInput>,
  ): void {
    setLineItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function removeLineItem(index: number): void {
    setLineItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveBudget(): Promise<void> {
    const cleanedItems = lineItems
      .map((item) => ({
        name: item.name.trim(),
        category: item.category,
        amount: Number.isFinite(item.amount) ? item.amount : 0,
      }))
      .filter((item) => item.name.length > 0);

    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/financial-model`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          developmentBudget: {
            lineItems: cleanedItems,
            contingencies,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to save development budget");

      const now = new Date().toISOString();
      onBudgetSaved({
        id: developmentBudget?.id ?? "draft",
        dealId,
        orgId: developmentBudget?.orgId ?? "",
        lineItems: cleanedItems,
        contingencies: contingencies ?? {},
        createdAt: developmentBudget?.createdAt ?? now,
        updatedAt: now,
      });
      setLineItems(cleanedItems);
      toast.success("Development budget saved");
    } catch {
      toast.error("Failed to save development budget");
    } finally {
      setSaving(false);
    }
  }

  async function clearBudget(): Promise<void> {
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/financial-model`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developmentBudget: null }),
      });

      if (!res.ok) throw new Error("Failed to clear development budget");

      setLineItems([]);
      setContingencies({});
      onBudgetSaved(null);
      toast.success("Development budget cleared");
    } catch {
      toast.error("Failed to clear development budget");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lineItems.map((item, index) => (
            <div key={`${item.name}-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <Input
                value={item.name}
                onChange={(event) =>
                  updateLineItem(index, { name: event.target.value })
                }
                placeholder="Line item name"
              />
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={item.category}
                onChange={(event) =>
                  updateLineItem(index, {
                    category: event.target.value as DevelopmentBudgetLineItemInput["category"],
                  })
                }
              >
                <option value="hard">Hard Cost</option>
                <option value="soft">Soft Cost</option>
                <option value="other">Other</option>
              </select>
              <Input
                type="number"
                value={item.amount}
                onChange={(event) =>
                  updateLineItem(index, {
                    amount: Number.parseFloat(event.target.value) || 0,
                  })
                }
                placeholder="Amount"
              />
              <Button
                type="button"
                variant="outline"
                className="justify-start md:justify-center"
                onClick={() => removeLineItem(index)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Line Item
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Contingencies</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Hard Cost Contingency %</Label>
            <Input
              type="number"
              value={contingencies.hardCostContingencyPct ?? 0}
              onChange={(event) =>
                setContingencies((current) => ({
                  ...current,
                  hardCostContingencyPct: Number.parseFloat(event.target.value) || 0,
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Soft Cost Contingency %</Label>
            <Input
              type="number"
              value={contingencies.softCostContingencyPct ?? 0}
              onChange={(event) =>
                setContingencies((current) => ({
                  ...current,
                  softCostContingencyPct: Number.parseFloat(event.target.value) || 0,
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Other Cost Contingency %</Label>
            <Input
              type="number"
              value={contingencies.otherCostContingencyPct ?? 0}
              onChange={(event) =>
                setContingencies((current) => ({
                  ...current,
                  otherCostContingencyPct: Number.parseFloat(event.target.value) || 0,
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Budget Totals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span>Hard Costs</span>
            <span className="tabular-nums">{toCurrency(summary.hardCosts)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Soft Costs</span>
            <span className="tabular-nums">{toCurrency(summary.softCosts)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Other Costs</span>
            <span className="tabular-nums">{toCurrency(summary.otherCosts)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Total Contingency</span>
            <span className="tabular-nums">{toCurrency(summary.totalContingency)}</span>
          </div>
          <div className="flex items-center justify-between border-t pt-2 font-semibold">
            <span>Total Development Budget</span>
            <span className="tabular-nums">{toCurrency(summary.totalBudget)}</span>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button type="button" size="sm" onClick={saveBudget} disabled={saving}>
              <Save className="mr-1 h-3.5 w-3.5" />
              Save Budget
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clearBudget} disabled={saving}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
