"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";

const OverviewTab = dynamic(() => import("@/components/admin/overview-tab"), {
  loading: () => <AdminTabSkeleton />,
});
const KnowledgeTab = dynamic(() => import("@/components/admin/knowledge-tab"), {
  loading: () => <AdminTabSkeleton />,
});
const MemoryTab = dynamic(() => import("@/components/admin/memory-tab"), {
  loading: () => <AdminTabSkeleton />,
});
const AgentsTab = dynamic(() => import("@/components/admin/agents-tab"), {
  loading: () => <AdminTabSkeleton />,
});
const SystemTab = dynamic(() => import("@/components/admin/system-tab"), {
  loading: () => <AdminTabSkeleton />,
});

interface AdminTabError {
  message: string;
  detail?: string;
}

interface AdminStatsApiResponse {
  overview?: unknown;
  knowledge?: unknown;
  memory?: unknown;
  agents?: unknown;
  system?: unknown;
  errors?: Record<string, AdminTabError>;
}

function AdminTabSkeleton() {
  return (
    <div className="space-y-4 pt-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

const fetcher = async (url: string): Promise<AdminStatsApiResponse> => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Unable to refresh admin data right now.");
  }
  return payload;
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [contentType, setContentType] = useState("");
  const [memorySubTab, setMemorySubTab] = useState<"facts" | "entities">("facts");

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    setPage(1);
    setSearch("");
    setContentType("");
  }

  const params = new URLSearchParams({ tab: activeTab, page: String(page) });
  if (search) params.set("search", search);
  if (contentType) params.set("contentType", contentType);
  if (activeTab === "memory") params.set("subTab", memorySubTab);
  const shouldFetchStats =
    process.env.NEXT_PUBLIC_E2E !== "true" ||
    process.env.NEXT_PUBLIC_LIVE_DB_E2E === "true";

  const { data, isLoading, error, mutate } = useSWR(
    shouldFetchStats ? `/api/admin/stats?${params.toString()}` : null,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: false,
    },
  );

  const [cachedTabs, setCachedTabs] = useState<Partial<AdminStatsApiResponse>>({});

  useEffect(() => {
    if (!data) {
      return;
    }

    setCachedTabs((previous) => {
      const next = { ...previous };

      if (data.overview) next.overview = data.overview;
      if (data.knowledge) next.knowledge = data.knowledge;
      if (data.memory) next.memory = data.memory;
      if (data.agents) next.agents = data.agents;
      if (data.system) next.system = data.system;

      return next;
    });
  }, [data]);

  const tabErrors = data?.errors ?? {};
  const activeTabError: AdminTabError | undefined = error
    ? { message: "Unable to refresh this section right now." }
    : (tabErrors[activeTab] as AdminTabError | undefined);

  return (
    <DashboardShell>
      <div className="workspace-page">
        <WorkspaceHeader
          eyebrow="System desk"
          title="Admin"
          description="Knowledge base, memory, agents, and system configuration in one control surface."
          actions={
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span className="workspace-section-kicker">Restricted access</span>
            </div>
          }
        />

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              data={(data?.overview ?? cachedTabs.overview) as {
                knowledgeCount: number;
                verifiedCount: number;
                entityCount: number;
                runs24h: number;
                recentActivity: { type: string; summary: string; createdAt: string }[];
                knowledgeByType: { contentType: string; count: number }[];
              } | undefined}
              isLoading={isLoading}
              error={activeTabError}
              onRetry={() => {
                void mutate();
              }}
            />
          </TabsContent>

          <TabsContent value="knowledge">
            <KnowledgeTab
              data={(data?.knowledge ?? cachedTabs.knowledge) as {
                rows: { id: string; contentType: string; sourceId: string; contentText: string; metadata: Record<string, unknown>; createdAt: string }[];
                total: number;
                page: number;
                contentTypes: string[];
              } | undefined}
              isLoading={isLoading}
              mutate={mutate}
              page={page}
              onPageChange={setPage}
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              contentType={contentType}
              onContentTypeChange={(value) => {
                setContentType(value);
                setPage(1);
              }}
              error={activeTab === "knowledge" ? (activeTabError as AdminTabError | undefined) : undefined}
              onRetry={() => {
                void mutate();
              }}
            />
          </TabsContent>

          <TabsContent value="memory">
            <MemoryTab
              data={(data?.memory ?? cachedTabs.memory) as {
                subTab: "facts" | "entities";
                rows: Array<
                  | {
                      id: string;
                      entityId: string;
                      entityAddress: string;
                      entityType: string;
                      factType: string;
                      sourceType: string;
                      economicWeight: number;
                      volatilityClass: string;
                      payloadJson: Record<string, unknown>;
                      tier: number;
                      createdAt: string;
                    }
                  | {
                      id: string;
                      canonicalAddress: string | null;
                      parcelId: string | null;
                      type: string;
                      factsCount: number;
                      createdAt: string;
                    }
                >;
                total: number;
                page: number;
              } | undefined}
              isLoading={isLoading}
              mutate={mutate}
              page={page}
              onPageChange={setPage}
              subTab={memorySubTab}
              onSubTabChange={(value) => {
                setMemorySubTab(value);
                setPage(1);
              }}
              error={activeTab === "memory" ? (activeTabError as AdminTabError | undefined) : undefined}
              onRetry={() => {
                void mutate();
              }}
            />
          </TabsContent>

          <TabsContent value="agents">
            <AgentsTab
              data={(data?.agents ?? cachedTabs.agents) as {
                runs: {
                  id: string;
                  runType: string;
                  status: string;
                  startedAt: string;
                  finishedAt: string | null;
                  durationMs: number | null;
                  error: string | null;
                  dealId: string | null;
                }[];
                total: number;
                page: number;
                stats: { total24h: number; successRate: number };
                dailyByRunType: { runType: string; count: number }[];
              } | undefined}
              isLoading={isLoading}
              page={page}
              onPageChange={setPage}
              error={activeTab === "agents" ? (activeTabError as AdminTabError | undefined) : undefined}
              onRetry={() => {
                void mutate();
              }}
            />
          </TabsContent>

          <TabsContent value="codex">
            <div className="grid gap-4">
              <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
                Codex chat is embedded below. Use "Open full page" to switch to a
                standalone layout.
              </div>
              <a
                className="w-fit rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground transition hover:bg-muted"
                href="/admin/codex"
                target="_blank"
                rel="noreferrer"
              >
                Open full page
              </a>
              <iframe
                src="/admin/codex"
                title="Codex Admin Chat"
                className="h-[75vh] min-h-[560px] w-full rounded-lg border border-border bg-black"
                allow="clipboard-write"
              />
            </div>
          </TabsContent>

          <TabsContent value="system">
            <SystemTab
              data={(data?.system ?? cachedTabs.system) as { tableCounts: Record<string, number> } | undefined}
              isLoading={isLoading}
              error={activeTab === "system" ? (activeTabError as AdminTabError | undefined) : undefined}
              onRetry={() => {
                void mutate();
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
