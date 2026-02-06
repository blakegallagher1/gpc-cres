"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const skuConfig: Record<string, { label: string; className: string }> = {
  SMALL_BAY_FLEX: { label: "Small Bay Flex", className: "bg-blue-100 text-blue-700 border-blue-200" },
  OUTDOOR_STORAGE: { label: "Outdoor Storage", className: "bg-amber-100 text-amber-700 border-amber-200" },
  TRUCK_PARKING: { label: "Truck Parking", className: "bg-purple-100 text-purple-700 border-purple-200" },
};

interface SkuBadgeProps {
  sku: string;
  className?: string;
}

export function SkuBadge({ sku, className }: SkuBadgeProps) {
  const config = skuConfig[sku] ?? { label: sku, className: "bg-gray-100 text-gray-700 border-gray-200" };

  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
