"use client";

import { Suspense, useEffect, type CSSProperties } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PageTransition } from "@/components/transitions/PageTransition";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  const isChatRoute = pathname === "/chat" || pathname?.startsWith("/chat/");
  const shellStyle: CSSProperties = {
    ...APP_SHELL_STYLE,
    ...(isChatRoute ? { "--app-header-height": "4.25rem" } : null),
  };

  // On mobile: collapse sidebar and close copilot by default
  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
      setCopilotOpen(false);
    }
  }, [isMobile, setSidebarCollapsed, setCopilotOpen]);

  return (
    <AuthGuard>
      <div className="app-shell min-h-screen" style={shellStyle}>
        <a
          href="#main-content"
          className="sr-only absolute left-4 top-4 z-[70] rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Skip to main content
        </a>
        <Sidebar />
        <Header />
        <main
          id="main-content"
          tabIndex={-1}
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
          <PageTransition>
            {noPadding ? (
              children
            ) : (
              <div className="min-h-[calc(100svh-var(--app-header-height))] px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5">
                {children}
              </div>
            )}
          </PageTransition>
        </main>
        <CommandPalette />
        <Suspense fallback={null}>
          <CopilotPanel />
        </Suspense>
      </div>
    </AuthGuard>
  );
}
