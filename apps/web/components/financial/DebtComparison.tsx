"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import type { ProFormaResults } from "@/hooks/useProFormaCalculations";
import {
  analyzeLoans,
  type LoanStructure,
  type LoanAnalysis,
  type PrepaymentType,
} from "@/hooks/useDebtComparison";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmt(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pctFmt(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Default loan
// ---------------------------------------------------------------------------

function createDefaultLoan(name: string): LoanStructure {
  return {
    id: crypto.randomUUID(),
    name,
    rateType: "fixed",
    ratePct: 6.5,
    spreadBps: 250,
    ioMonths: 0,
    amortizationYears: 25,
    termYears: 10,
    originationFeePct: 1.0,
    prepaymentType: "none",
    stepDownSchedule: [5, 4, 3, 2, 1],
  };
}

const PREPAY_LABELS: Record<PrepaymentType, string> = {
  none: "None",
  yield_maintenance: "Yield Maintenance",
  defeasance: "Defeasance",
  step_down: "Step-Down",
};

// ---------------------------------------------------------------------------
// Loan Editor card
// ---------------------------------------------------------------------------

function LoanEditor({
  loan,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  loan: LoanStructure;
  index: number;
  onChange: (l: LoanStructure) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const update = (field: string, value: string | number) => {
    onChange({ ...loan, [field]: value });
  };

  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Input
            value={loan.name}
            onChange={(e) => update("name", e.target.value)}
            className="h-7 text-sm font-semibold max-w-[180px]"
          />
          {canRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-destructive"
              onClick={onRemove}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {/* Rate type */}
        <div className="space-y-1">
          <Label className="text-xs">Rate Type</Label>
          <Select
            value={loan.rateType}
            onValueChange={(v) => update("rateType", v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="floating">Floating</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Rate */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">
              {loan.rateType === "floating" ? "Index Rate" : "Interest Rate"}
            </Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={loan.ratePct}
                onChange={(e) => update("ratePct", parseFloat(e.target.value) || 0)}
                step={0.125}
                min={0}
                max={25}
                className="h-7 text-xs"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          {loan.rateType === "floating" && (
            <div className="space-y-1">
              <Label className="text-xs">Spread</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={loan.spreadBps}
                  onChange={(e) => update("spreadBps", parseFloat(e.target.value) || 0)}
                  step={25}
                  min={0}
                  max={1000}
                  className="h-7 text-xs"
                />
                <span className="text-xs text-muted-foreground">bps</span>
              </div>
            </div>
          )}
        </div>

        {/* IO & Amort */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">IO Period</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={loan.ioMonths}
                onChange={(e) => update("ioMonths", parseInt(e.target.value) || 0)}
                step={6}
                min={0}
                max={120}
                className="h-7 text-xs"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">mos</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amortization</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={loan.amortizationYears}
                onChange={(e) => update("amortizationYears", parseInt(e.target.value) || 0)}
                step={5}
                min={1}
                max={40}
                className="h-7 text-xs"
              />
              <span className="text-xs text-muted-foreground">yrs</span>
            </div>
          </div>
        </div>

        {/* Term & Fees */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Loan Term</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={loan.termYears}
                onChange={(e) => update("termYears", parseInt(e.target.value) || 0)}
                step={1}
                min={1}
                max={30}
                className="h-7 text-xs"
              />
              <span className="text-xs text-muted-foreground">yrs</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Origination Fee</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={loan.originationFeePct}
                onChange={(e) => update("originationFeePct", parseFloat(e.target.value) || 0)}
                step={0.25}
                min={0}
                max={5}
                className="h-7 text-xs"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        {/* Prepayment */}
        <div className="space-y-1">
          <Label className="text-xs">Prepayment Penalty</Label>
          <Select
            value={loan.prepaymentType}
            onValueChange={(v) => update("prepaymentType", v as PrepaymentType)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PREPAY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Step-down schedule */}
        {loan.prepaymentType === "step_down" && (
          <div className="space-y-1">
            <Label className="text-xs">Step-Down Schedule (% per year)</Label>
            <div className="flex gap-1 flex-wrap">
              {loan.stepDownSchedule.map((pct, i) => (
                <div key={i} className="flex items-center gap-0.5">
                  <span className="text-[10px] text-muted-foreground">Y{i + 1}:</span>
                  <Input
                    type="number"
                    value={pct}
                    onChange={(e) => {
                      const schedule = [...loan.stepDownSchedule];
                      schedule[i] = parseFloat(e.target.value) || 0;
                      onChange({ ...loan, stepDownSchedule: schedule });
                    }}
                    step={1}
                    min={0}
                    max={10}
                    className="h-6 text-[10px] w-12"
                  />
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-1"
                onClick={() => {
                  onChange({
                    ...loan,
                    stepDownSchedule: [...loan.stepDownSchedule, 0],
                  });
                }}
              >
                <Plus className="h-2.5 w-2.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DebtComparison({
  dealId,
  proForma,
}: {
  dealId: string;
  proForma: ProFormaResults;
}) {
  const [loans, setLoans] = useState<LoanStructure[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loanAmount = proForma.acquisitionBasis.loanAmount;
  const holdYears = proForma.annualCashFlows.length;

  // Load from API
  useEffect(() => {
    if (!dealId) return;
    fetch(`/api/deals/${dealId}/debt-comparison`)
      .then((r) => r.json())
      .then((data) => {
        const saved = (data.loans as LoanStructure[]) ?? [];
        if (saved.length > 0) {
          setLoans(saved);
        } else {
          setLoans([
            createDefaultLoan("Bank Loan"),
            createDefaultLoan("CMBS"),
          ]);
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoans([
          createDefaultLoan("Bank Loan"),
          createDefaultLoan("CMBS"),
        ]);
        setLoaded(true);
      });
  }, [dealId]);

  // Persist
  const persist = useCallback(
    async (updated: LoanStructure[]) => {
      try {
        await fetch(`/api/deals/${dealId}/debt-comparison`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loans: updated }),
        });
      } catch {
        toast.error("Failed to save loan structures");
      }
    },
    [dealId]
  );

  const handleUpdate = useCallback(
    (idx: number, updated: LoanStructure) => {
      setLoans((prev) => {
        // For floating rate, effective rate = index + spread
        if (updated.rateType === "floating") {
          updated = {
            ...updated,
            ratePct: updated.ratePct, // index rate stays as entered
          };
        }
        const next = [...prev];
        next[idx] = updated;
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const handleAdd = useCallback(() => {
    if (loans.length >= 4) {
      toast.error("Maximum 4 loan structures");
      return;
    }
    const names = ["Loan A", "Loan B", "Loan C", "Loan D"];
    const name = names[loans.length] ?? `Loan ${loans.length + 1}`;
    setLoans((prev) => {
      const next = [...prev, createDefaultLoan(name)];
      persist(next);
      return next;
    });
  }, [loans.length, persist]);

  const handleRemove = useCallback(
    (idx: number) => {
      setLoans((prev) => {
        const next = prev.filter((_, i) => i !== idx);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  // Compute effective rates for floating loans
  const effectiveLoans = loans.map((l) => {
    if (l.rateType === "floating") {
      return { ...l, ratePct: l.ratePct + l.spreadBps / 100 };
    }
    return l;
  });

  // Analyze
  const analyses: LoanAnalysis[] = loaded
    ? analyzeLoans(effectiveLoans, loanAmount, holdYears)
    : [];

  if (!loaded) return null;

  return (
    <div className="space-y-4">
      {/* Loan amount context */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Loan Amount: <span className="font-semibold text-foreground">{fmt(loanAmount)}</span>
          {" | "}Hold Period: <span className="font-semibold text-foreground">{holdYears} years</span>
        </div>
        {loans.length < 4 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleAdd}
          >
            <Plus className="h-3 w-3" />
            Add Loan
          </Button>
        )}
      </div>

      {/* Loan editors */}
      <div className={`grid gap-3 ${
        loans.length === 1 ? "grid-cols-1" :
        loans.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
        loans.length === 3 ? "grid-cols-1 sm:grid-cols-3" :
        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      }`}>
        {loans.map((loan, idx) => (
          <LoanEditor
            key={loan.id}
            loan={loan}
            index={idx}
            onChange={(l) => handleUpdate(idx, l)}
            onRemove={() => handleRemove(idx)}
            canRemove={loans.length > 1}
          />
        ))}
      </div>

      {/* Comparison summary table */}
      {analyses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Comparison Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Metric</TableHead>
                  {analyses.map((a) => (
                    <TableHead key={a.loan.id} className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {a.isOptimal && (
                          <Trophy className="h-3 w-3 text-yellow-500" />
                        )}
                        <span className={a.isOptimal ? "font-bold" : ""}>
                          {a.loan.name}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Loan Amount</TableCell>
                  {analyses.map((a) => (
                    <TableCell key={a.loan.id} className="text-center tabular-nums">
                      {fmt(a.loanAmount)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Contract Rate</TableCell>
                  {analyses.map((a) => (
                    <TableCell key={a.loan.id} className="text-center tabular-nums">
                      {a.loan.rateType === "floating"
                        ? `${loans.find((l) => l.id === a.loan.id)?.ratePct.toFixed(2)}% + ${loans.find((l) => l.id === a.loan.id)?.spreadBps}bps`
                        : `${a.loan.ratePct.toFixed(2)}%`}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Effective All-In Rate</TableCell>
                  {analyses.map((a) => (
                    <TableCell
                      key={a.loan.id}
                      className={`text-center tabular-nums ${a.isOptimal ? "font-bold text-green-600" : ""}`}
                    >
                      {pctFmt(a.effectiveRate)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Origination Fees</TableCell>
                  {analyses.map((a) => (
                    <TableCell key={a.loan.id} className="text-center tabular-nums">
                      {fmt(a.originationFees)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">IO Debt Service (annual)</TableCell>
                  {analyses.map((a) => (
                    <TableCell key={a.loan.id} className="text-center tabular-nums">
                      {a.loan.ioMonths > 0 ? fmt(a.ioDebtService) : "—"}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Amort Debt Service (annual)</TableCell>
                  {analyses.map((a) => (
                    <TableCell key={a.loan.id} className="text-center tabular-nums">
                      {fmt(a.amortizingDebtService)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Avg Annual DS</TableCell>
                  {analyses.map((a) => (
                    <TableCell key={a.loan.id} className="text-center tabular-nums">
                      {fmt(a.avgAnnualDebtService)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    Total Interest ({holdYears}yr)
                  </TableCell>
                  {analyses.map((a) => (
                    <TableCell key={a.loan.id} className="text-center tabular-nums">
                      {fmt(a.totalInterestCost)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Prepayment Type</TableCell>
                  {analyses.map((a) => (
                    <TableCell key={a.loan.id} className="text-center text-xs">
                      {PREPAY_LABELS[a.loan.prepaymentType]}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">
                    Total Cost at Exit (Y{holdYears})
                  </TableCell>
                  {analyses.map((a) => (
                    <TableCell
                      key={a.loan.id}
                      className={`text-center tabular-nums font-semibold ${
                        a.isOptimal ? "text-green-600" : ""
                      }`}
                    >
                      {fmt(a.totalCostAtHold)}
                      {a.isOptimal && (
                        <span className="block text-[10px] text-green-600 font-normal">
                          Lowest Cost
                        </span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Prepayment penalty schedule */}
      {analyses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Prepayment Cost by Exit Year
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Exit Year</TableHead>
                  {analyses.map((a) => (
                    <TableHead key={a.loan.id} className="text-center">
                      {a.loan.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(
                  { length: Math.max(...analyses.map((a) => a.loan.termYears)) },
                  (_, i) => i + 1
                ).map((year) => (
                  <TableRow
                    key={year}
                    className={year === holdYears ? "bg-primary/5 font-medium" : ""}
                  >
                    <TableCell className="font-medium">
                      {year}
                      {year === holdYears && (
                        <span className="ml-1 text-[10px] text-primary">(hold)</span>
                      )}
                    </TableCell>
                    {analyses.map((a) => {
                      const detail = a.yearlyDetails[year - 1];
                      if (!detail || year > a.loan.termYears) {
                        return (
                          <TableCell key={a.loan.id} className="text-center text-xs text-muted-foreground">
                            —
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell key={a.loan.id} className="text-center tabular-nums">
                          <div>{fmt(detail.prepaymentPenalty)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            Bal: {fmt(detail.endingBalance)}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
