import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, Check, Trash2, X } from 'lucide-react';
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
      }
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
      console.error('Error fetching notifications:', error);
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
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    }).format(date);
  };

  if (!userId) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger render={
        <Button 
          variant={isMobile ? "ghost" : "outline"} 
          size="icon" 
          className={cn(
            "relative rounded-full",
            isMobile ? "text-white/70 hover:bg-white/10 hover:text-white" : "bg-white shadow-md hover:bg-slate-50 border-slate-200 h-10 w-10"
          )}
        >
          <Bell className={cn("h-5 w-5", isMobile ? "text-white/70" : "text-slate-600")} />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className={cn(
                "absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full",
                !isMobile && "border-2 border-white"
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      } />
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold">Notifikasi</h4>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-8 text-xs px-2">
                <Check className="h-3 w-3 mr-1" /> Tandai Dibaca
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" onClick={deleteAllNotifications} className="h-8 text-xs px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                <Trash2 className="h-3 w-3 mr-1" /> Hapus Semua
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Belum ada notifikasi
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`relative p-4 border-b last:border-0 hover:bg-slate-50 transition-colors group ${
                    !notif.is_read ? 'bg-blue-50/50' : ''
                  }`}
                  onClick={() => !notif.is_read && markAsRead(notif.id)}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${
                          notif.type === 'success' ? 'bg-green-500' :
                          notif.type === 'error' ? 'bg-red-500' :
                          notif.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                        }`} />
                        <h5 className={`text-sm font-medium ${!notif.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                          {notif.title}
                        </h5>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {notif.message}
                      </p>
                      <span className="text-[10px] text-slate-400 mt-2 block">
                        {formatTime(notif.created_at)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notif.id);
                      }}
                      title="Hapus notifikasi"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
