"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import * as Sentry from "@sentry/nextjs";
import useSWR from "swr";
import {
  ArrowLeft,
  Loader2,
  Plus,
  MessageSquare,
  Calculator,
  PencilLine,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DealOverviewWorkspace } from "@/components/deals/DealOverviewWorkspace";
import { DealCommentsPanel } from "@/components/deals/DealCommentsPanel";
import { DealContingenciesPanel } from "@/components/deals/DealContingenciesPanel";
import { DealAssetManagementPanel } from "@/components/deals/DealAssetManagementPanel";
import { DealFitScoreCard } from "@/components/deals/DealFitScoreCard";
import { DealWorkflowsPanel } from "@/components/deals/DealWorkflowsPanel";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { SkuBadge } from "@/components/deals/SkuBadge";
import { TriageIndicator } from "@/components/deals/TriageIndicator";
import { PipelineBoard } from "@/components/deals/PipelineBoard";
import { ParcelTable, type ParcelItem } from "@/components/deals/ParcelTable";
import { ArtifactList, type ArtifactItem } from "@/components/deals/ArtifactList";
import { FileUploadZone, type UploadItem } from "@/components/deals/FileUploadZone";
import { UploadList } from "@/components/deals/UploadList";
import {
  DocumentExtractionReview,
  ExtractionPendingBadge,
  ExtractionStatusSummary,
} from "@/components/deals/DocumentExtractionReview";
import { EnvironmentalAssessmentsPanel } from "@/components/deals/EnvironmentalAssessmentsPanel";
import { DealFinancingPanel } from "@/components/deals/DealFinancingPanel";
import { RunTriageButton } from "@/components/deals/RunTriageButton";
import { TaskCreateForm } from "@/components/deals/TaskCreateForm";
import type { TaskItem } from "@/components/deals/TaskCard";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

function captureDealClientError(error: unknown, context: string) {
  Sentry.captureException(error instanceof Error ? error : new Error(context), {
    tags: {
      surface: "deal-detail",
      context,
    },
  });
}

const DealParcelMap = dynamic(
  () => import("@/components/maps/DealParcelMap"),
  { ssr: false }
);
const CollaborativeMemo = dynamic(
  () => import("@/components/deal-room/CollaborativeMemo").then((m) => m.CollaborativeMemo),
  {
    ssr: false,
    loading: () => (
      <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
        Loading collaboration editor...
      </div>
    ),
  },
);

interface DealDetail {
  id: string;
  name: string;
  sku: string;
  status: string;
  assetClass?: string | null;
  strategy?: string | null;
  workflowTemplateKey?: string | null;
  currentStageKey?: string | null;
  notes?: string | null;
  targetCloseDate?: string | null;
  createdAt: string;
  updatedAt: string;
  dealSourceType?: string | null;
  triageTier?: string | null;
  triageOutput?: Record<string, unknown> | null;
  workflowTemplate?: {
    id: string;
    key: string;
    name: string;
    description?: string | null;
    stages: Array<{
      id: string;
      key: string;
      name: string;
      ordinal: number;
      description?: string | null;
      requiredGate?: string | null;
    }>;
  } | null;
  stageHistory: Array<{
    id: string;
    fromStageKey: string | null;
    toStageKey: string;
    changedAt: string;
    note?: string | null;
  }>;
  generalizedScorecards: Array<{
    id: string;
    module: string;
    dimension: string;
    score: number;
    weight: number | null;
    evidence: string | null;
    scoredAt: string;
  }>;
  jurisdiction?: { id: string; name: string; kind: string; state: string } | null;
  parcels: ParcelItem[];
  tasks: TaskItem[];
  artifacts: ArtifactItem[];
  uploads: UploadItem[];
  packContext?: {
    hasPack: boolean;
    isStale: boolean;
    stalenessDays: number | null;
    missingEvidence: string[];
  };
}

