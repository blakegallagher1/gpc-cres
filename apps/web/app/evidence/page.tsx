"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Globe,
  ShieldCheck,
  FileSearch,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
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
    id: string;
    retrievedAt: string;
    contentHash: string;
    runId?: string;
    httpStatus: number;
    contentType: string;
  } | null;
  freshness: {
    freshnessScore: number;
    freshnessState: "fresh" | "aging" | "stale" | "critical" | "unknown";
    driftSignal: "stable" | "changed" | "insufficient";
    alertLevel: "none" | "warning" | "critical";
    alertReasons: string[];
  };
  snapshots?: EvidenceSnapshotItem[];
}

interface EvidenceSnapshotItem {
  id: string;
  retrievedAt: string;
  contentHash: string;
  runId?: string | null;
  httpStatus: number;
  contentType: string;
}

export default function EvidencePage() {
  const [sources, setSources] = useState<EvidenceSourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [officialOnly, setOfficialOnly] = useState(false);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [snapshotLoadStates, setSnapshotLoadStates] = useState<Record<string, boolean>>({});
  const [initialSourceId, setInitialSourceId] = useState<string | null>(null);

  const loadSourceSnapshots = useCallback(async (sourceId: string) => {
    setSnapshotLoadStates((prev) => ({ ...prev, [sourceId]: true }));
    try {
      const params = new URLSearchParams({ sourceId, includeSnapshots: "true", snapshotLimit: "50" });
      const res = await fetch(`/api/evidence?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load snapshot history");
      }

      const data = await res.json();
      const snapshotSources: EvidenceSourceItem[] = data.sources ?? [];
      const source = snapshotSources.find((entry) => entry.id === sourceId);
      if (!source) {
        throw new Error("Evidence source not found");
      }

      setSources((previous) =>
        previous.map((entry) =>
          entry.id === source.id ? { ...entry, snapshots: source.snapshots ?? [] } : entry,
        ),
      );
    } catch (error) {
      console.error("Failed to load source snapshots:", error);
      toast.error("Failed to load source snapshot history");
    } finally {
      setSnapshotLoadStates((prev) => ({ ...prev, [sourceId]: false }));
    }
  }, []);

  const handleToggleSource = useCallback(
    (sourceId: string) => {
      setExpandedSourceId((current) => {
        if (current === sourceId) {
          return null;
        }

        const source = sources.find((entry) => entry.id === sourceId);
        if (source && !source.snapshots && !snapshotLoadStates[sourceId]) {
          void loadSourceSnapshots(sourceId);
        }

        return sourceId;
      });
    },
    [loadSourceSnapshots, snapshotLoadStates, sources],
  );

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (officialOnly) params.set("official", "true");
      if (initialSourceId) {
        params.set("sourceId", initialSourceId);
        params.set("includeSnapshots", "true");
      }

      const res = await fetch(`/api/evidence?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load evidence sources");
      const data = await res.json();
      setSources(data.sources ?? []);
      if (initialSourceId) {
        setExpandedSourceId(initialSourceId);
      }
    } catch (error) {
      console.error("Failed to load evidence sources:", error);
      toast.error("Failed to load evidence sources");
    } finally {
      setLoading(false);
    }
  }, [search, officialOnly, initialSourceId]);

const formatHash = (value: string) => (value.length > 8 ? `${value.slice(0, 8)}...` : value);

const formatSnapshotCount = (value: number) => (value > 9 ? "9+" : String(value));

const freshnessLabelByState: Record<EvidenceSourceItem["freshness"]["freshnessState"], string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
  critical: "Critical",
  unknown: "Unknown",
};

const driftLabelByState: Record<EvidenceSourceItem["freshness"]["driftSignal"], string> = {
  stable: "Stable",
  changed: "Drift",
  insufficient: "Insufficient",
};

const badgeVariantByFreshness = (
  state: EvidenceSourceItem["freshness"]["freshnessState"],
): "default" | "outline" | "secondary" | "destructive" => {
  if (state === "fresh") return "default";
  if (state === "aging") return "secondary";
  return "destructive";
};

const badgeVariantByAlert = (
  alertLevel: EvidenceSourceItem["freshness"]["alertLevel"],
): "default" | "outline" | "secondary" | "destructive" => {
  if (alertLevel === "critical") return "destructive";
  if (alertLevel === "warning") return "secondary";
  return "outline";
};

const badgeVariantByDrift = (
  driftSignal: EvidenceSourceItem["freshness"]["driftSignal"],
): "default" | "outline" | "secondary" | "destructive" => {
  if (driftSignal === "changed") return "destructive";
  if (driftSignal === "stable") return "outline";
  return "secondary";
};

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitialSourceId(params.get("sourceId"));
  }, []);

  useEffect(() => {
    if (!initialSourceId) {
      return;
    }

    setExpandedSourceId(initialSourceId);
  }, [initialSourceId]);

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
                  <TableHead className="text-center">Snapshot History</TableHead>
                  <TableHead className="text-center">Freshness</TableHead>
                  <TableHead className="text-center">Drift</TableHead>
                  <TableHead>Latest Snapshot</TableHead>
                  <TableHead>Producing Run</TableHead>
                  <TableHead>Alert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <Fragment key={source.id}>
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
                        <span className="font-mono text-xs">{formatSnapshotCount(source.snapshotCount)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleSource(source.id)}
                          className="h-7 px-2"
                        >
                          {expandedSourceId === source.id ? (
                            <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {expandedSourceId === source.id ? "Hide" : "Show"}
                        </Button>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-mono text-xs">{source.freshness.freshnessScore}</span>
                          <Badge variant={badgeVariantByFreshness(source.freshness.freshnessState)}>
                            {freshnessLabelByState[source.freshness.freshnessState]}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={badgeVariantByDrift(source.freshness.driftSignal)}>
                          {driftLabelByState[source.freshness.driftSignal]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {source.latestSnapshot ? (
                          <div className="text-sm">
                            <p>{formatDate(source.latestSnapshot.retrievedAt)}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {source.latestSnapshot.contentHash
                                ? source.latestSnapshot.contentHash.slice(0, 12) + "..."
                                : "--"}
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
                      <TableCell>
                        <div className="space-y-1">
                          <Badge
                            variant={badgeVariantByAlert(source.freshness.alertLevel)}
                            className="text-xs"
                          >
                            {source.freshness.alertLevel}
                          </Badge>
                          {source.freshness.alertReasons.length > 0 ? (
                            <p className="text-xs text-muted-foreground flex items-center">
                              {source.freshness.alertLevel !== "none" ? (
                                <AlertTriangle className="mr-1 h-3 w-3 text-amber-500" />
                              ) : null}
                              {source.freshness.alertReasons[0]}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedSourceId === source.id ? (
                      <TableRow>
                        <TableCell colSpan={10}>
                          <Card>
                            <CardContent className="py-3">
                              {snapshotLoadStates[source.id] ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                  Loading snapshot history...
                                </div>
                              ) : source.snapshots ? (
                                source.snapshots.length > 0 ? (
                                  <div className="overflow-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Snapshot</TableHead>
                                          <TableHead>Captured</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>Content Type</TableHead>
                                          <TableHead>Hash</TableHead>
                                          <TableHead>Run</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {source.snapshots.map((snapshot) => (
                                          <TableRow key={snapshot.id}>
                                            <TableCell className="font-mono text-xs">
                                              {snapshot.id}
                                            </TableCell>
                                            <TableCell>{formatDate(snapshot.retrievedAt)}</TableCell>
                                            <TableCell>{snapshot.httpStatus}</TableCell>
                                            <TableCell>{snapshot.contentType}</TableCell>
                                            <TableCell className="font-mono text-xs">
                                              {formatHash(snapshot.contentHash)}
                                            </TableCell>
                                            <TableCell>
                                              {snapshot.runId ? (
                                                <Link
                                                  href={`/runs/${snapshot.runId}`}
                                                  className="text-blue-600 hover:underline"
                                                >
                                                  {snapshot.runId}
                                                </Link>
                                              ) : (
                                                <span className="text-muted-foreground">—</span>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    No snapshots found for this source yet.
                                  </p>
                                )
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Snapshot details not loaded.
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => void loadSourceSnapshots(source.id)}
                                    className="ml-2 h-7 px-2"
                                  >
                                    Load now
                                  </Button>
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
