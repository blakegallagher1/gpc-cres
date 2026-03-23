import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  FileSearch,
  LayoutDashboard,
  Map,
  MessageSquare,
  PieChart,
  Settings,
  Shield,
  Sparkles,
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
  id: "chat",
  href: "/chat",
  icon: MessageSquare,
  label: "Chat",
  title: "Chat",
  description: "AI assistant for ad-hoc queries and agent interactions",
};

/**
 * Pinned item — always visible above groups.
 */
export const PINNED_NAV_ITEM: WorkspaceNavItem = {
  id: "chat",
  href: "/chat",
  icon: MessageSquare,
  label: "Chat",
  description: "AI assistant for ad-hoc queries and agent interactions",
  title: "Chat",
};

/**
 * Footer items — below groups, above user profile.
 */
export const FOOTER_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    id: "settings",
    href: "/settings",
    icon: Settings,
    label: "Settings",
    description: "User preferences and configuration",
    title: "Settings",
  },
  {
    id: "admin",
    href: "/admin",
    icon: Shield,
    label: "Admin",
    description: "System configuration and user management",
    title: "Admin",
  },
];

/**
 * Canonical authenticated navigation structure for the application shell.
 */
export const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    label: "Operate",
    items: [
      {
        id: "command-center",
        href: "/command-center",
        icon: LayoutDashboard,
        label: "Command Center",
        description: "Daily cockpit, AI operating brief, priority queue",
        title: "Command Center",
      },
      {
        id: "deals",
        href: "/deals",
        icon: Briefcase,
        label: "Deals",
        description: "Pipeline hub with Kanban board and deal details",
        title: "Deals",
      },
      {
        id: "map",
        href: "/map",
        icon: Map,
        label: "Map",
        description: "Spatial intelligence, prospecting, and parcel analysis",
        title: "Map",
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        id: "opportunities",
        href: "/opportunities",
        icon: Sparkles,
        label: "Opportunities",
        description: "Match inbox from automated scans",
        title: "Opportunities",
      },
      {
        id: "market-intel",
        href: "/market",
        icon: BarChart3,
        label: "Market Intel",
        description: "Parish data, permits, and market analysis",
        title: "Market Intel",
      },
      {
        id: "portfolio",
        href: "/portfolio",
        icon: PieChart,
        label: "Portfolio",
        description: "Financial analytics and portfolio tracking",
        title: "Portfolio",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        id: "agents",
        href: "/agents",
        icon: Bot,
        label: "Agents & Runs",
        description: "Agent roster and run history",
        title: "Agents & Runs",
      },
      {
        id: "automation",
        href: "/automation",
        icon: Activity,
        label: "Automation",
        description: "Background job configuration and monitoring",
        title: "Automation",
      },
      {
        id: "reference",
        href: "/reference",
        icon: FileSearch,
        label: "Reference Data",
        description: "Parish rules, zoning codes, and reference data",
        title: "Reference Data",
      },
    ],
  },
];

const ALL_WORKSPACE_ROUTES = [
  PINNED_NAV_ITEM,
  ...WORKSPACE_NAV_GROUPS.flatMap((group) => group.items),
  ...FOOTER_NAV_ITEMS,
];
const DEFAULT_GROUP = WORKSPACE_NAV_GROUPS[0]!;

/**
 * Total number of canonical authenticated routes in the operating-system shell.
 */
export const WORKSPACE_ROUTE_COUNT = WORKSPACE_NAV_GROUPS.flatMap((group) => group.items).length;

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

  // Check pinned item first
  if (pathname === PINNED_NAV_ITEM.href || pathname.startsWith(`${PINNED_NAV_ITEM.href}/`)) {
    return {
      route: PINNED_NAV_ITEM,
      group: DEFAULT_GROUP,
    };
  }

  // Check footer items
  const footerMatch = FOOTER_NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  if (footerMatch) {
    return {
      route: footerMatch,
      group: DEFAULT_GROUP,
    };
  }

  // Check grouped items
  const matchedRoute =
    [...WORKSPACE_NAV_GROUPS.flatMap((group) => group.items)]
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
