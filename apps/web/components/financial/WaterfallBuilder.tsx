"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { ProFormaResults } from "@/hooks/useProFormaCalculations";
import {
  computeWaterfall,
  type WaterfallStructure,
  type PromoteTier,
  type WaterfallResults,
} from "@/hooks/useWaterfallCalculations";

type CapitalSourceKind =
  | "LP_EQUITY"
  | "GP_EQUITY"
  | "DEBT"
  | "MEZZ"
  | "PREF_EQUITY"
  | "GRANT"
  | "OTHER";

type CapitalSourceRecord = {
  id: string;
  name: string;
  sourceKind: CapitalSourceKind;
  amount: number;
  notes: string | null;
  sortOrder: number;
};

type EquityWaterfallRecord = {
  id: string;
  tierName: string;
  hurdleIrrPct: number;
  lpDistributionPct: number;
  gpDistributionPct: number;
  sortOrder: number;
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pctFmt(value: number | null): string {
  if (value === null) return "N/A";
  return `${(value * 100).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Default structure
// ---------------------------------------------------------------------------

function createDefaultStructure(equityRequired: number): WaterfallStructure {
  return {
    id: crypto.randomUUID(),
    name: "New Structure",
    totalEquity: equityRequired,
    gpCoinvestPct: 10,
    preferredReturnPct: 8,
    catchUpPct: 50,
    promoteTiers: [
      { hurdleIrrPct: 0, lpDistributionPct: 80, gpDistributionPct: 20 },
      { hurdleIrrPct: 12, lpDistributionPct: 70, gpDistributionPct: 30 },
      { hurdleIrrPct: 18, lpDistributionPct: 60, gpDistributionPct: 40 },
    ],
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Structure Editor sub-component
// ---------------------------------------------------------------------------

function StructureEditor({
  structure,
  onChange,
}: {
  structure: WaterfallStructure;
  onChange: (s: WaterfallStructure) => void;
}) {
  const updateField = (field: string, value: number) => {
    onChange({ ...structure, [field]: value });
  };

  const updateTier = (idx: number, field: keyof PromoteTier, value: number) => {
    const tiers = [...structure.promoteTiers];
    tiers[idx] = { ...tiers[idx], [field]: value };
    onChange({ ...structure, promoteTiers: tiers });
  };

  const getTierGpSplit = (tier: PromoteTier): number => {
    if (typeof tier.gpDistributionPct === "number") return tier.gpDistributionPct;
    if (typeof tier.lpDistributionPct === "number") return 100 - tier.lpDistributionPct;
    return tier.gpSplitPct ?? 0;
  };

  const addTier = () => {
    const lastHurdle = structure.promoteTiers.length > 0
      ? structure.promoteTiers[structure.promoteTiers.length - 1].hurdleIrrPct
      : 0;
    const lastSplit = structure.promoteTiers.length > 0
      ? getTierGpSplit(structure.promoteTiers[structure.promoteTiers.length - 1])
      : 20;
    onChange({
      ...structure,
      promoteTiers: [
        ...structure.promoteTiers,
        {
          hurdleIrrPct: lastHurdle + 6,
          lpDistributionPct: Math.max(0, 100 - Math.min(lastSplit + 10, 50)),
          gpDistributionPct: Math.min(lastSplit + 10, 50),
        },
      ],
    });
  };

  const removeTier = (idx: number) => {
    onChange({
      ...structure,
      promoteTiers: structure.promoteTiers.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="space-y-4">
      {/* Equity */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Total Equity</Label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">$</span>
            <Input
              type="number"
              value={structure.totalEquity}
              onChange={(e) => updateField("totalEquity", parseFloat(e.target.value) || 0)}
              step={10000}
              min={0}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">GP Co-invest</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={structure.gpCoinvestPct}
              onChange={(e) => updateField("gpCoinvestPct", parseFloat(e.target.value) || 0)}
              step={1}
              min={0}
              max={100}
              className="h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
      </div>

      {/* Preferred & Catch-up */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">LP Preferred Return</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={structure.preferredReturnPct}
              onChange={(e) => updateField("preferredReturnPct", parseFloat(e.target.value) || 0)}
              step={0.5}
              min={0}
              max={30}
              className="h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">GP Catch-up</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={structure.catchUpPct}
              onChange={(e) => updateField("catchUpPct", parseFloat(e.target.value) || 0)}
              step={5}
              min={0}
              max={100}
              className="h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
      </div>

      {/* Computed equity split */}
      <div className="flex gap-4 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
        <span>
          LP Equity: {fmt(structure.totalEquity * (1 - structure.gpCoinvestPct / 100))}
        </span>
        <span>
          GP Equity: {fmt(structure.totalEquity * (structure.gpCoinvestPct / 100))}
        </span>
      </div>

      {/* Promote Tiers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-semibold">Promote Tiers</Label>
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={addTier}>
            <Plus className="h-3 w-3" />
            Add Tier
          </Button>
        </div>
        <div className="space-y-1.5">
          {structure.promoteTiers.map((tier, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-8 shrink-0">
                {idx === 0 ? "0%" : `${structure.promoteTiers[idx - 1]?.hurdleIrrPct ?? 0}%`}
                {" "}→
              </span>
              <div className="flex items-center gap-1 flex-1">
                <Input
                  type="number"
                  value={tier.hurdleIrrPct}
                  onChange={(e) => updateTier(idx, "hurdleIrrPct", parseFloat(e.target.value) || 0)}
                  step={1}
                  min={0}
                  max={50}
                  className="h-7 text-xs w-16"
                />
                <span className="text-xs text-muted-foreground">% IRR</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">GP:</span>
                <Input
                  type="number"
                  value={getTierGpSplit(tier)}
                  onChange={(e) => {
                    const gpSplit = parseFloat(e.target.value) || 0;
                    const tiers = [...structure.promoteTiers];
                    tiers[idx] = {
                      ...tiers[idx],
                      gpDistributionPct: gpSplit,
                      lpDistributionPct: 100 - gpSplit,
                      gpSplitPct: gpSplit,
                    };
                    onChange({ ...structure, promoteTiers: tiers });
                  }}
                  step={5}
                  min={0}
                  max={100}
                  className="h-7 text-xs w-14"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <span className="text-xs text-muted-foreground">
                LP: {100 - getTierGpSplit(tier)}%
              </span>
              {structure.promoteTiers.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={() => removeTier(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results display sub-component
// ---------------------------------------------------------------------------

function WaterfallResultsDisplay({ results }: { results: WaterfallResults }) {
  // Chart data for stacked bar
  const chartData = results.annualDistributions.map((d) => ({
    name: `Y${d.year}`,
    LP: d.lpDistribution,
    GP: d.gpDistribution,
  }));

  return (
    <div className="space-y-4">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-3 pb-2 px-3">
            <p className="text-xs text-muted-foreground">LP IRR</p>
            <p className="text-lg font-bold tabular-nums">{pctFmt(results.lpIrr)}</p>
            <p className="text-xs text-muted-foreground">{results.lpMultiple}x multiple</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-3">
            <p className="text-xs text-muted-foreground">GP IRR</p>
            <p className="text-lg font-bold tabular-nums">{pctFmt(results.gpIrr)}</p>
            <p className="text-xs text-muted-foreground">{results.gpMultiple}x multiple</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-3">
            <p className="text-xs text-muted-foreground">LP Total Return</p>
            <p className="text-lg font-bold tabular-nums">{fmt(results.lpTotalReturn)}</p>
            <p className="text-xs text-muted-foreground">
              {(results.lpProfitShare * 100).toFixed(1)}% of profit
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-3">
            <p className="text-xs text-muted-foreground">GP Total Return</p>
            <p className="text-lg font-bold tabular-nums">{fmt(results.gpTotalReturn)}</p>
            <p className="text-xs text-muted-foreground">
              {(results.gpProfitShare * 100).toFixed(1)}% of profit
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Annual Distributions</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis
                fontSize={11}
                tickFormatter={(v: number) =>
                  `$${Math.abs(v) >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}K`}`
                }
              />
              <Tooltip
                formatter={(value) => {
                  const v = typeof value === "number" ? value : 0;
                  return [fmt(v)];
                }}
              />
              <Legend />
              <Bar dataKey="LP" stackId="dist" fill="#3b82f6" />
              <Bar dataKey="GP" stackId="dist" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Distribution table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Distribution Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Year</TableHead>
                <TableHead className="text-right">Total CF</TableHead>
                <TableHead className="text-right">LP Dist</TableHead>
                <TableHead className="text-right">GP Dist</TableHead>
                <TableHead className="text-right">LP Cum.</TableHead>
                <TableHead className="text-right">GP Cum.</TableHead>
                <TableHead className="text-right">LP IRR</TableHead>
                <TableHead>Active Tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">0</TableCell>
                <TableCell className="text-right tabular-nums text-destructive">
                  ({fmt(results.lpEquity + results.gpEquity)})
                </TableCell>
                <TableCell className="text-right tabular-nums text-destructive">
                  ({fmt(results.lpEquity)})
                </TableCell>
                <TableCell className="text-right tabular-nums text-destructive">
                  ({fmt(results.gpEquity)})
                </TableCell>
                <TableCell className="text-right tabular-nums">-</TableCell>
                <TableCell className="text-right tabular-nums">-</TableCell>
                <TableCell className="text-right tabular-nums">-</TableCell>
                <TableCell className="text-xs text-muted-foreground">Investment</TableCell>
              </TableRow>
              {results.annualDistributions.map((d) => (
                <TableRow key={d.year}>
                  <TableCell className="font-medium">{d.year}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.totalCashFlow)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.lpDistribution)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.gpDistribution)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.lpCumulative)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.gpCumulative)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pctFmt(d.lpIrr)}</TableCell>
                  <TableCell className="text-xs">{d.activeTier}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main WaterfallBuilder component
