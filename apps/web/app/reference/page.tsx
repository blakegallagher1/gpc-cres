"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CalendarClock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardShell } from "@/components/layout/DashboardShell";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

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

export default function ReferencePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeTab: ReferenceTab = useMemo(() => {
    const raw = searchParams.get("tab");
    return raw === "jurisdictions" ? "jurisdictions" : "evidence";
  }, [searchParams]);

  const { data: evidenceResponse } = useSWR<{ sources: EvidenceSource[] }>(
    "/api/evidence?includeSnapshots=false",
    fetcher
  );
  const { data: jurisdictionsResponse } = useSWR<{ jurisdictions: JurisdictionItem[] }>(
    "/api/jurisdictions",
    fetcher
  );

  const evidenceSources = evidenceResponse?.sources ?? [];
  const jurisdictions = jurisdictionsResponse?.jurisdictions ?? [];

  return (
    <DashboardShell>
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === "evidence" || value === "jurisdictions") {
            router.replace(`/reference?tab=${value}`);
          }
        }}
      >
        <div className="border-b px-4 pt-4">
          <TabsList>
            <TabsTrigger value="evidence">Evidence Sources</TabsTrigger>
            <TabsTrigger value="jurisdictions">Jurisdictions</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="evidence" className="mt-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Evidence Sources</CardTitle>
              <CardDescription>
                Source registry used for entitlement packets and parish monitoring.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {evidenceSources.length === 0 ? (
                <p className="text-sm text-muted-foreground">No evidence sources found.</p>
              ) : (
                <div className="space-y-2">
                  {evidenceSources.map((source) => (
                    <div key={source.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{source.title ?? source.domain}</p>
                        <div className="flex items-center gap-2">
                          {source.isOfficial ? <Badge>Official</Badge> : null}
                          <Badge variant="outline">{source.freshness?.freshnessState ?? "unknown"}</Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground break-all">{source.url}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Snapshots: {source.snapshotCount} · Freshness score: {source.freshness?.freshnessScore ?? 0}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jurisdictions" className="mt-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Jurisdictions</CardTitle>
              <CardDescription>
                Jurisdiction metadata, source-health context, and parish pack status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jurisdictions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jurisdictions found.</p>
              ) : (
                <div className="space-y-2">
                  {jurisdictions.map((jurisdiction) => (
                    <div key={jurisdiction.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {jurisdiction.name} · {jurisdiction.kind}
                        </p>
                        <Badge variant={jurisdiction.packContext.hasPack ? "outline" : "destructive"}>
                          {jurisdiction.packContext.hasPack ? "Pack current" : "No pack"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {jurisdiction.state} · {jurisdiction.officialDomains.length} official domains
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Active seed sources: {jurisdiction.seedSourceCount}</span>
                        <span>Deals: {jurisdiction.dealCount}</span>
                        <span>
                          Pack age: {jurisdiction.packContext.stalenessDays ?? "n/a"} day(s)
                        </span>
                        {jurisdiction.packContext.isStale ? (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <AlertCircle className="h-3.5 w-3.5" /> Stale
                          </span>
                        ) : null}
                        {jurisdiction.packContext.missingEvidence.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <CalendarClock className="h-3.5 w-3.5" />
                            {jurisdiction.packContext.missingEvidence.length} action item(s)
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
