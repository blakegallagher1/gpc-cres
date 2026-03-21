"use client";

import { useEffect, type CSSProperties } from "react";
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

const APP_SHELL_STYLE = {
  "--app-header-height": "5rem",
  "--app-sidebar-expanded": "18rem",
  "--app-sidebar-collapsed": "5.5rem",
} as CSSProperties;

/**
 * Shared authenticated shell for the operating-system routes.
 */
export function DashboardShell({ children, noPadding }: DashboardShellProps) {
  const { sidebarCollapsed, setSidebarCollapsed, setCopilotOpen } = useUIStore();
  const isMobile = useIsMobile();

  // On mobile: collapse sidebar and close copilot by default
  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
      setCopilotOpen(false);
    }
  }, [isMobile, setSidebarCollapsed, setCopilotOpen]);

  return (
    <AuthGuard>
      <div className="app-shell min-h-screen" style={APP_SHELL_STYLE}>
        <Sidebar />
        <Header />
        <main
          className={cn(
            "relative min-h-screen transition-[padding] duration-300",
            "pt-[var(--app-header-height)]",
            isMobile
              ? "pl-0"
              : sidebarCollapsed
                ? "pl-[var(--app-sidebar-collapsed)]"
                : "pl-[var(--app-sidebar-expanded)]"
          )}
        >
          {noPadding ? (
            children
          ) : (
            <div className="min-h-[calc(100svh-var(--app-header-height))] px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5">
              {children}
            </div>
          )}
        </main>
        <CommandPalette />
        <CopilotPanel />
      </div>
    </AuthGuard>
  );
}
