"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import useSWR from "swr";
import {
  ArrowLeft,
  Loader2,
  Plus,
  MessageSquare,
  Calculator,
  Trash2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { SkuBadge } from "@/components/deals/SkuBadge";
import { TriageIndicator } from "@/components/deals/TriageIndicator";
import { PipelineBoard } from "@/components/deals/PipelineBoard";
import { ParcelTable, type ParcelItem } from "@/components/deals/ParcelTable";
import { ArtifactList, type ArtifactItem } from "@/components/deals/ArtifactList";
import { FileUploadZone, type UploadItem } from "@/components/deals/FileUploadZone";
import { UploadList } from "@/components/deals/UploadList";
import { DocumentExtractionReview, ExtractionPendingBadge } from "@/components/deals/DocumentExtractionReview";
import { EnvironmentalAssessmentsPanel } from "@/components/deals/EnvironmentalAssessmentsPanel";
import { DealFinancingPanel } from "@/components/deals/DealFinancingPanel";
import { RiskRegisterPanel } from "@/components/deals/RiskRegisterPanel";
import { TriageResultPanel } from "@/components/deals/TriageResultPanel";
import { RunTriageButton } from "@/components/deals/RunTriageButton";
import { ActivityTimeline } from "@/components/deals/ActivityTimeline";
import { TaskCreateForm } from "@/components/deals/TaskCreateForm";
import { DealStakeholdersPanel } from "@/components/deals/DealStakeholdersPanel";
import { CollaborativeMemo } from "@/components/deal-room/CollaborativeMemo";
import type { TaskItem } from "@/components/deals/TaskCard";
import { DeadlineBar } from "@/components/deals/DeadlineBar";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

const DealParcelMap = dynamic(
  () => import("@/components/maps/DealParcelMap"),
  { ssr: false }
);

interface DealDetail {
  id: string;
  name: string;
  sku: string;
  status: string;
  notes?: string | null;
  targetCloseDate?: string | null;
  createdAt: string;
  updatedAt: string;
  triageTier?: string | null;
  triageOutput?: Record<string, unknown> | null;
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

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTab = searchParams?.get("tab") ?? "overview";
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
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

  const formatCurrencyValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    const numberValue = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(numberValue)) return "—";
    return formatCurrency(numberValue);
  };

  const formatNumericValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    const numberValue = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(numberValue)) return "—";
    return numberValue.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  };

  const formatSetbacks = (setbacks: Record<string, unknown>) => {
    if (!setbacks || Object.keys(setbacks).length === 0) return "—";
    return JSON.stringify(setbacks, null, 2);
  };

  const loadDeal = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${id}`);
      if (!res.ok) throw new Error("Failed to load deal");
      const data = await res.json();
      setDeal(data.deal);
      if (data.deal.triageOutput) {
        setTriageResult(data.deal.triageOutput);
      }
    } catch (error) {
      console.error("Failed to load deal:", error);
      toast.error("Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadDeal();
  }, [id, loadDeal]);

  const displayNotes = deal?.notes?.trim() ?? "";

  // Also load latest triage from dedicated endpoint
  useEffect(() => {
    if (!id) return;
    fetch(`/api/deals/${id}/triage`)
      .then((res) => res.json())
      .then((data) => {
        if (data.triage) setTriageResult(data.triage);
      })
      .catch(() => {});
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
      console.error("Failed to update task:", error);
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
      console.error("Failed to update task:", error);
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
      console.error("Failed to add parcel:", error);
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
      console.error("Failed to delete deal:", error);
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
          <p className="text-muted-foreground">Deal not found</p>
          <Button asChild className="mt-4">
            <Link href="/deals">Back to Deals</Link>
          </Button>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild className="mt-1">
              <Link href="/deals">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{deal.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <SkuBadge sku={deal.sku} />
                <StatusBadge status={deal.status} />
                <TriageIndicator tier={deal.triageTier} showLabel />
                {deal.packContext ? (
                  <Badge
                    variant={deal.packContext.isStale ? "destructive" : "secondary"}
                    className="gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {deal.packContext.hasPack
                      ? (deal.packContext.isStale ? "Parish pack stale" : "Parish pack current")
                      : "No parish pack"}
                  </Badge>
                ) : null}
                {deal.jurisdiction && (
                  <span className="text-sm text-muted-foreground">
                    {deal.jurisdiction.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
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
              <Link href={`/chat?dealId=${deal.id}`}>
                <MessageSquare className="h-4 w-4" />
                Chat
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents">
              Documents ({deal.uploads?.length ?? 0})
              <ExtractionPendingBadge dealId={deal.id} />
            </TabsTrigger>
            <TabsTrigger value="parcels">
              Parcels ({deal.parcels.length})
            </TabsTrigger>
            <TabsTrigger value="tasks">
              Tasks ({deal.tasks.length})
            </TabsTrigger>
            <TabsTrigger value="artifacts">
              Artifacts ({deal.artifacts.length})
            </TabsTrigger>
            <TabsTrigger value="buyers">Buyers</TabsTrigger>
            <TabsTrigger value="room">Room</TabsTrigger>
            <TabsTrigger value="collaborate">Collaborate</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                {/* Summary Cards */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Deal Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Status</p>
                          <StatusBadge status={deal.status} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Product</p>
                          <SkuBadge sku={deal.sku} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Jurisdiction</p>
                          <p className="font-medium">
                            {deal.jurisdiction?.name ?? "--"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Parcels</p>
                          <p className="font-medium">{deal.parcels.length}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Key Dates</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="font-medium">{formatDate(deal.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last Updated</p>
                      <p className="font-medium">{formatDate(deal.updatedAt)}</p>
                    </div>
                    {deal.targetCloseDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">Target Close</p>
                        <p className="font-medium">{formatDate(deal.targetCloseDate)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Pack Health</p>
                      <div className="mt-1 space-y-1">
                        <p className="font-medium">
                          {deal.packContext?.hasPack
                            ? deal.packContext.isStale
                              ? `Stale (${deal.packContext.stalenessDays ?? "?"} day(s))`
                              : "Current"
                            : "No pack found"}
                        </p>
                        {deal.packContext?.missingEvidence?.length ? (
                          <ul className="list-disc pl-4 text-xs text-muted-foreground">
                            {deal.packContext.missingEvidence.map((item) => (
                              <li key={item}>
                                <span className="inline-flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {item}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Acquisition Terms</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {terms ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Offer Price</p>
                          <p className="font-medium">{formatCurrencyValue(terms.offerPrice)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Earnest Money</p>
                          <p className="font-medium">
                            {formatCurrencyValue(terms.earnestMoney)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Closing Date</p>
                          <p className="font-medium">
                            {terms.closingDate ? formatDate(terms.closingDate) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Title Review Due</p>
                          <p className="font-medium">
                            {terms.titleReviewDue ? formatDate(terms.titleReviewDue) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Survey Due</p>
                          <p className="font-medium">
                            {terms.surveyDue ? formatDate(terms.surveyDue) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Environmental Due</p>
                          <p className="font-medium">
                            {terms.environmentalDue ? formatDate(terms.environmentalDue) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">DD Days</p>
                          <p className="font-medium">
                            {terms.dueDiligenceDays === null ? "—" : terms.dueDiligenceDays}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Financing Days</p>
                          <p className="font-medium">
                            {terms.financingContingencyDays === null
                              ? "—"
                              : terms.financingContingencyDays}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No acquisition terms available for this deal.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Timeline Milestones</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {terms || entitlementPath ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Offer Closing</p>
                          <p className="font-medium">
                            {terms?.closingDate ? formatDate(terms.closingDate) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Pre-Application</p>
                          <p className="font-medium">
                            {entitlementPath?.preAppMeetingDate
                              ? formatDate(entitlementPath.preAppMeetingDate)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Public Notice</p>
                          <p className="font-medium">
                            {entitlementPath?.publicNoticeDate
                              ? formatDate(entitlementPath.publicNoticeDate)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Hearing</p>
                          <p className="font-medium">
                            {entitlementPath?.hearingScheduledDate
                              ? formatDate(entitlementPath.hearingScheduledDate)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Title Review Due</p>
                          <p className="font-medium">
                            {terms?.titleReviewDue ? formatDate(terms.titleReviewDue) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Survey Due</p>
                          <p className="font-medium">
                            {terms?.surveyDue ? formatDate(terms.surveyDue) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Environmental Due</p>
                          <p className="font-medium">
                            {terms?.environmentalDue ? formatDate(terms.environmentalDue) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Decision Date</p>
                          <p className="font-medium">
                            {entitlementPath?.decisionDate
                              ? formatDate(entitlementPath.decisionDate)
                              : "—"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No timeline milestone data available yet.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Entitlement</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {entitlementPath ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Recommended Strategy</p>
                          <p className="font-medium">
                            {entitlementPath.recommendedStrategy ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Application Type</p>
                          <p className="font-medium">
                            {entitlementPath.applicationType ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Hearing Date</p>
                          <p className="font-medium">
                            {entitlementPath.hearingScheduledDate
                              ? formatDate(entitlementPath.hearingScheduledDate)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Hearing Body</p>
                          <p className="font-medium">
                            {entitlementPath.hearingBody ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Decision Date</p>
                          <p className="font-medium">
                            {entitlementPath.decisionDate
                              ? formatDate(entitlementPath.decisionDate)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Decision Type</p>
                          <p className="font-medium">
                            {entitlementPath.decisionType ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Appeal Deadline</p>
                          <p className="font-medium">
                            {entitlementPath.appealDeadline
                              ? formatDate(entitlementPath.appealDeadline)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Appeal Filed</p>
                          <p className="font-medium">
                            {entitlementPath.appealFiled === null
                              ? "—"
                              : entitlementPath.appealFiled
                                ? "Yes"
                                : "No"}
                          </p>
                        </div>
                        {entitlementPath.conditions.length > 0 ? (
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground">Conditions</p>
                            <ul className="mt-1 list-disc pl-4">
                              {entitlementPath.conditions.map((condition) => (
                                <li key={condition} className="text-xs">
                                  {condition}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No entitlement path available for this deal.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Property Title</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {propertyTitle ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Title Insurance</p>
                          <p className="font-medium">
                            {propertyTitle.titleInsuranceReceived === null
                              ? "—"
                              : propertyTitle.titleInsuranceReceived
                                ? "Received"
                                : "Pending"}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Exceptions</p>
                          <ul className="mt-1 list-disc pl-4">
                            {propertyTitle.exceptions.length > 0 ? (
                              propertyTitle.exceptions.map((item) => (
                                <li key={item} className="text-xs">
                                  {item}
                                </li>
                              ))
                            ) : (
                              <li className="text-xs text-muted-foreground">None</li>
                            )}
                          </ul>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Liens</p>
                          <ul className="mt-1 list-disc pl-4">
                            {propertyTitle.liens.length > 0 ? (
                              propertyTitle.liens.map((item) => (
                                <li key={item} className="text-xs">
                                  {item}
                                </li>
                              ))
                            ) : (
                              <li className="text-xs text-muted-foreground">None</li>
                            )}
                          </ul>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Easements</p>
                          <ul className="mt-1 list-disc pl-4">
                            {propertyTitle.easements.length > 0 ? (
                              propertyTitle.easements.map((item) => (
                                <li key={item} className="text-xs">
                                  {item}
                                </li>
                              ))
                            ) : (
                              <li className="text-xs text-muted-foreground">None</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No property title information available for this deal.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Property Survey</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {propertySurvey ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Survey Completed</p>
                          <p className="font-medium">
                            {propertySurvey.surveyCompletedDate
                              ? formatDate(propertySurvey.surveyCompletedDate)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Acreage Confirmed</p>
                          <p className="font-medium">
                            {formatNumericValue(propertySurvey.acreageConfirmed)} ac
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Encroachments</p>
                          <ul className="mt-1 list-disc pl-4">
                            {propertySurvey.encroachments.length > 0 ? (
                              propertySurvey.encroachments.map((item) => (
                                <li key={item} className="text-xs">
                                  {item}
                                </li>
                              ))
                            ) : (
                              <li className="text-xs text-muted-foreground">None</li>
                            )}
                          </ul>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Setbacks</p>
                          <p className="font-mono text-xs whitespace-pre-wrap">
                            {formatSetbacks(propertySurvey.setbacks)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No property survey information available for this deal.
                      </p>
                    )}
                  </CardContent>
                </Card>
                </div>

                {/* Deadline Bar */}
                <DeadlineBar tasks={deal.tasks} />

                {/* Triage Results */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Triage Assessment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {triageResult && (triageResult as Record<string, unknown>).decision ? (
                      <TriageResultPanel
                        triage={triageResult as Parameters<typeof TriageResultPanel>[0]["triage"]}
                        sources={triageSources}
                        dealId={id}
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
                              tasks: prev.tasks.map((t) =>
                                t.id === taskId
                                  ? { ...t, status: "DONE", description: (t.description ?? "") + "\n\n---\nAgent Findings:\n" + agentOutput }
                                  : t
                              ),
                            };
                          });
                        }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No triage run yet. Click "Run Triage" to analyze this deal.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Notes */}
                {displayNotes ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap text-sm">{displayNotes}</p>
                    </CardContent>
                  </Card>
                ) : null}
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <DealStakeholdersPanel dealId={deal.id} />
                <RiskRegisterPanel dealId={deal.id} />

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ActivityTimeline dealId={deal.id} />
                  </CardContent>
                </Card>
              </div>
            </div>
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
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Deal Room</CardTitle>
                <CardDescription>
                  Messaging, shared documents, and team coordination workspace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Shared notes and collaboration feed for this deal.
                  </p>
                  <CollaborativeMemo
                    roomId={deal.id}
                    artifactId={deal.id}
                    initialContent={`# ${deal.name} Collaboration Room`}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="collaborate">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Deal Room</CardTitle>
                <CardDescription>
                  Messaging, shared documents, and team coordination workspace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Shared notes and collaboration feed for this deal.
                  </p>
                  <CollaborativeMemo
                    roomId={deal.id}
                    artifactId={deal.id}
                    initialContent={`# ${deal.name} Collaboration Room`}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
