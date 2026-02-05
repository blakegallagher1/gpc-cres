"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const { sidebarCollapsed } = useUIStore();

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Header />
        <main
          className={cn(
            "pt-16 transition-all duration-300",
            sidebarCollapsed ? "pl-16" : "pl-64"
          )}
        >
          <div className="p-6">{children}</div>
        </main>
        <CommandPalette />
        <CopilotPanel />
      </div>
    </AuthGuard>
  );
}
