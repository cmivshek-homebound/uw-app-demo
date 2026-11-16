import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { demoNow } from '../data/dates';
import { NotificationContext, SEED_NOTIFICATIONS } from '../data/notifications';
import type { AppNotification, NewNotification, NotificationStore } from '../data/notifications';

/** Seeded notifications plus live ones from this session, with session read state. */
export default function NotificationProvider({ children }: { children: ReactNode }) {
  const [added, setAdded] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const notify = useCallback((n: NewNotification) => {
    const at = n.at ?? demoNow();
    setAdded((prev) => [{ ...n, at, read: false, id: `live-${at}-${prev.length}` }, ...prev]);
  }, []);

  const markRead = useCallback((ids: string[]) => {
    setReadIds((prev) => new Set([...prev, ...ids]));
  }, []);

  const store = useMemo<NotificationStore>(() => ({
    notifications: [...added, ...SEED_NOTIFICATIONS].sort((a, b) => b.at.localeCompare(a.at)),
    isRead: (n) => n.read || readIds.has(n.id),
    markRead,
    notify,
  }), [added, readIds, markRead, notify]);

  return <NotificationContext.Provider value={store}>{children}</NotificationContext.Provider>;
}