interface DealTerms {
  id: string;
  orgId: string;
  dealId: string;
  offerPrice: string | number | null;
  earnestMoney: string | number | null;
  closingDate: string | null;
  titleCompany: string | null;
  dueDiligenceDays: number | null;
  financingContingencyDays: number | null;
  loiSignedAt: string | null;
  psaSignedAt: string | null;
  titleReviewDue: string | null;
  surveyDue: string | null;
  environmentalDue: string | null;
  sellerContact: string | null;
  brokerContact: string | null;
}

interface DealEntitlementPath {
  id: string;
  orgId: string;
  dealId: string;
  recommendedStrategy: string | null;
  preAppMeetingDate: string | null;
  preAppMeetingNotes: string | null;
  applicationType: string | null;
  applicationSubmittedDate: string | null;
  applicationNumber: string | null;
  publicNoticeDate: string | null;
  publicNoticePeriodDays: number | null;
  hearingScheduledDate: string | null;
  hearingBody: string | null;
  hearingNotes: string | null;
  decisionDate: string | null;
  decisionType: string | null;
  conditions: string[];
  appealDeadline: string | null;
  appealFiled: boolean | null;
  conditionComplianceStatus: string | null;
}

interface DealPropertyTitle {
  id: string;
  orgId: string;
  dealId: string;
  titleInsuranceReceived: boolean | null;
  exceptions: string[];
  liens: string[];
  easements: string[];
}

interface DealPropertySurvey {
  id: string;
  orgId: string;
  dealId: string;
  surveyCompletedDate: string | null;
  acreageConfirmed: string | number | null;
  encroachments: string[];
  setbacks: Record<string, unknown>;
}

interface DealBuyer {
  id: string;
  name: string;
  company?: string | null;
  buyerType?: string | null;
  email?: string | null;
  phone?: string | null;
  deals?: Array<{
    id: string;
    name: string;
    status: string;
    sku: string;
    jurisdiction?: {
      id: string;
      name: string;
      kind: string;
      state: string;
    } | null;
  }>;
}

/**
 * Client controller for the interactive deal detail route.
 */
