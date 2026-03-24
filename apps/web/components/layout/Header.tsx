"use client";

import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Search, Moon, Sun, Plus, Command, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { NotificationFeed } from "@/components/notifications/NotificationFeed";
import {
  getWorkspaceRouteContext,
  WORKSPACE_ROUTE_COUNT,
} from "./workspaceRoutes";

const HEADER_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

/**
 * Fixed application header with route context, command search, and global actions.
 */
export function Header() {
  const { theme, setTheme } = useTheme();
  const { sidebarCollapsed, openCommandPalette, toggleCopilot } = useUIStore();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const [searchFocused, setSearchFocused] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [commandKeyLabel, setCommandKeyLabel] = useState("Ctrl");
  const router = useRouter();
  const pathname = usePathname();
  const isMapPage = pathname?.startsWith("/map");
  const { route, group } = getWorkspaceRouteContext(pathname);
  const RouteIcon = route.icon;
  const searchPlaceholder = `Search ${group.label.toLowerCase()}, parcels, runs, and workflows`;

  useEffect(() => {
    if (typeof window === "undefined") return;

    setCommandKeyLabel(/Mac|iPhone|iPad/.test(window.navigator.platform) ? "⌘" : "Ctrl");
  }, []);

  const openCommandSearch = () => {
    setSearchFocused(true);
    openCommandPalette();
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      await signOut({ redirectTo: "/login" });
      toast.success("Signed out");
    } catch {
      toast.error("Sign out failed. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header
      className={cn(
        "fixed right-0 top-0 z-30 border-b border-border/50 bg-background/72 backdrop-blur-2xl transition-[left] duration-300",
        "h-[var(--app-header-height)]",
        isMobile
          ? "left-0 px-3"
          : cn(
              "px-4 md:px-6",
              sidebarCollapsed
                ? "left-[var(--app-sidebar-collapsed)]"
                : "left-[var(--app-sidebar-expanded)]",
            )
      )}
    >
      <div className="flex h-full w-full items-center justify-between gap-3">
        <motion.div
          key={route.href}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={HEADER_TRANSITION}
          className="min-w-0 flex-1"
        >
          <div className="flex items-center gap-3">
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/36 md:flex">
              <RouteIcon className="h-5 w-5 text-foreground/85" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/80">
                  Gallagher Property Company
                </p>
                {!isMobile && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/75">
                    {group.label}
                  </span>
                )}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                {isMobile && <RouteIcon className="h-4 w-4 shrink-0 text-foreground/80" />}
                <h1 className="truncate text-base font-semibold tracking-[-0.03em] md:text-xl">
                  {route.title}
                </h1>
              </div>
              {!isMobile && (
                <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
                    {group.items.length} routes
                  </span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-border/90" />
                  <p className="truncate">{route.description}</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {!isMobile && (
          <div className="hidden flex-[0_1_34rem] xl:block">
            <div
              className={cn(
                "relative flex h-11 items-center rounded-xl border border-border/55 bg-background/40 px-3 transition-all",
                searchFocused && "border-foreground/18 bg-background/64"
              )}
              role="button"
              tabIndex={0}
              aria-label="Open desktop command search"
              onClick={openCommandSearch}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openCommandSearch();
                }
              }}
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                className="h-full w-full border-0 bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
                readOnly
                onFocus={(event) => {
                  openCommandSearch();
                  event.target.blur();
                }}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    openCommandPalette();
                  }
                  if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    openCommandPalette();
                  }
                }}
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
                  {WORKSPACE_ROUTE_COUNT} desks
                </span>
                <kbd className="rounded-md border border-border/55 bg-background/55 px-1.5 py-0.5 font-mono">
                  {commandKeyLabel === "⌘" ? (
                    <Command className="inline h-3 w-3" />
                  ) : (
                    commandKeyLabel
                  )}
                </kbd>
                <kbd className="rounded-md border border-border/55 bg-background/55 px-1.5 py-0.5 font-mono">K</kbd>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 md:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={openCommandPalette}
            className="text-muted-foreground lg:hidden"
            aria-label="Open command search"
          >
            <Search className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="text-muted-foreground"
            aria-label="Toggle theme"
          >
            {!mounted ? (
              <span className="h-5 w-5" />
            ) : theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          {!isMapPage && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCopilot}
              className="text-muted-foreground"
              aria-label="Toggle Copilot"
            >
              <Sparkles className="h-5 w-5" />
            </Button>
          )}

          <NotificationFeed />

          <Button
            className="gap-2 rounded-xl"
            size={isMobile ? "icon" : "default"}
            onClick={() => {
              const newId = crypto.randomUUID();
              router.push(`/chat?conversationId=${newId}`);
            }}
          >
            <Plus className="h-4 w-4" />
            {!isMobile && <span>New Run</span>}
          </Button>

          {!isMobile && (
            <Button
              variant="ghost"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="text-muted-foreground"
            >
              {isSigningOut ? "Signing out..." : "Sign Out"}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
