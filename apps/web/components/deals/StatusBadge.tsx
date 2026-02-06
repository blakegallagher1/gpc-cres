"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  INTAKE: { label: "Intake", className: "bg-gray-100 text-gray-700 border-gray-200" },
  TRIAGE_DONE: { label: "Triage Done", className: "bg-blue-100 text-blue-700 border-blue-200" },
  PREAPP: { label: "Pre-App", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  CONCEPT: { label: "Concept", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  NEIGHBORS: { label: "Neighbors", className: "bg-orange-100 text-orange-700 border-orange-200" },
  SUBMITTED: { label: "Submitted", className: "bg-orange-100 text-orange-700 border-orange-200" },
  HEARING: { label: "Hearing", className: "bg-purple-100 text-purple-700 border-purple-200" },
  APPROVED: { label: "Approved", className: "bg-green-100 text-green-700 border-green-200" },
  EXIT_MARKETED: { label: "Exit Marketed", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  EXITED: { label: "Exited", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  KILLED: { label: "Killed", className: "bg-red-100 text-red-700 border-red-200" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, className: "bg-gray-100 text-gray-700 border-gray-200" };

  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
