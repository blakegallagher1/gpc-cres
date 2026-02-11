"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { PortfolioDeal } from "@/lib/data/portfolioConstants";
import type { Match1031Result } from "@/lib/services/portfolioAnalytics.service";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function getScoreBadge(score: number) {
  if (score >= 70)
    return (
      <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
        Strong
      </Badge>
    );
  if (score >= 50)
    return (
      <Badge className="bg-amber-100 text-amber-700 text-[10px]">
        Moderate
      </Badge>
    );
  return (
    <Badge className="bg-gray-100 text-gray-600 text-[10px]">Weak</Badge>
  );
}

export function Exchange1031Matcher({ deals }: { deals: PortfolioDeal[] }) {
  const [selectedDealId, setSelectedDealId] = useState<string>("");

  const { data, isLoading } = useSWR<Match1031Result>(
    selectedDealId ? `/api/portfolio/1031-matches/${selectedDealId}` : null,
    fetcher
  );

  // Candidates for disposition: advanced pipeline or exited deals
  const dispositionCandidates = deals.filter((d) =>
    ["APPROVED", "EXIT_MARKETED", "EXITED"].includes(d.status)
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ArrowRightLeft className="h-4 w-4" />
          1031 Exchange Matcher
        </CardTitle>
        <CardDescription className="text-xs">
          Select a disposition deal to find exchange candidates in your pipeline
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <select
          value={selectedDealId}
          onChange={(e) => setSelectedDealId(e.target.value)}
          className="h-8 w-full rounded-md border bg-background px-3 text-xs"
        >
          <option value="">Select a deal to exchange...</option>
          {dispositionCandidates.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.status.replace(/_/g, " ")})
            </option>
          ))}
          {dispositionCandidates.length === 0 &&
            deals
              .filter((d) => d.status !== "KILLED")
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.status.replace(/_/g, " ")})
                </option>
              ))}
        </select>

        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && !isLoading && (
          <>
            <div className="rounded-lg bg-muted p-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-muted-foreground">Est. Sale Price:</span>{" "}
                  <span className="font-semibold">
                    {formatCurrency(data.estimatedSalePrice)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">45-Day ID:</span>{" "}
                  <span className="font-semibold">
                    {data.identificationDeadline}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">180-Day Close:</span>{" "}
                  <span className="font-semibold">{data.closeDeadline}</span>
                </div>
              </div>
            </div>

            {data.candidates.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No qualifying exchange candidates found in your pipeline
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Deal</TableHead>
                      <TableHead className="text-right text-xs">
                        Value
                      </TableHead>
                      <TableHead className="text-center text-xs">
                        Match
                      </TableHead>
                      <TableHead className="text-xs">Reasons</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.candidates.map((m) => (
                      <TableRow key={m.dealId}>
                        <TableCell className="text-xs font-medium">
                          {m.dealName}
                          <div className="text-[10px] text-muted-foreground">
                            {m.jurisdiction} &middot; {m.acreage.toFixed(1)} ac
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatCurrency(m.estimatedValue)}
                        </TableCell>
                        <TableCell className="text-center">
                          {getScoreBadge(m.matchScore)}
                        </TableCell>
                        <TableCell className="max-w-[200px] text-[10px] text-muted-foreground">
                          {m.matchReasons.slice(0, 2).join("; ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
