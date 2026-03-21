import { CommandCenterWorkspace } from "@/components/command-center/CommandCenterWorkspace";
import { DashboardShell } from "@/components/layout/DashboardShell";

/** Command-center route for daily operating review and action handoff. */
export default function CommandCenterPage() {
  return (
    <DashboardShell>
      <CommandCenterWorkspace />
    </DashboardShell>
  );
}
