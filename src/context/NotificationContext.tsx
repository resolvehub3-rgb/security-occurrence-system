import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabase } from '../lib/supabase';
import { AppNotification } from '../types';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  sendNotification: (notification: {
    recipientUserId: string;
    type: string;
    title: string;
    message: string;
    relatedEntityId?: string;
    relatedEntityType?: string;
  }) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching notifications:', error);
      } else {
        setNotifications((data as AppNotification[]) || []);
      }
    } catch (err) {
      console.error('Notification error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();

    if (!user) return;

    // Real-time subscription to notifications
    const supabase = getSupabase();
    const channelName = `realtime-notifications-${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          setNotifications((prev) => [newNotif, ...prev]);

          // Trigger subtle sound or visual if allowed
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(newNotif.title, {
              body: newNotif.message,
              icon: '/icon.svg',
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as AppNotification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      const supabase = getSupabase();
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    } catch (err) {
      console.error('Error marking notification read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      const supabase = getSupabase();
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_user_id', user.id)
        .is('read_at', null);

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
    } catch (err) {
      console.error('Error marking all notifications read:', err);
    }
  };

  const sendNotification = async ({
    recipientUserId,
    type,
    title,
    message,
    relatedEntityId,
    relatedEntityType,
  }: {
    recipientUserId: string;
    type: string;
    title: string;
    message: string;
    relatedEntityId?: string;
    relatedEntityType?: string;
  }) => {
    try {
      const supabase = getSupabase();
      await supabase.from('notifications').insert({
        recipient_user_id: recipientUserId,
        type,
        title,
        message,
        related_entity_id: relatedEntityId || null,
        related_entity_type: relatedEntityType || null,
      });
    } catch (err) {
      console.error('Failed to send notification:', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        sendNotification,
        refreshNotifications: fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
