"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, MapPin, RefreshCw } from "lucide-react";

interface JurisdictionItem {
  id: string;
  name: string;
  kind: string;
  state: string;
  timezone: string;
  seedSourceCount: number;
  dealCount: number;
  latestPack?: {
    generatedAt: string;
    version: number;
    sourceUrls: string[];
    sourceEvidenceIds: string[];
    sourceSnapshotIds: string[];
    officialOnly: boolean;
    packCoverageScore: number | null;
    canonicalSchemaVersion: string | null;
  } | null;
  packContext?: {
    hasPack: boolean;
    isStale: boolean;
    stalenessDays: number | null;
    missingEvidence: string[];
  };
}

export default function JurisdictionsPage() {
  const [jurisdictions, setJurisdictions] = useState<JurisdictionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/jurisdictions")
      .then((res) => res.json())
      .then((data) => setJurisdictions(data.jurisdictions ?? []))
      .catch((err) => {
        console.error("Failed to load jurisdictions:", err);
        toast.error("Failed to load jurisdictions");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Jurisdictions</h1>
          <p className="text-sm text-muted-foreground">
            Parish and city jurisdictions with entitlement rules and seed sources.
          </p>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading jurisdictions...
            </CardContent>
          </Card>
        ) : jurisdictions.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              No jurisdictions configured yet. Seed the database to add jurisdictions.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-center">Seed Sources</TableHead>
                  <TableHead className="text-center">Deals</TableHead>
                  <TableHead>Pack Freshness</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jurisdictions.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{j.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {j.kind}
                      </Badge>
                    </TableCell>
                    <TableCell>{j.state}</TableCell>
                    <TableCell className="text-center">{j.seedSourceCount}</TableCell>
                    <TableCell className="text-center">{j.dealCount}</TableCell>
                  <TableCell>
                      {j.packContext?.hasPack ? (
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span>
                              v{j.latestPack?.version} • {
                                j.latestPack?.generatedAt ? formatDate(j.latestPack.generatedAt) : "Unknown"
                              } •{" "}
                              {j.latestPack?.sourceUrls?.length ?? 0} sources •{" "}
                              {j.latestPack?.officialOnly ? "official-only" : "full"} scope
                            </span>
                          </div>
                          {j.packContext.stalenessDays !== null && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <RefreshCw className="h-3.5 w-3.5" />
                              Pack age: {j.packContext.stalenessDays} day(s)
                              {j.packContext.isStale ? " (stale)" : ""}
                            </div>
                          )}
                          {(j.packContext.missingEvidence?.length ?? 0) > 0 ? (
                            <div className="space-y-1">
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {j.packContext.missingEvidence.length} missing evidence item(s)
                              </Badge>
                              <ul className="list-disc pl-4 text-xs text-muted-foreground">
                                {j.packContext.missingEvidence.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-amber-500" />
                          <span className="text-sm text-muted-foreground">
                            No pack generated
                          </span>
                        </div>
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
