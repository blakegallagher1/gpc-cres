"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Workflow,
  PlayCircle,
  Rocket,
  Settings,
  Building2,
  Presentation,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";

const navItems = [
  { id: "dashboard", href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { id: "deal-room", href: "/deal-room", icon: Presentation, label: "Deal Room" },
  { id: "screening", href: "/screening", icon: ClipboardCheck, label: "Screening" },
  { id: "agents", href: "/agents", icon: Bot, label: "Agent Library" },
  { id: "workflows", href: "/workflows", icon: Workflow, label: "Workflows" },
  { id: "runs", href: "/runs", icon: PlayCircle, label: "Run History" },
  { id: "deploy", href: "/deploy", icon: Rocket, label: "Deploy" },
  { id: "settings", href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r bg-card transition-all duration-300",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
          <Building2 className="h-6 w-6 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="overflow-hidden">
            <h1 className="truncate font-bold">GPC Agents</h1>
            <p className="truncate text-xs text-muted-foreground">
              Orchestration
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
          <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-green-400 to-blue-500" />
          {!sidebarCollapsed && (
            <div className="min-w-0 overflow-hidden">
              <p className="truncate text-sm font-medium">Admin User</p>
              <p className="truncate text-xs text-muted-foreground">
                Gallagher Property
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-foreground"
      >
        {sidebarCollapsed ? ">" : "<"}
      </button>
    </aside>
  );
}
