"use client";

import { useState } from "react";
import { Search, Moon, Sun, Bell, Plus, Command, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/db/supabase";
import { toast } from "sonner";

export function Header() {
  const { theme, setTheme } = useTheme();
  const { sidebarCollapsed, openCommandPalette, toggleCopilot } = useUIStore();
  const [searchFocused, setSearchFocused] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    const { error } = await supabase.auth.signOut();
    setIsSigningOut(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Signed out");
    router.replace("/login");
  };

  return (
    <header
      className={cn(
        "fixed right-0 top-0 z-30 flex h-16 items-center justify-between border-b bg-card/80 px-6 backdrop-blur-xl transition-all duration-300",
        sidebarCollapsed ? "left-16" : "left-64"
      )}
    >
      {/* Search */}
      <div className="flex flex-1 items-center gap-4">
        <div
          className={cn(
            "relative flex w-full max-w-md items-center transition-all",
            searchFocused && "max-w-lg"
          )}
        >
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search agents, runs, workflows..."
            className="h-10 w-full rounded-lg border-0 bg-muted pl-10 pr-20 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                openCommandPalette();
              }
            }}
          />
          <div className="absolute right-2 flex items-center gap-1 text-xs text-muted-foreground">
            <kbd className="rounded bg-background px-1.5 py-0.5 font-mono">
              <Command className="inline h-3 w-3" />
            </kbd>
            <kbd className="rounded bg-background px-1.5 py-0.5 font-mono">
              K
            </kbd>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-muted-foreground"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>

        {/* Copilot Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCopilot}
          className="text-muted-foreground"
        >
          <Sparkles className="h-5 w-5" />
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="font-semibold">Notifications</span>
              <Button variant="ghost" size="sm" className="h-auto py-1 text-xs">
                Mark all read
              </Button>
            </div>
            <DropdownMenuItem className="flex flex-col items-start gap-1">
              <span className="font-medium">Financial Analyst completed</span>
              <span className="text-xs text-muted-foreground">2 minutes ago</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1">
              <span className="font-medium">Workflow execution failed</span>
              <span className="text-xs text-muted-foreground">15 minutes ago</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* New Run Button */}
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          <span>New Run</span>
        </Button>

        {/* Sign Out */}
        <Button
          variant="ghost"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="text-muted-foreground"
        >
          {isSigningOut ? "Signing out..." : "Sign Out"}
        </Button>
      </div>
    </header>
  );
}
