"use client";

import { useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { useFinancialModelStore } from "@/stores/financialModelStore";

// Debounced numeric input that fires onChange after 300ms
function NumericInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localRef = useRef<string>(String(value));

  useEffect(() => {
    localRef.current = String(value);
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      localRef.current = raw;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) {
          onChange(parsed);
        }
      }, 300);
    },
    [onChange]
  );

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        {prefix && (
          <span className="text-xs text-muted-foreground">{prefix}</span>
        )}
        <Input
          type="number"
          defaultValue={value}
          onChange={handleChange}
          step={step ?? 1}
          min={min}
          max={max}
          className="h-8 text-sm"
        />
        {suffix && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
      {title}
    </h3>
  );
}

export function AssumptionsPanel() {
  const {
    assumptions,
    updateAcquisition,
    updateIncome,
    updateExpenses,
    updateFinancing,
    updateExit,
    updateBuildableSf,
    resetToDefaults,
  } = useFinancialModelStore();

  return (
    <div className="space-y-1 overflow-y-auto pr-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Assumptions</h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={resetToDefaults}
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>

      {/* Buildable SF */}
      <NumericInput
        label="Buildable SF"
        value={assumptions.buildableSf}
        onChange={(v) => updateBuildableSf(v)}
        suffix="SF"
        step={1000}
        min={0}
      />

      {/* Acquisition */}
      <SectionHeader title="Acquisition" />
      <NumericInput
        label="Purchase Price"
        value={assumptions.acquisition.purchasePrice}
        onChange={(v) => updateAcquisition({ purchasePrice: v })}
        prefix="$"
        step={10000}
        min={0}
      />
      <NumericInput
        label="Closing Costs"
        value={assumptions.acquisition.closingCostsPct}
        onChange={(v) => updateAcquisition({ closingCostsPct: v })}
        suffix="%"
        step={0.25}
        min={0}
        max={10}
      />
      <NumericInput
        label="Earnest Money"
        value={assumptions.acquisition.earnestMoney}
        onChange={(v) => updateAcquisition({ earnestMoney: v })}
        prefix="$"
        step={5000}
        min={0}
      />

      {/* Income */}
      <SectionHeader title="Income" />
      <NumericInput
        label="Rent / SF"
        value={assumptions.income.rentPerSf}
        onChange={(v) => updateIncome({ rentPerSf: v })}
        prefix="$"
        suffix="/SF/yr"
        step={0.25}
        min={0}
      />
      <NumericInput
        label="Vacancy"
        value={assumptions.income.vacancyPct}
        onChange={(v) => updateIncome({ vacancyPct: v })}
        suffix="%"
        step={0.5}
        min={0}
        max={100}
      />
      <NumericInput
        label="Rent Growth"
        value={assumptions.income.rentGrowthPct}
        onChange={(v) => updateIncome({ rentGrowthPct: v })}
        suffix="%/yr"
        step={0.25}
        min={-10}
        max={20}
      />
      <NumericInput
        label="Other Income"
        value={assumptions.income.otherIncome}
        onChange={(v) => updateIncome({ otherIncome: v })}
        prefix="$"
        suffix="/yr"
        step={1000}
        min={0}
      />

      {/* Expenses */}
      <SectionHeader title="Expenses" />
      <NumericInput
        label="OpEx / SF"
        value={assumptions.expenses.opexPerSf}
        onChange={(v) => updateExpenses({ opexPerSf: v })}
        prefix="$"
        suffix="/SF/yr"
        step={0.25}
        min={0}
      />
      <NumericInput
        label="Management Fee"
        value={assumptions.expenses.managementFeePct}
        onChange={(v) => updateExpenses({ managementFeePct: v })}
        suffix="%"
        step={0.5}
        min={0}
        max={15}
      />
      <NumericInput
        label="CapEx Reserves"
        value={assumptions.expenses.capexReserves}
        onChange={(v) => updateExpenses({ capexReserves: v })}
        prefix="$"
        suffix="/SF/yr"
        step={0.05}
        min={0}
      />
      <NumericInput
        label="Insurance"
        value={assumptions.expenses.insurance}
        onChange={(v) => updateExpenses({ insurance: v })}
        prefix="$"
        suffix="/SF/yr"
        step={0.1}
        min={0}
      />
      <NumericInput
        label="Taxes"
        value={assumptions.expenses.taxes}
        onChange={(v) => updateExpenses({ taxes: v })}
        prefix="$"
        suffix="/SF/yr"
        step={0.1}
        min={0}
      />

      {/* Financing */}
      <SectionHeader title="Financing" />
      <NumericInput
        label="LTV"
        value={assumptions.financing.ltvPct}
        onChange={(v) => updateFinancing({ ltvPct: v })}
        suffix="%"
        step={5}
        min={0}
        max={95}
      />
      <NumericInput
        label="Interest Rate"
        value={assumptions.financing.interestRate}
        onChange={(v) => updateFinancing({ interestRate: v })}
        suffix="%"
        step={0.125}
        min={0}
        max={25}
      />
      <NumericInput
        label="Amortization"
        value={assumptions.financing.amortizationYears}
        onChange={(v) => updateFinancing({ amortizationYears: v })}
        suffix="yrs"
        step={1}
        min={1}
        max={40}
      />
      <NumericInput
        label="IO Period"
        value={assumptions.financing.ioPeriodYears}
        onChange={(v) => updateFinancing({ ioPeriodYears: v })}
        suffix="yrs"
        step={1}
        min={0}
        max={10}
      />
      <NumericInput
        label="Loan Fees"
        value={assumptions.financing.loanFeePct}
        onChange={(v) => updateFinancing({ loanFeePct: v })}
        suffix="%"
        step={0.25}
        min={0}
        max={5}
      />

      {/* Exit */}
      <SectionHeader title="Exit" />
      <NumericInput
        label="Hold Period"
        value={assumptions.exit.holdYears}
        onChange={(v) => updateExit({ holdYears: Math.max(1, Math.min(30, Math.round(v))) })}
        suffix="yrs"
        step={1}
        min={1}
        max={30}
      />
      <NumericInput
        label="Exit Cap Rate"
        value={assumptions.exit.exitCapRate}
        onChange={(v) => updateExit({ exitCapRate: v })}
        suffix="%"
        step={0.25}
        min={1}
        max={20}
      />
      <NumericInput
        label="Disposition Costs"
        value={assumptions.exit.dispositionCostsPct}
        onChange={(v) => updateExit({ dispositionCostsPct: v })}
        suffix="%"
        step={0.25}
        min={0}
        max={10}
      />
    </div>
  );
}
