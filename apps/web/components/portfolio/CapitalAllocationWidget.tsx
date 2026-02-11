"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, DollarSign, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CapitalAllocationResult } from "@/lib/services/portfolioAnalytics.service";

export function CapitalAllocationWidget() {
  const [equity, setEquity] = useState("");
  const [maxDeals, setMaxDeals] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CapitalAllocationResult | null>(null);

  const handleOptimize = async () => {
    const amt = Number(equity);
    if (!amt || amt <= 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/portfolio/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availableEquity: amt,
          maxDeals: maxDeals ? Number(maxDeals) : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setResult(await res.json());
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Capital Allocation Optimizer</CardTitle>
        <CardDescription className="text-xs">
          Enter available equity to see optimal deployment across pipeline deals
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Available Equity ($)</Label>
            <Input
              type="number"
              placeholder="e.g. 2000000"
              value={equity}
              onChange={(e) => setEquity(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="w-24 space-y-1">
            <Label className="text-xs">Max Deals</Label>
            <Input
              type="number"
              placeholder="All"
              value={maxDeals}
              onChange={(e) => setMaxDeals(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              onClick={handleOptimize}
              disabled={loading || !equity}
              className="h-8 gap-1 text-xs"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <DollarSign className="h-3 w-3" />
              )}
              Optimize
            </Button>
          </div>
        </div>

        {result && (
          <>
            <div className="flex gap-4 rounded-lg bg-muted p-3 text-xs">
              <div>
                <span className="text-muted-foreground">Allocated:</span>{" "}
                <span className="font-semibold">
                  {formatCurrency(result.allocatedEquity)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Unallocated:</span>{" "}
                <span className="font-semibold">
                  {formatCurrency(result.unallocatedEquity)}
                </span>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Deal</TableHead>
                    <TableHead className="text-right text-xs">Equity</TableHead>
                    <TableHead className="text-right text-xs">IRR</TableHead>
                    <TableHead className="text-right text-xs">Score</TableHead>
                    <TableHead className="text-center text-xs">Pick</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.candidates.slice(0, 15).map((c) => (
                    <TableRow
                      key={c.dealId}
                      className={c.recommended ? "bg-emerald-50/50" : ""}
                    >
                      <TableCell className="text-xs font-medium">
                        {c.dealName}
                        <Badge variant="outline" className="ml-1 text-[9px]">
                          {c.sku.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatCurrency(c.equityRequired)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {c.projectedIRR !== null
                          ? `${c.projectedIRR.toFixed(1)}%`
                          : "--"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {c.riskAdjustedScore}
                      </TableCell>
                      <TableCell className="text-center">
                        {c.recommended ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-600" />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            --
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
