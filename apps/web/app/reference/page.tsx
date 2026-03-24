"use client";

import { Suspense, useMemo } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CalendarClock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";

export async function referenceFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string" && payload.error.length > 0) {
        message = payload.error;
      }
    } catch {
      // Preserve fallback text when the response body is not JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

interface EvidenceSource {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  isOfficial: boolean;
  firstSeenAt: string;
  snapshotCount: number;
  freshness?: {
    freshnessScore: number;
    freshnessState: string;
    driftSignal: string;
    alertLevel: string;
  };
}

interface JurisdictionItem {
  id: string;
  name: string;
  kind: string;
  state: string;
  officialDomains: string[];
  seedSourceCount: number;
  dealCount: number;
  packContext: {
    hasPack: boolean;
    isStale: boolean;
    stalenessDays: number | null;
    missingEvidence: string[];
  };
}

type ReferenceTab = "evidence" | "jurisdictions";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unknown error";
}

function ReferenceErrorState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-red-700/90">{message}</p>
        </div>
      </div>
    </div>
  );
}

function ReferencePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sourceId = searchParams.get("sourceId") ?? null;

  const activeTab: ReferenceTab = useMemo(() => {
    const raw = searchParams.get("tab");
    return raw === "jurisdictions" ? "jurisdictions" : "evidence";
  }, [searchParams]);

  const { data: evidenceResponse, error: evidenceError } = useSWR<{ sources: EvidenceSource[] }>(
    "/api/evidence?includeSnapshots=false",
    referenceFetcher,
  );
  const { data: jurisdictionsResponse, error: jurisdictionsError } = useSWR<{
    jurisdictions: JurisdictionItem[];
  }>("/api/jurisdictions", referenceFetcher);

  const evidenceSources = evidenceResponse?.sources ?? [];
  const jurisdictions = jurisdictionsResponse?.jurisdictions ?? [];

  return (
    <DashboardShell>
      <div className="workspace-page">
        <WorkspaceHeader
          eyebrow="Reference desk"
          title="Reference"
          description="Evidence sources, jurisdiction metadata, and pack health in one operating reference surface."
        />

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value === "evidence" || value === "jurisdictions") {
              router.replace(`/reference?tab=${value}`);
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="evidence">Evidence Sources</TabsTrigger>
            <TabsTrigger value="jurisdictions">Jurisdictions</TabsTrigger>
          </TabsList>

          <TabsContent value="evidence" className="mt-0">
            <section className="workspace-section space-y-4">
              <div className="workspace-section-header">
                <div>
                  <p className="workspace-section-kicker">Reference</p>
                  <h2 className="workspace-section-heading mt-2">Evidence sources</h2>
                  <p className="workspace-section-copy mt-2">
                    Source registry used for entitlement packets and parish monitoring.
                  </p>
                </div>
              </div>

              {evidenceError ? (
                <ReferenceErrorState
                  title="Unable to load evidence sources."
                  message={getErrorMessage(evidenceError)}
                />
              ) : evidenceSources.length === 0 ? (
                <p className="text-sm text-muted-foreground">No evidence sources found.</p>
              ) : (
                <div className="workspace-list">
                  {evidenceSources.map((source) => (
                    <div
                      key={source.id}
                      className={`workspace-list-row ${sourceId === source.id ? "bg-primary/[0.04]" : ""}`}
                    >
                      <div className="w-full space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{source.title ?? source.domain}</p>
                          <div className="flex items-center gap-2">
                            {source.isOfficial ? <Badge>Official</Badge> : null}
                            <Badge variant="outline">
                              {source.freshness?.freshnessState ?? "unknown"}
                            </Badge>
                          </div>
                        </div>
                        <p className="break-all text-sm text-muted-foreground">{source.url}</p>
                        <div className="workspace-inline-meta">
                          <span>Snapshots {source.snapshotCount}</span>
                          <span>Freshness {source.freshness?.freshnessScore ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="jurisdictions" className="mt-0">
            <section className="workspace-section space-y-4">
              <div className="workspace-section-header">
                <div>
                  <p className="workspace-section-kicker">Reference</p>
                  <h2 className="workspace-section-heading mt-2">Jurisdictions</h2>
                  <p className="workspace-section-copy mt-2">
                    Jurisdiction metadata, source-health context, and parish pack status.
                  </p>
                </div>
              </div>

              {jurisdictionsError ? (
                <ReferenceErrorState
                  title="Unable to load jurisdictions."
                  message={getErrorMessage(jurisdictionsError)}
                />
              ) : jurisdictions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jurisdictions found.</p>
              ) : (
                <div className="workspace-list">
                  {jurisdictions.map((jurisdiction) => (
                    <div key={jurisdiction.id} className="workspace-list-row">
                      <div className="w-full space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">
                            {jurisdiction.name} · {jurisdiction.kind}
                          </p>
                          <Badge
                            variant={jurisdiction.packContext.hasPack ? "outline" : "destructive"}
                          >
                            {jurisdiction.packContext.hasPack ? "Pack current" : "No pack"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {jurisdiction.state} · {jurisdiction.officialDomains.length} official domains
                        </p>
                        <div className="workspace-inline-meta">
                          <span>Seed sources {jurisdiction.seedSourceCount}</span>
                          <span>Deals {jurisdiction.dealCount}</span>
                          <span>Pack age {jurisdiction.packContext.stalenessDays ?? "n/a"}d</span>
                          {jurisdiction.packContext.isStale ? (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Stale
                            </span>
                          ) : null}
                          {jurisdiction.packContext.missingEvidence.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <CalendarClock className="h-3.5 w-3.5" />
                              {jurisdiction.packContext.missingEvidence.length} action items
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}

function ReferencePageLoading() {
  return (
    <DashboardShell>
      <div className="py-24 text-center text-sm text-muted-foreground">Loading reference...</div>
    </DashboardShell>
  );
}

export default function ReferencePage() {
  return (
    <Suspense fallback={<ReferencePageLoading />}>
      <ReferencePageContent />
    </Suspense>
  );
}