// ---------------------------------------------------------------------------

export function WaterfallBuilder({
  dealId,
  proForma,
  capitalSources,
  equityWaterfalls,
  onCreateCapitalSource,
  onUpdateCapitalSource,
  onDeleteCapitalSource,
  onCreateEquityWaterfallTier,
  onUpdateEquityWaterfallTier,
  onDeleteEquityWaterfallTier,
}: {
  dealId: string;
  proForma: ProFormaResults;
  capitalSources?: CapitalSourceRecord[];
  equityWaterfalls?: EquityWaterfallRecord[];
  onCreateCapitalSource?: (payload: {
    name: string;
    sourceKind: CapitalSourceKind;
    amount: number;
    notes: string | null;
    sortOrder: number;
  }) => Promise<void>;
  onUpdateCapitalSource?: (
    id: string,
    patch: Partial<{
      name: string;
      sourceKind: CapitalSourceKind;
      amount: number;
      notes: string | null;
      sortOrder: number;
    }>,
  ) => Promise<void>;
  onDeleteCapitalSource?: (id: string) => Promise<void>;
  onCreateEquityWaterfallTier?: (payload: {
    tierName: string;
    hurdleIrrPct: number;
    lpDistributionPct: number;
    gpDistributionPct: number;
    sortOrder: number;
  }) => Promise<void>;
  onUpdateEquityWaterfallTier?: (
    id: string,
    patch: Partial<{
      tierName: string;
      hurdleIrrPct: number;
      lpDistributionPct: number;
      gpDistributionPct: number;
      sortOrder: number;
    }>,
  ) => Promise<void>;
  onDeleteEquityWaterfallTier?: (id: string) => Promise<void>;
}) {
  const [structures, setStructures] = useState<WaterfallStructure[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saveNameOpen, setSaveNameOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const hasExternalCapitalStack =
    Array.isArray(capitalSources) &&
    Array.isArray(equityWaterfalls) &&
    typeof onCreateCapitalSource === "function" &&
    typeof onUpdateCapitalSource === "function" &&
    typeof onDeleteCapitalSource === "function" &&
    typeof onCreateEquityWaterfallTier === "function" &&
    typeof onUpdateEquityWaterfallTier === "function" &&
    typeof onDeleteEquityWaterfallTier === "function";

  // Load from API
  useEffect(() => {
    if (!dealId) return;
    if (hasExternalCapitalStack) {
      setStructures([createDefaultStructure(proForma.acquisitionBasis.equityRequired)]);
      setLoaded(true);
      return;
    }
    fetch(`/api/deals/${dealId}/waterfall`)
      .then((r) => r.json())
      .then((data) => {
        const saved = (data.structures as WaterfallStructure[]) ?? [];
        if (saved.length > 0) {
          setStructures(saved);
        } else {
          setStructures([createDefaultStructure(proForma.acquisitionBasis.equityRequired)]);
        }
        setLoaded(true);
      })
      .catch(() => {
        setStructures([createDefaultStructure(proForma.acquisitionBasis.equityRequired)]);
        setLoaded(true);
      });
  }, [dealId, hasExternalCapitalStack, proForma.acquisitionBasis.equityRequired]);

  // Persist
  const persist = useCallback(
    async (updated: WaterfallStructure[]) => {
      if (hasExternalCapitalStack) {
        return;
      }
      try {
        await fetch(`/api/deals/${dealId}/waterfall`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ structures: updated }),
        });
      } catch {
        toast.error("Failed to save waterfall structure");
      }
    },
    [dealId, hasExternalCapitalStack]
  );

  // Update active structure
  const handleStructureChange = useCallback(
    (updated: WaterfallStructure) => {
      setStructures((prev) => {
        const next = [...prev];
        next[activeIdx] = updated;
        persist(next);
        return next;
      });
    },
    [activeIdx, persist]
  );

  // Add new structure
  const handleAdd = useCallback(() => {
    if (!newName.trim()) return;
    const newStruct: WaterfallStructure = {
      ...createDefaultStructure(proForma.acquisitionBasis.equityRequired),
      name: newName.trim(),
    };
    setStructures((prev) => {
      const next = [...prev, newStruct];
      persist(next);
      return next;
    });
    setActiveIdx(structures.length);
    setNewName("");
    setSaveNameOpen(false);
  }, [newName, proForma.acquisitionBasis.equityRequired, structures.length, persist]);

  // Delete structure
  const handleDelete = useCallback(
    (idx: number) => {
      setStructures((prev) => {
        const next = prev.filter((_, i) => i !== idx);
        if (next.length === 0) {
          next.push(createDefaultStructure(proForma.acquisitionBasis.equityRequired));
        }
        persist(next);
        return next;
      });
      setActiveIdx((prev) => Math.min(prev, structures.length - 2));
    },
    [proForma.acquisitionBasis.equityRequired, structures.length, persist]
  );

  const activeStructure = structures[activeIdx] ?? null;

  const modeledStructure: WaterfallStructure | null = useMemo(() => {
    if (!activeStructure) return null;
    if (!hasExternalCapitalStack || !capitalSources || !equityWaterfalls) {
      return activeStructure;
    }

    const totalEquity = capitalSources
      .filter(
        (source) =>
          source.sourceKind === "LP_EQUITY" ||
          source.sourceKind === "GP_EQUITY" ||
          source.sourceKind === "PREF_EQUITY",
      )
      .reduce((sum, source) => sum + source.amount, 0);
    const gpEquity = capitalSources
      .filter((source) => source.sourceKind === "GP_EQUITY")
      .reduce((sum, source) => sum + source.amount, 0);
    const gpCoinvestPct = totalEquity > 0 ? (gpEquity / totalEquity) * 100 : activeStructure.gpCoinvestPct;

    const promoteTiers: PromoteTier[] =
      equityWaterfalls.length > 0
        ? [...equityWaterfalls]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((tier) => ({
              hurdleIrrPct: tier.hurdleIrrPct,
              lpDistributionPct: tier.lpDistributionPct,
              gpDistributionPct: tier.gpDistributionPct,
              gpSplitPct: tier.gpDistributionPct,
            }))
        : activeStructure.promoteTiers;

    return {
      ...activeStructure,
      totalEquity: totalEquity > 0 ? totalEquity : activeStructure.totalEquity,
      gpCoinvestPct,
      promoteTiers,
    };
  }, [activeStructure, capitalSources, equityWaterfalls, hasExternalCapitalStack]);

  // Compute waterfall results
  const results: WaterfallResults | null = useMemo(() => {
    if (!modeledStructure) return null;
    return computeWaterfall(modeledStructure, proForma);
  }, [modeledStructure, proForma]);

  if (!loaded) return null;

  return (
    <div className="space-y-4">
      {/* Structure selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Waterfall Structure</CardTitle>
            <Dialog open={saveNameOpen} onOpenChange={setSaveNameOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" />
                  New Structure
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>New Waterfall Structure</DialogTitle>
                </DialogHeader>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. Standard 80/20, Promote Heavy..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    className="flex-1"
                  />
                  <Button onClick={handleAdd} disabled={!newName.trim()}>
                    Create
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Structure tabs */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto">
            {structures.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant={idx === activeIdx ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setActiveIdx(idx)}
                >
                  {s.name}
                </Button>
                {structures.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={() => handleDelete(idx)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Rename inline */}
          <div className="flex items-center gap-2 mb-4">
            <Label className="text-xs shrink-0">Name:</Label>
            <Input
              value={activeStructure?.name ?? ""}
              onChange={(e) => {
                if (activeStructure) {
                  handleStructureChange({ ...activeStructure, name: e.target.value });
                }
              }}
              className="h-7 text-xs max-w-[200px]"
            />
          </div>

          {/* Structure editor */}
          {activeStructure && (
            <StructureEditor
              structure={activeStructure}
              onChange={handleStructureChange}
            />
          )}
        </CardContent>
      </Card>

      {hasExternalCapitalStack && capitalSources && equityWaterfalls && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Capital Sources</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    const nextOrder = capitalSources.length;
                    void onCreateCapitalSource?.({
                      name: `Source ${nextOrder + 1}`,
                      sourceKind: "LP_EQUITY",
                      amount: 0,
                      notes: null,
                      sortOrder: nextOrder,
                    }).catch(() => toast.error("Failed to add capital source"));
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Add Source
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {capitalSources.length === 0 && (
                  <p className="text-xs text-muted-foreground">No capital sources configured.</p>
                )}
                {capitalSources.map((source) => (
                  <div key={source.id} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-3 h-8 text-xs"
                      value={source.name}
                      onChange={(e) =>
                        void onUpdateCapitalSource?.(source.id, { name: e.target.value }).catch(() =>
                          toast.error("Failed to update capital source"),
                        )
                      }
                    />
                    <select
                      className="col-span-3 h-8 rounded-md border bg-background px-2 text-xs"
                      value={source.sourceKind}
                      onChange={(e) =>
                        void onUpdateCapitalSource?.(source.id, {
                          sourceKind: e.target.value as CapitalSourceKind,
                        }).catch(() => toast.error("Failed to update capital source"))
                      }
                    >
                      <option value="LP_EQUITY">LP Equity</option>
                      <option value="GP_EQUITY">GP Equity</option>
                      <option value="DEBT">Debt</option>
                      <option value="MEZZ">Mezz</option>
                      <option value="PREF_EQUITY">Pref Equity</option>
                      <option value="GRANT">Grant</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <Input
                      className="col-span-3 h-8 text-xs"
                      type="number"
                      value={source.amount}
                      onChange={(e) =>
                        void onUpdateCapitalSource?.(source.id, {
                          amount: parseFloat(e.target.value) || 0,
                        }).catch(() => toast.error("Failed to update capital source"))
                      }
                    />
                    <Input
                      className="col-span-2 h-8 text-xs"
                      type="number"
                      value={source.sortOrder}
                      onChange={(e) =>
                        void onUpdateCapitalSource?.(source.id, {
                          sortOrder: parseInt(e.target.value, 10) || 0,
                        }).catch(() => toast.error("Failed to update capital source"))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="col-span-1 h-7 w-7 p-0 text-destructive"
                      onClick={() =>
                        void onDeleteCapitalSource?.(source.id).catch(() =>
                          toast.error("Failed to delete capital source"),
                        )
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Waterfall Tiers</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    const nextOrder = equityWaterfalls.length;
                    void onCreateEquityWaterfallTier?.({
                      tierName: `Tier ${nextOrder + 1}`,
                      hurdleIrrPct: nextOrder === 0 ? 0 : (equityWaterfalls[nextOrder - 1]?.hurdleIrrPct ?? 0) + 4,
                      lpDistributionPct: 80,
                      gpDistributionPct: 20,
                      sortOrder: nextOrder,
                    }).catch(() => toast.error("Failed to add waterfall tier"));
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Add Tier
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {equityWaterfalls.length === 0 && (
                  <p className="text-xs text-muted-foreground">No waterfall tiers configured.</p>
                )}
                {equityWaterfalls.map((tier) => (
                  <div key={tier.id} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-3 h-8 text-xs"
                      value={tier.tierName}
                      onChange={(e) =>
                        void onUpdateEquityWaterfallTier?.(tier.id, { tierName: e.target.value }).catch(() =>
                          toast.error("Failed to update waterfall tier"),
                        )
                      }
                    />
                    <Input
                      className="col-span-2 h-8 text-xs"
                      type="number"
                      value={tier.hurdleIrrPct}
                      onChange={(e) =>
                        void onUpdateEquityWaterfallTier?.(tier.id, {
                          hurdleIrrPct: parseFloat(e.target.value) || 0,
                        }).catch(() => toast.error("Failed to update waterfall tier"))
                      }
                    />
                    <Input
                      className="col-span-2 h-8 text-xs"
                      type="number"
                      value={tier.lpDistributionPct}
                      onChange={(e) => {
                        const lp = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                        void onUpdateEquityWaterfallTier?.(tier.id, {
                          lpDistributionPct: lp,
                          gpDistributionPct: 100 - lp,
                        }).catch(() => toast.error("Failed to update waterfall tier"));
                      }}
                    />
                    <Input
                      className="col-span-2 h-8 text-xs"
                      type="number"
                      value={tier.gpDistributionPct}
                      onChange={(e) => {
                        const gp = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                        void onUpdateEquityWaterfallTier?.(tier.id, {
                          gpDistributionPct: gp,
                          lpDistributionPct: 100 - gp,
                        }).catch(() => toast.error("Failed to update waterfall tier"));
                      }}
                    />
                    <Input
                      className="col-span-2 h-8 text-xs"
                      type="number"
                      value={tier.sortOrder}
                      onChange={(e) =>
                        void onUpdateEquityWaterfallTier?.(tier.id, {
                          sortOrder: parseInt(e.target.value, 10) || 0,
                        }).catch(() => toast.error("Failed to update waterfall tier"))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="col-span-1 h-7 w-7 p-0 text-destructive"
                      onClick={() =>
                        void onDeleteEquityWaterfallTier?.(tier.id).catch(() =>
                          toast.error("Failed to delete waterfall tier"),
                        )
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Results */}
      {results && <WaterfallResultsDisplay results={results} />}
    </div>
  );
}
