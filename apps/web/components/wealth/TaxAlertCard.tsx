"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type TaxAlert } from "@/lib/data/wealthTypes";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, Info, DollarSign } from "lucide-react";

const SEVERITY_CONFIG: Record<
  TaxAlert["severity"],
  { icon: React.ElementType; badge: string; border: string; bg: string }
> = {
  critical: {
    icon: AlertTriangle,
    badge: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
    border: "border-l-red-500",
    bg: "bg-red-500/5",
  },
  warning: {
    icon: Clock,
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    border: "border-l-amber-500",
    bg: "bg-amber-500/5",
  },
  info: {
    icon: Info,
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    border: "border-l-blue-500",
    bg: "bg-blue-500/5",
  },
};

const TYPE_LABELS: Record<TaxAlert["type"], string> = {
  "1031_exchange": "1031 Exchange",
  cost_seg: "Cost Segregation",
  oz_deadline: "Opportunity Zone",
  depreciation_recapture: "Depreciation",
};

interface TaxAlertCardProps {
  alert: TaxAlert;
}

export function TaxAlertCard({ alert }: TaxAlertCardProps) {
  const config = SEVERITY_CONFIG[alert.severity];
  const Icon = config.icon;

  return (
    <Card className={cn("border-l-4 overflow-hidden", config.border, config.bg)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold leading-tight">{alert.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{alert.entityName}</p>
              </div>
              <Badge variant="outline" className={cn("shrink-0 text-xs", config.badge)}>
                {TYPE_LABELS[alert.type]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{alert.description}</p>
            <div className="flex items-center gap-4">
              {alert.daysRemaining !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      alert.daysRemaining <= 45
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {alert.daysRemaining} days remaining
                  </span>
                </div>
              )}
              {alert.estimatedImpact !== undefined && (
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {formatCurrency(alert.estimatedImpact).replace(".00", "")} impact
                  </span>
                </div>
              )}
            </div>

            {/* Deadline progress bar */}
            {alert.daysRemaining !== undefined && alert.daysRemaining <= 180 && (
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      alert.daysRemaining <= 30
                        ? "bg-red-500"
                        : alert.daysRemaining <= 90
                          ? "bg-amber-500"
                          : "bg-blue-500"
                    )}
                    style={{
                      width: `${Math.max(100 - (alert.daysRemaining / 180) * 100, 5)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
