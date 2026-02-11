"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, GitCompareArrows, Save, Download } from "lucide-react";
import { toast } from "sonner";
import type { FinancialModelAssumptions } from "@/stores/financialModelStore";
import { computeProForma, type ProFormaResults } from "@/hooks/useProFormaCalculations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedScenario {
  id: string;
  name: string;
  assumptions: FinancialModelAssumptions;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt(value: number, style: "currency" | "percent" | "multiple" | "number"): string {
  if (style === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (style === "percent") return `${(value * 100).toFixed(2)}%`;
  if (style === "multiple") return `${value.toFixed(2)}x`;
  return value.toLocaleString();
}

// ---------------------------------------------------------------------------
// Comparison metric rows
// ---------------------------------------------------------------------------

interface MetricRow {
  label: string;
  getter: (r: ProFormaResults) => string;
}

const COMPARISON_METRICS: MetricRow[] = [
  { label: "Levered IRR", getter: (r) => r.leveredIRR !== null ? fmt(r.leveredIRR, "percent") : "N/A" },
  { label: "Unlevered IRR", getter: (r) => r.unleveredIRR !== null ? fmt(r.unleveredIRR, "percent") : "N/A" },
  { label: "Equity Multiple", getter: (r) => fmt(r.equityMultiple, "multiple") },
  { label: "Cash-on-Cash Y1", getter: (r) => fmt(r.cashOnCashYear1, "percent") },
  { label: "Net Profit", getter: (r) => fmt(r.netProfit, "currency") },
  { label: "Going-In Cap", getter: (r) => fmt(r.goingInCapRate, "percent") },
  { label: "DSCR", getter: (r) => r.dscr >= 999 ? "N/A" : `${r.dscr.toFixed(2)}x` },
  { label: "Equity Required", getter: (r) => fmt(r.acquisitionBasis.equityRequired, "currency") },
  { label: "Loan Amount", getter: (r) => fmt(r.acquisitionBasis.loanAmount, "currency") },
  { label: "Annual Debt Svc", getter: (r) => fmt(r.annualDebtService, "currency") },
  { label: "Exit Sale Price", getter: (r) => fmt(r.exitAnalysis.salePrice, "currency") },
  { label: "Exit Net Proceeds", getter: (r) => fmt(r.exitAnalysis.netProceeds, "currency") },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScenarioManager({
  dealId,
  currentAssumptions,
  onLoadScenario,
}: {
  dealId: string;
  currentAssumptions: FinancialModelAssumptions;
  onLoadScenario: (assumptions: FinancialModelAssumptions) => void;
}) {
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  // Load scenarios from API
  useEffect(() => {
    if (!dealId) return;
    fetch(`/api/deals/${dealId}/scenarios`)
      .then((r) => r.json())
      .then((data) => {
        setScenarios(data.scenarios ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [dealId]);

  // Persist scenarios
  const persistScenarios = useCallback(
    async (updated: SavedScenario[]) => {
      try {
        await fetch(`/api/deals/${dealId}/scenarios`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarios: updated }),
        });
      } catch {
        toast.error("Failed to save scenarios");
      }
    },
    [dealId]
  );

  // Save current assumptions as new scenario
  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    const newScenario: SavedScenario = {
      id: crypto.randomUUID(),
      name: saveName.trim(),
      assumptions: structuredClone(currentAssumptions),
      createdAt: new Date().toISOString(),
    };
    const updated = [...scenarios, newScenario];
    setScenarios(updated);
    persistScenarios(updated);
    setSaveName("");
    setSaveOpen(false);
    toast.success(`Scenario "${newScenario.name}" saved`);
  }, [saveName, currentAssumptions, scenarios, persistScenarios]);

  // Delete a scenario
  const handleDelete = useCallback(
    (id: string) => {
      const updated = scenarios.filter((s) => s.id !== id);
      setScenarios(updated);
      setCompareIds((prev) => prev.filter((cid) => cid !== id));
      persistScenarios(updated);
    },
    [scenarios, persistScenarios]
  );

  // Toggle scenario in comparison selection (max 3)
  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((cid) => cid !== id);
      if (prev.length >= 3) {
        toast.error("Compare up to 3 scenarios at a time");
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  // Compute results for compared scenarios
  const comparedScenarios = comparing
    ? compareIds
        .map((id) => scenarios.find((s) => s.id === id))
        .filter((s): s is SavedScenario => !!s)
        .map((s) => ({
          scenario: s,
          results: computeProForma(s.assumptions),
        }))
    : [];

  // Add current as implicit comparison
  const currentResults = comparing ? computeProForma(currentAssumptions) : null;

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Scenarios</CardTitle>
          <div className="flex gap-1.5">
            {compareIds.length >= 1 && (
              <Button
                variant={comparing ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setComparing(!comparing)}
              >
                <GitCompareArrows className="h-3 w-3" />
                {comparing ? "Hide Comparison" : `Compare (${compareIds.length})`}
              </Button>
            )}
            <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <Save className="h-3 w-3" />
                  Save Current
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Save Scenario</DialogTitle>
                </DialogHeader>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. Base Case, Downside, Stress..."
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    className="flex-1"
                  />
                  <Button onClick={handleSave} disabled={!saveName.trim()}>
                    <Plus className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Scenario List */}
        {scenarios.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No scenarios saved yet. Save your current assumptions to create a scenario.
          </p>
        ) : (
          <div className="space-y-1.5">
            {scenarios.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                  compareIds.includes(s.id) ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={compareIds.includes(s.id)}
                    onChange={() => toggleCompare(s.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  <span className="font-medium truncate">{s.name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      onLoadScenario(s.assumptions);
                      toast.success(`Loaded "${s.name}"`);
                    }}
                  >
                    <Download className="h-3 w-3" />
                    Load
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => handleDelete(s.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Side-by-side Comparison */}
        {comparing && comparedScenarios.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="p-1.5 text-left font-medium text-muted-foreground">Metric</th>
                  <th className="p-1.5 text-center font-medium bg-muted/30">Current</th>
                  {comparedScenarios.map(({ scenario }) => (
                    <th key={scenario.id} className="p-1.5 text-center font-medium">
                      {scenario.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_METRICS.map((m) => (
                  <tr key={m.label} className="border-b last:border-0">
                    <td className="p-1.5 font-medium">{m.label}</td>
                    <td className="p-1.5 text-center tabular-nums bg-muted/30">
                      {currentResults ? m.getter(currentResults) : "-"}
                    </td>
                    {comparedScenarios.map(({ scenario, results }) => (
                      <td key={scenario.id} className="p-1.5 text-center tabular-nums">
                        {m.getter(results)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
