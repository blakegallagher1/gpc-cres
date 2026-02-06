"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, MessageSquare, Trash2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { SkuBadge } from "@/components/deals/SkuBadge";
import { TriageIndicator } from "@/components/deals/TriageIndicator";
import { PipelineBoard } from "@/components/deals/PipelineBoard";
import { ParcelTable, type ParcelItem } from "@/components/deals/ParcelTable";
import { ArtifactList, type ArtifactItem } from "@/components/deals/ArtifactList";
import type { TaskItem } from "@/components/deals/TaskCard";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

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
}

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Add-parcel form state
  const [parcelAddress, setParcelAddress] = useState("");
  const [parcelApn, setParcelApn] = useState("");
  const [addingParcel, setAddingParcel] = useState(false);

  const loadDeal = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${id}`);
      if (!res.ok) throw new Error("Failed to load deal");
      const data = await res.json();
      setDeal(data.deal);
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

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/deals/${id}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      // Update local state
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
                {deal.jurisdiction && (
                  <span className="text-sm text-muted-foreground">
                    {deal.jurisdiction.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
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
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="parcels">
              Parcels ({deal.parcels.length})
            </TabsTrigger>
            <TabsTrigger value="tasks">
              Tasks ({deal.tasks.length})
            </TabsTrigger>
            <TabsTrigger value="artifacts">
              Artifacts ({deal.artifacts.length})
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid gap-4 md:grid-cols-2">
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
                </CardContent>
              </Card>

              {/* Triage Score */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Triage Score</CardTitle>
                </CardHeader>
                <CardContent>
                  {deal.triageTier ? (
                    <div className="flex items-center gap-3">
                      <TriageIndicator tier={deal.triageTier} showLabel />
                      {deal.triageOutput?.score != null && (
                        <span className="text-2xl font-bold">
                          {String(deal.triageOutput.score)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No triage run yet. Use the chat to run triage on this deal.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  {deal.notes ? (
                    <p className="whitespace-pre-wrap text-sm">{deal.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes added.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Parcels Tab */}
          <TabsContent value="parcels">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Parcels</CardTitle>
                <CardDescription>
                  Land parcels associated with this deal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ParcelTable parcels={deal.parcels} />

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
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline Tasks</CardTitle>
                <CardDescription>
                  Track progress through the 8-step entitlement pipeline. Click the status icon to cycle.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PipelineBoard
                  tasks={deal.tasks}
                  onTaskStatusChange={handleTaskStatusChange}
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
                <ArtifactList artifacts={deal.artifacts} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
