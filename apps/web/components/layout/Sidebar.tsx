"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { Building2, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Menu } from "lucide-react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  getWorkspaceRouteContext,
  PINNED_NAV_ITEM,
  FOOTER_NAV_ITEMS,
  WORKSPACE_NAV_GROUPS,
  WORKSPACE_ROUTE_COUNT,
} from "./workspaceRoutes";

const SIDEBAR_TRANSITION = { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };

/**
 * Primary authenticated navigation rail for the operating system.
 */
export function Sidebar() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { data: session } = useSession();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const isMobile = useIsMobile();
  const { route: activeRoute, group: activeGroup } = getWorkspaceRouteContext(pathname);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Load collapsed groups from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed-groups");
    if (stored) {
      try {
        setCollapsedGroups(JSON.parse(stored));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Persist collapsed groups to localStorage
  const toggleGroupCollapse = (groupLabel: string) => {
    setCollapsedGroups((prev) => {
      const updated = {
        ...prev,
        [groupLabel]: !prev[groupLabel],
      };
      localStorage.setItem("sidebar-collapsed-groups", JSON.stringify(updated));
      return updated;
    });
  };

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date()),
    [],
  );
  const userName = session?.user?.name?.trim() || "Gallagher team";
  const userLabel = session?.user?.email?.trim() || "Operator access";

  // On mobile: sidebar is hidden by default, shown as overlay when not collapsed
  const mobileHidden = isMobile && sidebarCollapsed;
  const mobileOpen = isMobile && !sidebarCollapsed;
  const isExpanded = isMobile || !sidebarCollapsed;

  return (
    <>
      {/* Mobile hamburger button — only visible when sidebar is hidden on mobile */}
      {mobileHidden && (
        <button
          onClick={toggleSidebar}
          className="app-shell-panel fixed left-3 top-5 z-50 flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground shadow-lg md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      {/* Backdrop for mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border/55 bg-background/72 backdrop-blur-2xl transition-[width,transform] duration-300",
          "w-[var(--app-sidebar-expanded)]",
          isMobile
            ? cn(
                "shadow-2xl",
                sidebarCollapsed && "-translate-x-full"
              )
            : sidebarCollapsed
              ? "w-[var(--app-sidebar-collapsed)]"
              : "w-[var(--app-sidebar-expanded)]"
        )}
        >
        <div className="flex h-[var(--app-header-height)] items-center border-b border-border/60 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/55 bg-background/44">
              <Building2 className="h-5 w-5 text-foreground/85" />
            </div>
            {isExpanded && (
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-[-0.03em]">
                  Gallagher Property Company
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  Development and investment OS
                </p>
              </div>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="border-b border-border/60 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              System Index
            </p>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div>
                <span className="text-sm font-medium">{todayLabel}</span>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeGroup.label} desk active
                </p>
              </div>
              <div className="text-right">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {WORKSPACE_ROUTE_COUNT} routes
                </span>
                <p className="mt-2 text-xs text-muted-foreground">{activeRoute.label} selected</p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {/* Pinned Chat Item */}
          {isExpanded && (
            <div className="mb-3 pb-3 border-b border-white/10">
              {(() => {
                const Icon = PINNED_NAV_ITEM.icon;
                const isActive = activeRoute.href === PINNED_NAV_ITEM.href;
                return (
                  <Link
                    href={PINNED_NAV_ITEM.href}
                    onClick={() => {
                      if (isMobile) toggleSidebar();
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex min-h-12 items-start gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left text-sm transition-[color,background-color] duration-200",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title={!isExpanded ? PINNED_NAV_ITEM.label : undefined}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="workspace-active-pill"
                        transition={reduceMotion ? { duration: 0 } : SIDEBAR_TRANSITION}
                        className="app-shell-panel absolute inset-0 rounded-2xl"
                      />
                    )}
                    <span
                      className={cn(
                        "relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors",
                        isActive
                          ? "border-border bg-background/70 text-foreground"
                          : "border-transparent bg-transparent text-muted-foreground group-hover:border-border/60 group-hover:bg-background/60 group-hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="relative z-10 min-w-0 flex-1">
                      <span className="block truncate font-medium">{PINNED_NAV_ITEM.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {PINNED_NAV_ITEM.description}
                      </span>
                    </span>
                  </Link>
                );
              })()}
            </div>
          )}

          {/* Nav Groups with Collapse */}
          {WORKSPACE_NAV_GROUPS.map((group) => {
            const isCollapsed = collapsedGroups[group.label];
            return (
              <div key={group.label} className="mb-5">
                {isExpanded && (
                  <button
                    onClick={() => toggleGroupCollapse(group.label)}
                    className="mb-2 flex w-full min-h-[44px] items-center justify-between gap-2 px-3 text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/80">
                        {group.label}
                      </p>
                    </div>
                    <span className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground flex-shrink-0">
                      {group.items.length}
                    </span>
                  </button>
                )}
                {!isCollapsed && (
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeRoute.href === item.href;

                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => {
                            if (isMobile) toggleSidebar();
                          }}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "group relative flex min-h-12 items-start gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left text-sm transition-[color,background-color] duration-200",
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          title={!isExpanded ? item.label : undefined}
                        >
                          {isActive && (
                            <motion.span
                              layoutId="workspace-active-pill"
                              transition={reduceMotion ? { duration: 0 } : SIDEBAR_TRANSITION}
                              className="absolute inset-0 rounded-2xl border border-border/60 bg-background/52"
                            />
                          )}
                          <span
                            className={cn(
                              "relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors",
                              isActive
                                ? "border-border/60 bg-background/64 text-foreground"
                                : "border-transparent bg-transparent text-muted-foreground group-hover:border-border/50 group-hover:bg-background/36 group-hover:text-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          {isExpanded && (
                            <span className="relative z-10 min-w-0 flex-1">
                              <span className="block truncate font-medium">{item.label}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {item.description}
                              </span>
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer Items */}
        {isExpanded && (
          <div className="mt-3 border-t border-border/50 px-3 py-3 pt-3">
            <div className="flex items-center gap-2">
              {FOOTER_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeRoute.href === item.href;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => {
                      if (isMobile) toggleSidebar();
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex flex-1 min-h-10 items-center justify-center gap-2 overflow-hidden rounded-xl px-2 py-2 text-left text-xs transition-[color,background-color] duration-200",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title={item.label}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="workspace-active-pill"
                        transition={reduceMotion ? { duration: 0 } : SIDEBAR_TRANSITION}
                        className="absolute inset-0 rounded-xl border border-border/60 bg-background/52"
                      />
                    )}
                    <span
                      className={cn(
                        "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors",
                        isActive
                          ? "border-border/60 bg-background/64 text-foreground"
                          : "border-transparent bg-transparent text-muted-foreground group-hover:border-border/50 group-hover:bg-background/36 group-hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <span className="relative z-10 text-[10px] font-medium hidden sm:inline">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="border-t border-border/60 p-3">
          <div className="app-shell-panel flex items-center gap-3 rounded-2xl px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-foreground/80">
              G
            </div>
            {isExpanded && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">{userLabel}</p>
              </div>
            )}
          </div>
        </div>

        {!isMobile && (
          <button
            onClick={toggleSidebar}
            className="app-shell-panel absolute -right-3 top-24 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground shadow-lg transition-colors hover:text-foreground"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        )}
      </aside>
    </>
  );
}
