import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, Check, Trash2, X, CheckCircle2, AlertCircle, Info, AlertTriangle, CheckCheck, BellDot } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { useToast } from './ui/use-toast';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  is_read: boolean;
  created_at: string;
}

export default function NotificationPanel({ isMobile = false }: { isMobile?: boolean }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('NotificationPanel session error:', error.message);
      }
      if (session?.user) {
        setUserId(session.user.id);
      }
    }).catch((err) => {
      console.warn('NotificationPanel failed to get session:', err);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    fetchNotifications();

    // Auto-refresh notifications every 1 minute (60000 ms)
    const intervalId = setInterval(() => {
      fetchNotifications();
    }, 60000);

    const channel = supabase
      .channel(`public:user_notifications:user_id=eq.${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as Notification;
            setNotifications((prev) => {
              // Prevent duplicates if interval just fetched it
              if (prev.some(n => n.id === newNotif.id)) return prev;
              return [newNotif, ...prev];
            });
            setUnreadCount((prev) => prev + 1);
            
            // Optional: Still show a toast for immediate feedback
            toast({
              title: newNotif.title,
              description: newNotif.message,
              variant: newNotif.type === 'error' ? 'destructive' : 'default',
            });
          } else if (payload.eventType === 'UPDATE') {
             setNotifications((prev) => prev.map(n => n.id === payload.new.id ? payload.new as Notification : n));
             updateUnreadCount(payload.new as Notification, payload.old as Notification);
          } else if (payload.eventType === 'DELETE') {
             setNotifications((prev) => prev.filter(n => n.id !== payload.old.id));
             // Re-calculate unread count
             fetchUnreadCount();
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('Error fetching notifications:', error);
      return;
    }

    setNotifications(data || []);
    setUnreadCount(data?.filter((n) => !n.is_read).length || 0);
  };

  const fetchUnreadCount = async () => {
      const { count, error } = await supabase
          .from('user_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false);
      
      if(!error && count !== null) {
          setUnreadCount(count);
      }
  }

  const updateUnreadCount = (newRecord: Notification, oldRecord: Notification) => {
      if (newRecord.is_read && !oldRecord.is_read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
      } else if (!newRecord.is_read && oldRecord.is_read) {
          setUnreadCount(prev => prev + 1);
      }
  }

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) {
      console.error('Error marking as read:', error);
    } else {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  const markAllAsRead = async () => {
    const { error } = await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking all as read:', error);
    } else {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
  };

  const deleteNotification = async (id: string) => {
    const { error } = await supabase
      .from('user_notifications')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting notification:', error);
    } else {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      // Unread count is handled by the realtime DELETE event, but we can optimistically update it
      const deletedNotif = notifications.find(n => n.id === id);
      if (deletedNotif && !deletedNotif.is_read) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    }
  };

  const deleteAllNotifications = async () => {
    const { error } = await supabase
      .from('user_notifications')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting all notifications:', error);
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Baru saja';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} mnt lalu`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} jam lalu`;
    
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getIconStyleForType = (type: string) => {
    switch (type) {
      case 'success':
        return { bg: 'bg-emerald-100', text: 'text-emerald-600', Icon: CheckCircle2 };
      case 'error':
        return { bg: 'bg-rose-100', text: 'text-rose-600', Icon: AlertCircle };
      case 'warning':
        return { bg: 'bg-amber-100', text: 'text-amber-600', Icon: AlertTriangle };
      default:
        return { bg: 'bg-indigo-100', text: 'text-indigo-600', Icon: Info };
    }
  };

  const groupNotificationsByDate = (notifs: Notification[]) => {
    const today: Notification[] = [];
    const yesterday: Notification[] = [];
    const older: Notification[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    notifs.forEach((n) => {
      const d = new Date(n.created_at);
      if (d >= startOfToday) today.push(n);
      else if (d >= startOfYesterday) yesterday.push(n);
      else older.push(n);
    });

    return [
      { label: 'Hari Ini', items: today },
      { label: 'Kemarin', items: yesterday },
      { label: 'Lebih Lama', items: older },
    ].filter((group) => group.items.length > 0);
  };

  if (!userId) return null;

  const hasUnread = unreadCount > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger render={
        <Button
          variant={isMobile ? "ghost" : "outline"}
          size="icon"
          className={cn(
            "relative rounded-full transition-all duration-300 overflow-visible",
            isMobile
              ? (hasUnread ? "text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300" : "text-white/70 hover:bg-white/10 hover:text-white")
              : (hasUnread
                  ? "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100 shadow-sm shadow-indigo-100"
                  : "bg-white shadow-sm hover:bg-slate-50 border-slate-200 text-slate-600 h-10 w-10")
          )}
        >
          {hasUnread && (
            <span className="absolute inset-0 rounded-full bg-indigo-400 opacity-60 animate-ping pointer-events-none" />
          )}

          {hasUnread ? (
            <BellDot className={cn("h-5 w-5", isMobile ? "text-indigo-400" : "text-indigo-600")} />
          ) : (
            <Bell className={cn("h-5 w-5", isMobile ? "text-white/70" : "text-slate-600")} />
          )}

          {hasUnread && (
            <Badge 
              variant="destructive" 
              className={cn(
                "absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center px-1 py-0 text-[10px] font-bold rounded-full bg-rose-500 animate-in zoom-in",
                !isMobile && "border-2 border-white"
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      } />
      <PopoverContent className="w-80 sm:w-96 p-0 rounded-2xl shadow-xl border-slate-200 overflow-hidden" align="end" sideOffset={8}>
        <div className="flex flex-col bg-white">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-[#5A305A]">Notifikasi</h4>
              {hasUnread && (
                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} Baru
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {hasUnread && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-8 text-xs px-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                  <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Tandai Dibaca
                </Button>
              )}
            </div>
          </div>

          {/* Body */}
          <ScrollArea className="h-[400px] sm:h-[450px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <Bell className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-[#5A305A] font-medium mb-1">Belum ada notifikasi</p>
                <p className="text-slate-500 text-sm">Anda akan melihat notifikasi di sini saat ada aktivitas baru.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {groupNotificationsByDate(notifications).map((group) => (
                  <div key={group.label}>
                    <div className="sticky top-0 z-10 px-4 py-1.5 bg-slate-50/95 backdrop-blur-sm border-y border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {group.label}
                      </span>
                    </div>
                    <div className="flex flex-col divide-y divide-slate-100">
                      {group.items.map((notif) => {
                        const { bg, text, Icon } = getIconStyleForType(notif.type);
                        return (
                          <div
                            key={notif.id}
                            className={cn(
                              "relative pl-5 pr-4 py-3.5 transition-colors duration-150 group cursor-pointer",
                              !notif.is_read ? "bg-indigo-50/40 hover:bg-indigo-50/70" : "bg-white hover:bg-slate-50"
                            )}
                            onClick={() => !notif.is_read && markAsRead(notif.id)}
                          >
                            <div className="flex gap-3">
                              {/* Icon badge */}
                              <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5", bg)}>
                                <Icon className={cn("h-4.5 w-4.5", text)} />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-2 mb-0.5">
                                  <h5 className={cn(
                                    "text-sm font-semibold truncate pr-4",
                                    !notif.is_read ? "text-[#5A305A]" : "text-slate-700"
                                  )}>
                                    {notif.title}
                                  </h5>
                                  <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                                    {formatTime(notif.created_at)}
                                  </span>
                                </div>
                                <p className={cn(
                                  "text-xs leading-relaxed line-clamp-2",
                                  !notif.is_read ? "text-slate-600" : "text-slate-500"
                                )}>
                                  {notif.message}
                                </p>
                              </div>

                              {/* Actions */}
                              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(notif.id);
                                  }}
                                  title="Hapus notifikasi"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>

                            {/* Unread Indicator Dot */}
                            {!notif.is_read && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-r-full" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-2 border-t border-slate-100 bg-slate-50/50">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={deleteAllNotifications} 
                className="w-full h-8 text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Bersihkan Semua Notifikasi
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
