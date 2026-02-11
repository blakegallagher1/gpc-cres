import { create } from "zustand";

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

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  hasMore: boolean;
  feedOpen: boolean;

  setFeedOpen: (open: boolean) => void;
  setNotifications: (notifications: NotificationItem[]) => void;
  appendNotifications: (notifications: NotificationItem[]) => void;
  setUnreadCount: (count: number) => void;
  setLoading: (loading: boolean) => void;
  setHasMore: (hasMore: boolean) => void;
  markOneRead: (id: string) => void;
  dismissOne: (id: string) => void;
  markAllRead: () => void;
  addRealtime: (notification: NotificationItem) => void;
}

export const useNotificationStore = create((set): NotificationState => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  hasMore: false,
  feedOpen: false,

  setFeedOpen: (feedOpen) => set({ feedOpen }),
  setNotifications: (notifications) => set({ notifications }),
  appendNotifications: (newItems) =>
    set((state) => ({
      notifications: [...state.notifications, ...newItems],
    })),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setLoading: (loading) => set({ loading }),
  setHasMore: (hasMore) => set({ hasMore }),
  markOneRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  dismissOne: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        readAt: n.readAt ?? new Date().toISOString(),
      })),
      unreadCount: 0,
    })),
  addRealtime: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    })),
}));
