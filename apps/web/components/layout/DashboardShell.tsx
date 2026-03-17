"use client";

import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { useIsMobile } from "@/hooks/useIsMobile";

interface DashboardShellProps {
  children: React.ReactNode;
  noPadding?: boolean;
}

export function DashboardShell({ children, noPadding }: DashboardShellProps) {
  const { sidebarCollapsed, setCopilotOpen } = useUIStore();
  const isMobile = useIsMobile();

  // On mobile: close copilot by default
  useEffect(() => {
    if (isMobile) {
      setCopilotOpen(false);
    }
  }, [isMobile, setCopilotOpen]);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Header />
        <main
          className={cn(
            "pt-16 transition-all duration-300",
            isMobile ? "pl-0" : sidebarCollapsed ? "pl-16" : "pl-64"
          )}
        >
          {noPadding ? children : <div className="p-4 md:p-6">{children}</div>}
        </main>
        <CommandPalette />
        <CopilotPanel />
      </div>
    </AuthGuard>
  );
}
