"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  AlertTriangle,
  TrendingUp,
  Clock,
  Settings,
  Zap,
  BarChart3,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/stores/notificationStore";
import { supabase } from "@/lib/db/supabase";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  priority: string;
  readAt: string | null;
  dismissedAt: string | null;
  actionUrl: string | null;
  sourceAgent: string | null;
  createdAt: string;
  deal: { id: string; name: string } | null;
}

const typeIcons: Record<string, React.ElementType> = {
  ALERT: AlertTriangle,
  OPPORTUNITY: TrendingUp,
  DEADLINE: Clock,
  SYSTEM: Settings,
  MARKET: BarChart3,
  AUTOMATION: Zap,
};

const priorityColors: Record<string, string> = {
  CRITICAL: "text-red-500",
  HIGH: "text-orange-500",
  MEDIUM: "text-blue-500",
  LOW: "text-muted-foreground",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function groupByDate(items: NotificationItem[]): Map<string, NotificationItem[]> {
  const groups = new Map<string, NotificationItem[]>();
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;

  for (const item of items) {
    const ts = new Date(item.createdAt).getTime();
    let bucket: string;
    if (ts >= todayStart) bucket = "Today";
    else if (ts >= yesterdayStart) bucket = "Yesterday";
    else if (ts >= weekStart) bucket = "This Week";
    else bucket = "Earlier";

    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket)!.push(item);
  }
  return groups;
}

export function NotificationFeed() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    loading,
    feedOpen,
    setFeedOpen,
    setNotifications,
    setUnreadCount,
    setLoading,
    setHasMore,
    markOneRead,
    dismissOne,
    markAllRead,
    addRealtime,
  } = useNotificationStore();

  const hasFetched = useRef(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=30");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setHasMore(data.hasMore);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [setNotifications, setLoading, setHasMore]);

  // Fetch unread count on mount + poll every 30s
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/notifications/unread-count");
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count);
        }
      } catch {
        // Silently fail
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [setUnreadCount]);

  // Fetch feed data when dropdown opens
  useEffect(() => {
    if (feedOpen && !hasFetched.current) {
      hasFetched.current = true;
      fetchNotifications();
    }
    if (!feedOpen) {
      hasFetched.current = false;
    }
  }, [feedOpen, fetchNotifications]);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          addRealtime({
            id: row.id as string,
            type: row.type as string,
            title: row.title as string,
            body: row.body as string,
            priority: row.priority as string,
            readAt: null,
            dismissedAt: null,
            actionUrl: (row.action_url as string) ?? null,
            sourceAgent: (row.source_agent as string) ?? null,
            createdAt: row.created_at as string,
            deal: null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [addRealtime]);

  const handleMarkRead = async (id: string) => {
    markOneRead(id);
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read" }),
    });
  };

  const handleDismiss = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dismissOne(id);
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
  };

  const handleMarkAllRead = async () => {
    markAllRead();
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
  };

  const handleClick = (n: NotificationItem) => {
    if (!n.readAt) handleMarkRead(n.id);
    if (n.actionUrl) {
      router.push(n.actionUrl);
      setFeedOpen(false);
    } else if (n.deal) {
      router.push(`/deals/${n.deal.id}`);
      setFeedOpen(false);
    }
  };

  const grouped = groupByDate(notifications as NotificationItem[]);

  return (
    <DropdownMenu open={feedOpen} onOpenChange={setFeedOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 text-xs"
              onClick={handleMarkAllRead}
            >
              <Check className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Feed */}
        <ScrollArea className="max-h-[420px]">
          {loading && notifications.length === 0 ? (
            <div className="space-y-3 p-4">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-md bg-muted"
                />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No notifications yet
              </p>
              <p className="text-xs text-muted-foreground/60">
                Activity from your deals and automations will appear here.
              </p>
            </div>
          ) : (
            <div className="py-1">
              {Array.from(grouped.entries()).map(([label, items]) => (
                <div key={label}>
                  <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {label}
                  </p>
                  {items.map((n) => {
                    const Icon = typeIcons[n.type] ?? Bell;
                    const colorClass =
                      priorityColors[n.priority] ?? "text-muted-foreground";
                    const isUnread = !n.readAt;

                    return (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={cn(
                          "group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted",
                          isUnread && "bg-primary/5"
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                            isUnread ? "bg-primary/10" : "bg-muted"
                          )}
                        >
                          <Icon className={cn("h-3.5 w-3.5", colorClass)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm",
                              isUnread
                                ? "font-medium"
                                : "text-muted-foreground"
                            )}
                          >
                            {n.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {n.body}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                            <span>{timeAgo(n.createdAt)}</span>
                            {n.deal && (
                              <>
                                <span>·</span>
                                <span className="truncate">
                                  {n.deal.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDismiss(e, n.id)}
                          className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto w-full py-1.5 text-xs"
              onClick={() => {
                router.push("/command-center");
                setFeedOpen(false);
              }}
            >
              View all activity
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
