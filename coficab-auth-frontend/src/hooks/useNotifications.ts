// src/hooks/useNotifications.ts
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRealtimeOptional } from '../context/RealtimeContext';
import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  actionPlanId?: string;
  claimId?: string;
  linkPath?: string;
  isRead: boolean;
  createdAt: string;
}

function normalizeNotification(raw: any): NotificationItem | null {
  if (!raw) return null;
  const id = String(raw.id ?? raw.Id ?? '');
  if (!id) return null;
  return {
    id,
    type: String(raw.type ?? raw.Type ?? ''),
    title: String(raw.title ?? raw.Title ?? ''),
    message: String(raw.message ?? raw.Message ?? ''),
    actionPlanId: raw.actionPlanId ?? raw.ActionPlanId ?? undefined,
    claimId: raw.claimId ?? raw.ClaimId ?? undefined,
    linkPath: raw.linkPath ?? raw.LinkPath ?? undefined,
    isRead: Boolean(raw.isRead ?? raw.IsRead ?? false),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? new Date().toISOString()),
  };
}

function extractList(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.$values)) return data.$values;
  if (Array.isArray(data.data?.$values)) return data.data.$values;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

export function useNotifications() {
  const { accessToken } = useAuth();
  const realtime = useRealtimeOptional();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/notifications/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = extractList(data)
        .map(normalizeNotification)
        .filter((n): n is NotificationItem => n != null);
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.isRead).length);
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
  }, [accessToken]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      try {
        await fetch(`${API_BASE}/notifications/${id}/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (e) {
        console.error('Failed to mark notification as read:', e);
      }
    },
    [accessToken],
  );

  const markAllAsRead = useCallback(async () => {
    if (!accessToken) return;
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    await Promise.all(
      unread.map((n) =>
        fetch(`${API_BASE}/notifications/${n.id}/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch((e) => console.error('Failed to mark as read:', e)),
      ),
    );
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, [accessToken, notifications]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe('ReceiveNotification', (payload) => {
      const item = normalizeNotification(payload);
      if (!item) return;
      setNotifications((prev) => {
        if (prev.some((n) => n.id === item.id)) return prev;
        return [item, ...prev];
      });
      if (!item.isRead) setUnreadCount((prev) => prev + 1);
    });
  }, [realtime]);

  // Refresh list after reconnect to avoid missed events.
  useEffect(() => {
    if (realtime?.connected) void fetchNotifications();
  }, [realtime?.connected, fetchNotifications]);

  return { notifications, unreadCount, markAsRead, markAllAsRead, refetch: fetchNotifications };
}
