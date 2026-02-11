"use client";

import { useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, Check } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AssumptionsPanel } from "@/components/financial/AssumptionsPanel";
import { ResultsDashboard } from "@/components/financial/ResultsDashboard";
import { SensitivityTable } from "@/components/financial/SensitivityTable";
import { TornadoChart } from "@/components/financial/TornadoChart";
import { ScenarioManager } from "@/components/financial/ScenarioManager";
import { useFinancialModelStore, DEFAULT_ASSUMPTIONS, type FinancialModelAssumptions } from "@/stores/financialModelStore";
import { useProFormaCalculations } from "@/hooks/useProFormaCalculations";
import { toast } from "sonner";

export default function FinancialModelPage() {
  const params = useParams<{ id: string }>();
  const dealId = params?.id ?? "";

  const {
    assumptions,
    dirty,
    saving,
    loaded,
    setDealId,
    setAssumptions,
    setSaving,
    markClean,
  } = useFinancialModelStore();

  const results = useProFormaCalculations(assumptions);
  const dealNameRef = useRef<string>("");

  // Load saved assumptions from API
  useEffect(() => {
    if (!dealId) return;
    setDealId(dealId);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/deals/${dealId}/financial-model`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (cancelled) return;

        dealNameRef.current = data.deal?.name ?? "";

        if (data.assumptions) {
          // Merge saved assumptions with defaults to handle any missing fields
          setAssumptions({
            ...DEFAULT_ASSUMPTIONS,
            ...data.assumptions,
            acquisition: { ...DEFAULT_ASSUMPTIONS.acquisition, ...data.assumptions.acquisition },
            income: { ...DEFAULT_ASSUMPTIONS.income, ...data.assumptions.income },
            expenses: { ...DEFAULT_ASSUMPTIONS.expenses, ...data.assumptions.expenses },
            financing: { ...DEFAULT_ASSUMPTIONS.financing, ...data.assumptions.financing },
            exit: { ...DEFAULT_ASSUMPTIONS.exit, ...data.assumptions.exit },
          });
        } else {
          // No saved assumptions — use defaults, potentially seeded with deal acreage
          const sf = data.deal?.totalAcreage
            ? Math.round(data.deal.totalAcreage * 43560 * 0.45) // 45% coverage ratio
            : DEFAULT_ASSUMPTIONS.buildableSf;
          setAssumptions({ ...DEFAULT_ASSUMPTIONS, buildableSf: sf });
        }
      } catch {
        toast.error("Failed to load financial model");
        setAssumptions({ ...DEFAULT_ASSUMPTIONS });
      }
    })();

    return () => { cancelled = true; };
  }, [dealId, setDealId, setAssumptions]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!dealId || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/financial-model`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assumptions }),
      });
      if (!res.ok) throw new Error("Failed to save");
      markClean();
      toast.success("Financial model saved");
    } catch {
      toast.error("Failed to save financial model");
    } finally {
      setSaving(false);
    }
  }, [dealId, saving, assumptions, setSaving, markClean]);

  // Auto-save on dirty after 2 seconds of inactivity
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty || !loaded) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleSave();
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [dirty, loaded, handleSave]);

  // Load a scenario into the assumptions panel
  const handleLoadScenario = useCallback(
    (scenarioAssumptions: FinancialModelAssumptions) => {
      setAssumptions({
        ...DEFAULT_ASSUMPTIONS,
        ...scenarioAssumptions,
        acquisition: { ...DEFAULT_ASSUMPTIONS.acquisition, ...scenarioAssumptions.acquisition },
        income: { ...DEFAULT_ASSUMPTIONS.income, ...scenarioAssumptions.income },
        expenses: { ...DEFAULT_ASSUMPTIONS.expenses, ...scenarioAssumptions.expenses },
        financing: { ...DEFAULT_ASSUMPTIONS.financing, ...scenarioAssumptions.financing },
        exit: { ...DEFAULT_ASSUMPTIONS.exit, ...scenarioAssumptions.exit },
      });
    },
    [setAssumptions]
  );

  if (!loaded) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/deals/${dealId}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold">
                Pro Forma{dealNameRef.current ? ` — ${dealNameRef.current}` : ""}
              </h1>
              <p className="text-xs text-muted-foreground">
                Interactive financial model with sensitivity analysis and scenarios
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : dirty ? (
              <Save className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving..." : dirty ? "Save" : "Saved"}
          </Button>
        </div>

        {/* Two-panel layout */}
        <div className="flex gap-4 min-h-0 flex-1">
          {/* Left: Assumptions */}
          <div className="w-72 shrink-0 overflow-y-auto border rounded-lg p-3">
            <AssumptionsPanel />
          </div>

          {/* Right: Tabbed results */}
          <div className="flex-1 overflow-y-auto">
            <Tabs defaultValue="returns">
              <TabsList className="mb-3">
                <TabsTrigger value="returns">Returns</TabsTrigger>
                <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
                <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
              </TabsList>

              <TabsContent value="returns">
                <ResultsDashboard results={results} />
              </TabsContent>

              <TabsContent value="sensitivity">
                <div className="space-y-4">
                  <SensitivityTable assumptions={assumptions} />
                  <TornadoChart assumptions={assumptions} />
                </div>
              </TabsContent>

              <TabsContent value="scenarios">
                <ScenarioManager
                  dealId={dealId}
                  currentAssumptions={assumptions}
                  onLoadScenario={handleLoadScenario}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
