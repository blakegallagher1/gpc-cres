"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type CashFlowItem } from "@/lib/data/mockWealth";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface CashFlowWaterfallProps {
  items: CashFlowItem[];
}

export function CashFlowWaterfall({ items }: CashFlowWaterfallProps) {
  // Find max absolute value for scaling
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.amount)));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cash Flow Waterfall</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item, i) => {
            const pct = (Math.abs(item.amount) / maxAbs) * 100;
            const isNegative = item.amount < 0;
            const isSubtotal = item.type === "subtotal";

            let barColor: string;
            if (isSubtotal) {
              barColor = item.amount >= 0
                ? "bg-emerald-500 dark:bg-emerald-600"
                : "bg-red-500 dark:bg-red-600";
            } else if (item.type === "revenue") {
              barColor = "bg-blue-500 dark:bg-blue-600";
            } else if (item.type === "distribution") {
              barColor = "bg-amber-500 dark:bg-amber-600";
            } else {
              barColor = "bg-red-400 dark:bg-red-500";
            }

            return (
              <div key={i}>
                {isSubtotal && i > 0 && (
                  <div className="my-1 border-t border-dashed border-border" />
                )}
                <div className="flex items-center gap-3">
                  <div className="w-40 shrink-0 text-right">
                    <span
                      className={cn(
                        "text-sm",
                        isSubtotal ? "font-semibold" : "text-muted-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div
                      className={cn("h-6 rounded-sm transition-all duration-500", barColor)}
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                  <div className="w-28 shrink-0 text-right">
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        isNegative
                          ? "text-red-600 dark:text-red-400"
                          : "text-foreground"
                      )}
                    >
                      {isNegative ? "(" : ""}
                      {formatCurrency(Math.abs(item.amount)).replace(".00", "")}
                      {isNegative ? ")" : ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 border-t pt-3">
          {[
            { label: "Revenue", color: "bg-blue-500" },
            { label: "Expense", color: "bg-red-400" },
            { label: "Subtotal", color: "bg-emerald-500" },
            { label: "Distribution", color: "bg-amber-500" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={cn("h-2.5 w-2.5 rounded-sm", item.color)} />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
