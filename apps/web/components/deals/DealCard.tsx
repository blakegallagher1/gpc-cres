"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { SkuBadge } from "./SkuBadge";
import { TriageIndicator } from "./TriageIndicator";
import { formatDate } from "@/lib/utils";

export interface DealSummary {
  id: string;
  name: string;
  sku: string;
  status: string;
  jurisdiction?: { name: string } | null;
  createdAt: string;
  triageTier?: string | null;
  triageScore?: number | null;
}

interface DealCardProps {
  deal: DealSummary;
}

export function DealCard({ deal }: DealCardProps) {
  return (
    <Link href={`/deals/${deal.id}`}>
      <Card className="cursor-pointer transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{deal.name}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {deal.jurisdiction?.name ?? "No jurisdiction"}
            </p>
          </div>
          <TriageIndicator tier={deal.triageTier} />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <SkuBadge sku={deal.sku} />
            <StatusBadge status={deal.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Created {formatDate(deal.createdAt)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
