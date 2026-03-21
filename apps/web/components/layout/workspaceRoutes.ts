import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  Crosshair,
  FileSearch,
  FileText,
  Map,
  MessageSquare,
  PieChart,
  Play,
  Shield,
  Sparkles,
  Wallet,
} from "lucide-react";

/**
 * Shared route metadata for the authenticated operating system shell.
 */
export interface WorkspaceNavItem {
  id: string;
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  title: string;
}

/**
 * Grouping metadata for the authenticated operating system navigation.
 */
export interface WorkspaceNavGroup {
  label: string;
  items: WorkspaceNavItem[];
}

/**
 * Route descriptor plus its parent navigation group.
 */
export interface WorkspaceRouteContext {
  route: WorkspaceNavItem;
  group: WorkspaceNavGroup;
}

const DEFAULT_ROUTE: WorkspaceNavItem = {
  id: "workspace",
  href: "/chat",
  icon: Building2,
  label: "Workspace",
  title: "Gallagher workspace",
  description: "Operate across development, investment, and entitlement workflows.",
};

/**
 * Canonical authenticated navigation structure for the application shell.
 */
export const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    label: "Execution",
    items: [
      {
        id: "chat",
        href: "/chat",
        icon: MessageSquare,
        label: "Chat",
        title: "Acquisition desk",
        description: "Run diligence, entitlement, and capital questions against live deal context.",
      },
      {
        id: "deals",
        href: "/deals",
        icon: Briefcase,
        label: "Deals",
        title: "Deal pipeline",
        description: "Review live projects, underwriting progress, and deal-room movement.",
      },
      {
        id: "map",
        href: "/map",
        icon: Map,
        label: "Map",
        title: "Parcel intelligence map",
        description: "Search parcels, draw geofences, and move site context into active workflows.",
      },
    ],
  },
  {
    label: "Development",
    items: [
      {
        id: "prospecting",
        href: "/prospecting",
        icon: Crosshair,
        label: "Prospecting",
        title: "Prospecting workspace",
        description: "Surface target sites, run screening filters, and shape the next acquisition set.",
      },
      {
        id: "opportunities",
        href: "/opportunities",
        icon: Sparkles,
        label: "Opportunities",
        title: "Opportunity inbox",
        description: "Triage sourced opportunities and route them into the operating pipeline.",
      },
    ],
  },
  {
    label: "Capital",
    items: [
      {
        id: "portfolio",
        href: "/portfolio",
        icon: PieChart,
        label: "Portfolio",
        title: "Portfolio view",
        description: "Track holdings, concentration, deployment, and portfolio-level performance.",
      },
      {
        id: "wealth",
        href: "/wealth",
        icon: Wallet,
        label: "Wealth",
        title: "Wealth operations",
        description: "Monitor entity structure, tax timing, and owner-level coordination.",
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        id: "command-center",
        href: "/command-center",
        icon: Sparkles,
        label: "Command Center",
        title: "Command center",
        description: "Review the current operating brief, priority queue, and portfolio pulse.",
      },
      {
        id: "agents",
        href: "/agents",
        icon: Bot,
        label: "Agents",
        title: "Agent roster",
        description: "Inspect active agents, responsibilities, and orchestration coverage.",
      },
      {
        id: "runs",
        href: "/runs",
        icon: Play,
        label: "Runs",
        title: "Run history",
        description: "Audit completed runs, trace output quality, and reopen prior execution paths.",
      },
      {
        id: "automation",
        href: "/automation",
        icon: Activity,
        label: "Automation",
        title: "Automation ledger",
        description: "Monitor recurring jobs, recent outcomes, and operational drift.",
      },
    ],
  },
  {
    label: "Reference",
    items: [
      {
        id: "reference",
        href: "/reference",
        icon: FileSearch,
        label: "Reference Data",
        title: "Reference data",
        description: "Maintain source records, lookup tables, and supporting operating context.",
      },
      {
        id: "market-settings",
        href: "/market",
        icon: BarChart3,
        label: "Market Intel",
        title: "Market intelligence",
        description: "Track the local market picture and supporting intelligence feeds.",
      },
      {
        id: "building-permits",
        href: "/market/building-permits",
        icon: FileText,
        label: "Permit Intel",
        title: "Permit intelligence",
        description: "Monitor permit activity and development velocity signals across the market.",
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        id: "admin",
        href: "/admin",
        icon: Shield,
        label: "Admin",
        title: "Admin controls",
        description: "Access system controls, operational tooling, and governance surfaces.",
      },
    ],
  },
];

const ALL_WORKSPACE_ROUTES = WORKSPACE_NAV_GROUPS.flatMap((group) => group.items);
const DEFAULT_GROUP = WORKSPACE_NAV_GROUPS[0]!;

/**
 * Total number of canonical authenticated routes in the operating-system shell.
 */
export const WORKSPACE_ROUTE_COUNT = ALL_WORKSPACE_ROUTES.length;

/**
 * Resolves the closest matching route descriptor for the current pathname.
 */
export function getWorkspaceRoute(pathname: string | null): WorkspaceNavItem {
  return getWorkspaceRouteContext(pathname).route;
}

/**
 * Resolves the closest matching route plus its parent navigation group.
 */
export function getWorkspaceRouteContext(pathname: string | null): WorkspaceRouteContext {
  if (!pathname) {
    return {
      route: DEFAULT_ROUTE,
      group: DEFAULT_GROUP,
    };
  }

  const matchedRoute =
    [...ALL_WORKSPACE_ROUTES]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? DEFAULT_ROUTE;

  const matchedGroup =
    WORKSPACE_NAV_GROUPS.find((group) =>
      group.items.some((item) => item.id === matchedRoute.id),
    ) ?? DEFAULT_GROUP;

  return {
    route: matchedRoute,
    group: matchedGroup,
  };
}
