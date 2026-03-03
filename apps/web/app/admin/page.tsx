"use client";

import { useState } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [contentType, setContentType] = useState("");
  const [memorySubTab, setMemorySubTab] = useState<"facts" | "entities">("facts");

  // Reset page when switching tabs or changing filters
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

  const { data, isLoading, error, mutate } = useSWR(
    `/api/admin/stats?${params.toString()}`,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: false,
    }
  );

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
            <p className="text-sm text-muted-foreground">
              Knowledge base, memory, agents, and system configuration
            </p>
          </div>
        </div>

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
            <OverviewTab data={data?.overview} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="knowledge">
            <KnowledgeTab
              data={data?.knowledge}
              isLoading={isLoading}
              mutate={mutate}
              page={page}
              onPageChange={setPage}
              search={search}
              onSearchChange={(v) => { setSearch(v); setPage(1); }}
              contentType={contentType}
              onContentTypeChange={(v) => { setContentType(v); setPage(1); }}
            />
          </TabsContent>
          <TabsContent value="memory">
            <MemoryTab
              data={data?.memory}
              isLoading={isLoading}
              mutate={mutate}
              page={page}
              onPageChange={setPage}
              subTab={memorySubTab}
              onSubTabChange={(v) => { setMemorySubTab(v); setPage(1); }}
            />
          </TabsContent>
          <TabsContent value="agents">
            <AgentsTab
              data={data?.agents}
              isLoading={isLoading}
              page={page}
              onPageChange={setPage}
            />
          </TabsContent>
          <TabsContent value="codex">
            <div className="grid gap-4">
              <div className="rounded-lg border border-border/60 bg-card p-3 text-sm text-muted-foreground">
                Codex chat is embedded below. Use "Open full page" to switch to a standalone layout.
              </div>
              <a
                className="w-fit rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground transition hover:bg-muted/80"
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
            <SystemTab data={data?.system} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