export function DealDetailPageClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTab = searchParams?.get("tab") ?? "overview";
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [triageResult, setTriageResult] = useState<Record<string, unknown> | null>(null);
  const [triageSources, setTriageSources] = useState<{ url: string; title?: string }[]>([]);
  const [buyerSearch, setBuyerSearch] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerCompany, setBuyerCompany] = useState("");
  const [buyerType, setBuyerType] = useState("BUYER");
  const [isCreatingBuyer, setIsCreatingBuyer] = useState(false);
  const buyerQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (buyerSearch.trim()) {
      params.set("search", buyerSearch.trim());
    }
    params.set("dealId", id);
    params.set("withDeals", "true");
    return `/api/buyers?${params.toString()}`;
  }, [buyerSearch, id]);

  const { data: buyersResponse, mutate: mutateBuyers } = useSWR<{ buyers: DealBuyer[] }>(
    buyerQuery,
    fetcher
  );
  const buyers = buyersResponse?.buyers ?? [];

  // Add-parcel form state
  const [parcelAddress, setParcelAddress] = useState("");
  const [parcelApn, setParcelApn] = useState("");
  const [addingParcel, setAddingParcel] = useState(false);
  const termsFetcher = useSWR<{ terms: DealTerms | null }>(
    id ? `/api/deals/${id}/terms` : null,
    fetcher
  );
  const entitlementFetcher = useSWR<{ entitlementPath: DealEntitlementPath | null }>(
    id ? `/api/deals/${id}/entitlement-path` : null,
    fetcher
  );
  const propertyTitleFetcher = useSWR<{ propertyTitle: DealPropertyTitle | null }>(
    id ? `/api/deals/${id}/property-title` : null,
    fetcher
  );
  const propertySurveyFetcher = useSWR<{ propertySurvey: DealPropertySurvey | null }>(
    id ? `/api/deals/${id}/property-survey` : null,
    fetcher
  );
  const terms = termsFetcher.data?.terms ?? null;
  const entitlementPath = entitlementFetcher.data?.entitlementPath ?? null;
  const propertyTitle = propertyTitleFetcher.data?.propertyTitle ?? null;
  const propertySurvey = propertySurveyFetcher.data?.propertySurvey ?? null;

  const inboundEmailFetcher = useSWR<{ email: { id: string; subject: string; fromAddress: string; receivedAt: string } | null }>(
    id && deal?.dealSourceType === "BROKER"
      ? `/api/deals/${id}/inbound-email`
      : null,
    fetcher,
  );
  const linkedInboundEmail = inboundEmailFetcher.data?.email ?? null;

  const formatCurrencyValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    const numberValue = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(numberValue)) return "—";
    return formatCurrency(numberValue);
  };

  const loadDeal = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch(`/api/deals/${id}`);
      if (!res.ok) throw new Error("Failed to load deal");
      const data = await res.json();
      setDeal(data.deal);
      if (data.deal.triageOutput) {
        setTriageResult(data.deal.triageOutput);
      }
    } catch (error) {
      captureDealClientError(error, "load-deal");
      setLoadError(true);
      toast.error("Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadDeal();
  }, [id, loadDeal]);

  const displayNotes = deal?.notes?.trim() ?? "";
  const hasGeneralizedScorecards = (deal?.generalizedScorecards?.length ?? 0) > 0;

  // Also load latest triage from dedicated endpoint
  useEffect(() => {
    if (!id) return;
    fetch(`/api/deals/${id}/triage`)
      .then((res) => res.json())
      .then((data) => {
        if (data.triage) setTriageResult(data.triage);
      })
      .catch((error) => {
        captureDealClientError(error, "load-latest-triage");
      });
  }, [id]);

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/deals/${id}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      setDeal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === taskId ? { ...t, status: newStatus } : t
          ),
        };
      });
    } catch (error) {
      captureDealClientError(error, "update-task-status");
      toast.error("Failed to update task");
    }
  };

  const handleTaskUpdate = async (
    taskId: string,
    updates: { title?: string; description?: string; status?: string; dueAt?: string | null }
  ) => {
    try {
      const res = await fetch(`/api/deals/${id}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      const data = await res.json();
      setDeal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === taskId ? { ...t, ...data.task } : t
          ),
        };
      });
      toast.success("Task updated");
    } catch (error) {
      captureDealClientError(error, "update-task");
      toast.error("Failed to update task");
    }
  };

  const handleAddParcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parcelAddress.trim()) return;

    setAddingParcel(true);
    try {
      const res = await fetch(`/api/deals/${id}/parcels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: parcelAddress.trim(),
          apn: parcelApn.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to add parcel");
      const data = await res.json();
      setDeal((prev) => {
        if (!prev) return prev;
        return { ...prev, parcels: [...prev.parcels, data.parcel] };
      });
      setParcelAddress("");
      setParcelApn("");
      toast.success("Parcel added");
    } catch (error) {
      captureDealClientError(error, "add-parcel");
      toast.error("Failed to add parcel");
    } finally {
      setAddingParcel(false);
    }
  };

  const handleDeleteDeal = async () => {
    if (!confirm("Are you sure you want to delete this deal? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/deals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete deal");
      toast.success("Deal deleted");
      router.push("/deals");
    } catch (error) {
      captureDealClientError(error, "delete-deal");
      toast.error("Failed to delete deal");
    }
  };

  const handleTabChange = (value: string) => {
    const nextParams = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    if (value === "overview") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", value);
    }
    const query = nextParams.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };

  const handleCreateBuyer = async () => {
    if (!buyerName.trim()) {
      toast.error("Buyer name is required");
      return;
    }

    setIsCreatingBuyer(true);
    try {
      const res = await fetch("/api/buyers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: buyerName.trim(),
          buyerType: buyerType.trim() || "BUYER",
          company: buyerCompany.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save buyer");
      toast.success("Buyer added");
      setBuyerName("");
      setBuyerCompany("");
      setBuyerType("BUYER");
      await mutateBuyers();
    } catch (error) {
      captureDealClientError(error, "create-buyer");
      toast.error(error instanceof Error ? error.message : "Failed to add buyer");
    } finally {
      setIsCreatingBuyer(false);
    }
  };

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  if (!deal) {
    return (
      <DashboardShell>
        <div className="py-20 text-center">
          <p className="text-muted-foreground">
            {loadError ? "Failed to load deal" : "Deal not found"}
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            {loadError && (
              <Button
                variant="outline"
                onClick={() => { setLoading(true); loadDeal(); }}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            )}
            <Button asChild>
              <Link href="/deals">Back to Deals</Link>
            </Button>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const openDeadlineCount = deal.tasks.filter(
    (task) => task.dueAt && task.status !== "DONE" && task.status !== "CANCELED",
  ).length;
  const urgentDeadlineCount = deal.tasks.filter((task) => {
    if (!task.dueAt || task.status === "DONE" || task.status === "CANCELED") {
      return false;
    }

    const hoursUntilDue = (new Date(task.dueAt).getTime() - Date.now()) / 3_600_000;
    return hoursUntilDue <= 72;
  }).length;
  const packState = !deal.packContext
    ? "Unknown"
    : !deal.packContext.hasPack
      ? "Missing"
      : deal.packContext.isStale
        ? "Stale"
        : "Current";
  const packDetail = !deal.packContext
    ? "Parish pack state is unavailable."
    : !deal.packContext.hasPack
      ? "No parish pack linked yet."
      : deal.packContext.isStale
        ? `${deal.packContext.stalenessDays ?? "?"} day stale`
        : "Pack is current.";
  const closingMetric = terms?.closingDate ?? deal.targetCloseDate;
  const fileSummary = [
    deal.jurisdiction ? `${deal.jurisdiction.name}, ${deal.jurisdiction.state}` : "Jurisdiction unassigned",
    `${deal.parcels.length} parcel${deal.parcels.length === 1 ? "" : "s"}`,
    `${deal.tasks.length} task${deal.tasks.length === 1 ? "" : "s"}`,
    `${deal.artifacts.length} artifact${deal.artifacts.length === 1 ? "" : "s"}`,
  ].join("  ·  ");

  return (
    <DashboardShell>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="workspace-page">
        <section className="border-b border-border/60 pb-4">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)] xl:items-end">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <Button variant="ghost" size="sm" asChild className="-ml-3 h-8 px-3 text-[11px]">
                  <Link href="/deals" className="gap-1 font-mono uppercase tracking-[0.18em]">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Deals
                  </Link>
                </Button>
                <span className="font-mono uppercase tracking-[0.18em]">Underwriting file</span>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SkuBadge sku={deal.sku} />
                  <StatusBadge status={deal.status} />
                  <TriageIndicator tier={deal.triageTier} showLabel />
                  {deal.packContext ? (
                    <Badge
                      variant={
                        !deal.packContext.hasPack || deal.packContext.isStale
                          ? "destructive"
                          : "secondary"
                      }
                      className="gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {!deal.packContext.hasPack
                        ? "No parish pack"
                        : deal.packContext.isStale
                          ? "Parish pack stale"
                          : "Parish pack current"}
                    </Badge>
                  ) : null}
                  {deal.dealSourceType === "BROKER" && linkedInboundEmail ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-primary/40 text-primary"
                      title={`From: ${linkedInboundEmail.fromAddress}\nSubject: ${linkedInboundEmail.subject}`}
                    >
                      <MessageSquare className="h-3 w-3" />
                      Originated from email
                    </Badge>
                  ) : null}
                </div>

                <div>
                  <h1 className="max-w-[14ch] text-4xl font-semibold tracking-[-0.06em] text-foreground md:text-[3.35rem]">
                    {deal.name}
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                    {fileSummary}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <RunTriageButton
                  dealId={deal.id}
                  hasParcels={deal.parcels.length > 0}
                  onComplete={({ triage, sources }) => {
                    setTriageResult(triage);
                    setTriageSources(sources);
                  }}
                />
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href={`/deals/${deal.id}/financial-model`}>
                    <Calculator className="h-4 w-4" />
                    Pro Forma
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href={`/?dealId=${deal.id}`}>
                    <MessageSquare className="h-4 w-4" />
                    Chat
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href={`/deals/${deal.id}/edit`}>
                    <PencilLine className="h-4 w-4" />
                    Edit
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={handleDeleteDeal}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>

            <div className="grid gap-3 border-t border-border/50 pt-4 md:grid-cols-2 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
              <div className="border-b border-border/45 pb-3 md:border-b-0 md:border-r md:pr-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Offer
                </p>
                <p className="mt-2 font-mono text-3xl font-semibold tracking-[-0.04em] tabular-nums text-foreground">
                  {formatCurrencyValue(terms?.offerPrice)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {terms?.earnestMoney
                    ? `Earnest money ${formatCurrencyValue(terms.earnestMoney)}`
                    : "Earnest money not entered"}
                </p>
              </div>

              <div className="border-b border-border/45 pb-3 md:border-b-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Close
                </p>
                <p className="mt-2 font-mono text-3xl font-semibold tracking-[-0.04em] tabular-nums text-foreground">
                  {closingMetric ? formatDate(closingMetric) : "—"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {terms?.dueDiligenceDays
                    ? `${terms.dueDiligenceDays} due diligence days`
                    : "Closing schedule not fully set"}
                </p>
              </div>

              <div className="md:border-r md:pr-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Deadlines
                </p>
                <p
                  className={`mt-2 font-mono text-3xl font-semibold tracking-[-0.04em] tabular-nums ${
                    urgentDeadlineCount > 0
                      ? "text-destructive"
                      : openDeadlineCount > 0
                        ? "text-foreground"
                        : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {openDeadlineCount}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {urgentDeadlineCount > 0
                    ? `${urgentDeadlineCount} due in the next 72 hours`
                    : openDeadlineCount > 0
                      ? "Open dated tasks are in range"
                      : "No dated tasks are blocking the file"}
                </p>
              </div>

              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Pack
                </p>
                <p
                  className={`mt-2 text-3xl font-semibold tracking-[-0.04em] ${
                    packState === "Current"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : packState === "Unknown"
                        ? "text-foreground"
                        : "text-destructive"
                  }`}
                >
                  {packState}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{packDetail}</p>
              </div>
            </div>
          </div>

          <TabsList className="mt-6 w-full justify-start overflow-x-auto rounded-none border-b border-border/60 pb-0">
            <TabsTrigger value="overview" className="text-xs tracking-[0.08em]">
              Overview
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs tracking-[0.08em]">
              Documents ({deal.uploads?.length ?? 0})
              <ExtractionPendingBadge dealId={deal.id} />
            </TabsTrigger>
            <TabsTrigger value="parcels" className="text-xs tracking-[0.08em]">
              Parcels ({deal.parcels.length})
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs tracking-[0.08em]">
              Tasks ({deal.tasks.length})
            </TabsTrigger>
            <TabsTrigger value="artifacts" className="text-xs tracking-[0.08em]">
              Artifacts ({deal.artifacts.length})
            </TabsTrigger>
            <TabsTrigger value="contingencies" className="text-xs tracking-[0.08em]">
              Contingencies
            </TabsTrigger>
            <TabsTrigger value="buyers" className="text-xs tracking-[0.08em]">Buyers</TabsTrigger>
            <TabsTrigger value="room" className="text-xs tracking-[0.08em]">Room</TabsTrigger>
            <TabsTrigger value="asset-mgmt" className="text-xs tracking-[0.08em]">Asset Mgmt</TabsTrigger>
          </TabsList>
        </section>

        <TabsContent value="overview" className="mt-0 space-y-4">
          <DealFitScoreCard dealId={deal.id} />
          <DealOverviewWorkspace
            deal={deal}
            terms={terms}
            entitlementPath={entitlementPath}
            propertyTitle={propertyTitle}
            propertySurvey={propertySurvey}
            triageResult={triageResult}
            triageSources={triageSources}
            hasGeneralizedScorecards={hasGeneralizedScorecards}
            displayNotes={displayNotes}
            onRunAction={async (action) => {
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + action.due_in_days);
              const res = await fetch(`/api/deals/${id}/tasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: action.title,
                  description: action.description,
                  pipelineStep: action.pipeline_step,
                  dueAt: dueDate.toISOString().slice(0, 10),
                }),
              });
              if (!res.ok) throw new Error("Failed to create task");
              const data = await res.json();
              setDeal((prev) =>
                prev ? { ...prev, tasks: [...prev.tasks, data.task] } : prev
              );
              return data.task.id;
            }}
            onTaskCompleted={(taskId, agentOutput) => {
              setDeal((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  tasks: prev.tasks.map((task) =>
                    task.id === taskId
                      ? {
                          ...task,
                          status: "DONE",
                          description:
                            (task.description ?? "") + "\n\n---\nAgent Findings:\n" + agentOutput,
                        }
                      : task,
                  ),
                };
              });
            }}
          />
        </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Documents</CardTitle>
                <CardDescription>
                  Upload and manage deal documents: title reports, environmental studies, surveys, financials, and legal files.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FileUploadZone
                  dealId={deal.id}
                  onUploadComplete={(upload) => {
                    setDeal((prev) =>
                      prev
                        ? { ...prev, uploads: [upload, ...(prev.uploads || [])] }
                        : prev
                    );
                  }}
                />
                <UploadList
                  dealId={deal.id}
                  uploads={deal.uploads || []}
                  onDelete={(uploadId) => {
                    setDeal((prev) =>
                      prev
                        ? {
                            ...prev,
                            uploads: (prev.uploads || []).filter(
                              (u) => u.id !== uploadId
                            ),
                          }
                        : prev
                    );
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Extracted Data</CardTitle>
                <CardDescription>
                  Structured data automatically extracted from uploaded documents. Review and confirm before applying to the deal.
                </CardDescription>
                <ExtractionStatusSummary dealId={deal.id} />
              </CardHeader>
              <CardContent>
                <DocumentExtractionReview dealId={deal.id} />
              </CardContent>
            </Card>

            <EnvironmentalAssessmentsPanel dealId={deal.id} />
            <DealFinancingPanel dealId={deal.id} />
          </TabsContent>

          {/* Parcels Tab */}
          <TabsContent value="parcels">
            <div className="space-y-4">
              <DealParcelMap parcels={deal.parcels} dealName={deal.name} dealStatus={deal.status} />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Parcels</CardTitle>
                  <CardDescription>
                    Land parcels associated with this deal.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ParcelTable
                    parcels={deal.parcels}
                    dealId={deal.id}
                    onParcelUpdated={(updated) => {
                      setDeal((prev) =>
                        prev
                          ? {
                              ...prev,
                              parcels: prev.parcels.map((p) =>
                                p.id === updated.id ? { ...p, ...updated } : p
                              ),
                            }
                          : prev
                      );
                    }}
                  />

                  <form
                    onSubmit={handleAddParcel}
                    className="flex flex-wrap items-end gap-3 border-t pt-4"
                  >
                    <div className="flex-1 min-w-[200px] space-y-1">
                      <label className="text-xs font-medium">Address</label>
                      <Input
                        value={parcelAddress}
                        onChange={(e) => setParcelAddress(e.target.value)}
                        placeholder="Parcel address"
                        required
                      />
                    </div>
                    <div className="w-[150px] space-y-1">
                      <label className="text-xs font-medium">APN (optional)</label>
                      <Input
                        value={parcelApn}
                        onChange={(e) => setParcelApn(e.target.value)}
                        placeholder="APN"
                      />
                    </div>
                    <Button type="submit" disabled={addingParcel} className="gap-1.5">
                      {addingParcel ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Add Parcel
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Pipeline Tasks</CardTitle>
                  <CardDescription>
                    Track progress through the 8-step entitlement pipeline. Click the status icon to cycle, or the pencil to edit.
                  </CardDescription>
                </div>
                <TaskCreateForm
                  dealId={deal.id}
                  onTaskCreated={(task) => {
                    setDeal((prev) =>
                      prev ? { ...prev, tasks: [...prev.tasks, task] } : prev
                    );
                  }}
                />
              </CardHeader>
              <CardContent>
                <PipelineBoard
                  tasks={deal.tasks}
                  onTaskStatusChange={handleTaskStatusChange}
                  onTaskUpdate={handleTaskUpdate}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Artifacts Tab */}
          <TabsContent value="artifacts">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Generated Artifacts</CardTitle>
                <CardDescription>
                  Documents and reports generated by agents for this deal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ArtifactList
                  artifacts={deal.artifacts}
                  dealId={deal.id}
                  dealStatus={deal.status}
                  onArtifactGenerated={(artifact) => {
                    setDeal((prev) =>
                      prev
                        ? { ...prev, artifacts: [artifact, ...prev.artifacts] }
                        : prev
                    );
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contingencies">
            <DealContingenciesPanel dealId={deal.id} />
          </TabsContent>

          <TabsContent value="buyers">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Deal Buyers</CardTitle>
                <CardDescription>
                  Buyer contacts and outreach for this specific deal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_150px]">
                    <Input
                      value={buyerSearch}
                      onChange={(e) => setBuyerSearch(e.target.value)}
                      placeholder="Search buyers"
                    />
                    <Input
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="New buyer name"
                    />
                    <Input
                      value={buyerCompany}
                      onChange={(e) => setBuyerCompany(e.target.value)}
                      placeholder="Company"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                    <Input
                      value={buyerType}
                      onChange={(e) => setBuyerType(e.target.value)}
                      placeholder="Buyer type"
                    />
                    <Button
                      onClick={handleCreateBuyer}
                      disabled={isCreatingBuyer}
                      variant="outline"
                    >
                      {isCreatingBuyer ? "Saving..." : "Add Buyer"}
                    </Button>
                  </div>

                  {buyers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No buyers found. Add buyers to create outreach lists.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {buyers.map((buyer) => (
                        <div
                          key={buyer.id}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <p className="font-medium">{buyer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(buyer.company ?? "—") +
                              (buyer.buyerType ? ` · ${buyer.buyerType}` : "")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(buyer.email ?? "—") + (buyer.phone ? ` · ${buyer.phone}` : "")}
                          </p>
                          {buyer.deals && buyer.deals.length > 1 ? (
                            <div className="mt-2 text-xs">
                              <p className="font-medium">Linked deals</p>
                              <div className="mt-1 space-y-1">
                                {buyer.deals
                                  .filter((linkedDeal) => linkedDeal.id !== deal.id)
                                  .map((linkedDeal) => (
                                    <Link
                                      key={linkedDeal.id}
                                      href={`/deals/${linkedDeal.id}`}
                                      className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-muted-foreground hover:underline"
                                    >
                                      {linkedDeal.name}
                                      <span>· {linkedDeal.sku}</span>
                                    </Link>
                                  ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="room">
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <DealCommentsPanel dealId={deal.id} />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Collaboration canvas</CardTitle>
                    <CardDescription>
                      Shared notes and document-style collaboration for this deal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CollaborativeMemo
                      roomId={deal.id}
                      artifactId={deal.id}
                      initialContent={`# ${deal.name} Collaboration Room`}
                    />
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-4">
                <DealFitScoreCard dealId={deal.id} />
                <DealWorkflowsPanel dealId={deal.id} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="asset-mgmt">
            {deal.currentStageKey !== "ASSET_MANAGEMENT" && (
              <Card className="mb-4">
                <CardContent className="py-3 text-xs text-muted-foreground">
                  This deal is in stage{" "}
                  <span className="font-mono">{deal.currentStageKey ?? "—"}</span>. Asset-management
                  tracking is most useful after the deal reaches{" "}
                  <span className="font-mono">ASSET_MANAGEMENT</span>, but you can pre-populate
                  performance history here.
                </CardContent>
              </Card>
            )}
            <DealAssetManagementPanel dealId={deal.id} />
          </TabsContent>

        </Tabs>
    </DashboardShell>
  );
}
