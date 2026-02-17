"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Briefcase,
  Map,
  PieChart,
  Wallet,
  FileSearch,
  Building2,
  Bot,
  Play,
  Sparkles,
  Crosshair,
  Activity,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";

interface NavItem {
  id: string;
  href: string;
  icon: React.ElementType;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { id: "chat", href: "/", icon: MessageSquare, label: "Chat" },
      { id: "deals", href: "/deals", icon: Briefcase, label: "Deals" },
      { id: "map", href: "/map", icon: Map, label: "Map" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { id: "prospecting", href: "/prospecting", icon: Crosshair, label: "Prospecting" },
      { id: "portfolio", href: "/portfolio", icon: PieChart, label: "Portfolio" },
      { id: "wealth", href: "/wealth", icon: Wallet, label: "Wealth" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "command-center", href: "/command-center", icon: Sparkles, label: "Command Center" },
      { id: "agents", href: "/agents", icon: Bot, label: "Agents" },
      { id: "runs", href: "/runs", icon: Play, label: "Runs" },
      { id: "automation", href: "/automation", icon: Activity, label: "Automation" },
    ],
  },
  {
    label: "Settings",
    items: [
      { id: "reference", href: "/reference", icon: FileSearch, label: "Reference Data" },
      { id: "market-settings", href: "/market", icon: BarChart3, label: "Market Intel" },
    ],
  },
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
            <h1 className="truncate font-bold">Gallagher OS</h1>
            <p className="truncate text-xs text-muted-foreground">
              CRE Platform
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!sidebarCollapsed && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      (pathname?.startsWith(`${item.href}/`) ?? false);

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
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
