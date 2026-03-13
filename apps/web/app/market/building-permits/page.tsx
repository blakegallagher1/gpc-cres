"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { BuildingPermitsDashboard } from "@/components/market/BuildingPermitsDashboard";

export default function BuildingPermitsPage() {
  return (
    <DashboardShell>
      <BuildingPermitsDashboard />
    </DashboardShell>
  );
}
