"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Globe, ShieldCheck, FileSearch } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface EvidenceSourceItem {
  id: string;
  url: string;
  domain: string;
  title?: string | null;
  isOfficial: boolean;
  firstSeenAt: string;
  snapshotCount: number;
  latestSnapshot?: {
    retrievedAt: string;
    contentHash: string;
    runId?: string;
  } | null;
}

export default function EvidencePage() {
  const [sources, setSources] = useState<EvidenceSourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [officialOnly, setOfficialOnly] = useState(false);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (officialOnly) params.set("official", "true");

      const res = await fetch(`/api/evidence?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load evidence sources");
      const data = await res.json();
      setSources(data.sources ?? []);
    } catch (error) {
      console.error("Failed to load evidence sources:", error);
      toast.error("Failed to load evidence sources");
    } finally {
      setLoading(false);
    }
  }, [search, officialOnly]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Evidence</h1>
          <p className="text-sm text-muted-foreground">
            Browse captured evidence sources and their snapshots.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by URL, domain, or title..."
              className="pl-9"
            />
          </div>
          <Badge
            variant={officialOnly ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setOfficialOnly(!officialOnly)}
          >
            <ShieldCheck className="mr-1 h-3 w-3" />
            Official only
          </Badge>
        </div>

        {/* Table */}
        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading evidence sources...
            </CardContent>
          </Card>
        ) : sources.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileSearch className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">
                No evidence sources found. Sources are captured automatically during agent runs.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead className="text-center">Official</TableHead>
                  <TableHead className="text-center">Snapshots</TableHead>
                  <TableHead>Latest Snapshot</TableHead>
                  <TableHead>Producing Run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell className="max-w-[300px]">
                      <div>
                        <p className="truncate text-sm font-medium">
                          {source.title ?? source.url}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {source.url}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{source.domain}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {source.isOfficial ? (
                        <ShieldCheck className="mx-auto h-4 w-4 text-green-500" />
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {source.snapshotCount}
                    </TableCell>
                    <TableCell>
                      {source.latestSnapshot ? (
                        <div className="text-sm">
                          <p>{formatDate(source.latestSnapshot.retrievedAt)}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {source.latestSnapshot.contentHash.slice(0, 12)}...
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {source.latestSnapshot?.runId ? (
                        <Link
                          href={`/runs/${source.latestSnapshot.runId}`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {source.latestSnapshot.runId}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unlinked</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
