import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ui/use-toast';

export default function RealtimeNotifications() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);

  // 1. Dapatkan ID User yang sedang login
  useEffect(() => {
    let isMounted = true;
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted && session?.user) {
        setUserId(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUserId(session?.user?.id || null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 2. Setup Realtime Subscriptions
  useEffect(() => {
    if (!userId) return;

    // --- REALTIME SYSTEM ---
    const channelName = `public-notifications-${userId}`;
    const channel = supabase.channel(channelName);

    // Dengarkan SEMUA perubahan di schema public (lebih aman dari error spesifik tabel)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public' },
      async (payload) => {
        try {
          // B. Handle candidates
          if (payload.table === 'candidates' && payload.eventType === 'UPDATE') {
            const newStatus = payload.new.status_screening;
            const oldStatus = payload.old?.status_screening;
            if (newStatus && oldStatus && newStatus !== oldStatus) {
              toast({
                title: 'Perubahan Status',
                description: `Status kandidat ${payload.new.full_name} berubah menjadi ${newStatus}.`,
              });
            }
          }
        } catch (error) {
          console.error('Error processing realtime update:', error);
        }
      }
    );

    channel.subscribe((status, err) => {
      // Hanya log status jika bukan error yang berulang, atau log sekali saja
      if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') {
        console.log(`Realtime Status:`, status);
      }
      
      // Jika terjadi error pada Realtime (sering terjadi di Self-Hosted Supabase)
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`Realtime gagal terhubung (${status}).`);
        // Hapus channel agar tidak terus-menerus mencoba reconnect dan memenuhi log
        supabase.removeChannel(channel);
      }
    });

    // C. Cek pengingat psikotes (Sekali saat komponen dimuat)
    const checkUpcomingPsikotes = async () => {
      const now = new Date();
      const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const { data, error } = await supabase
        .from('psikotes_schedules')
        .select('id')
        .gte('schedule_date', now.toISOString())
        .lte('schedule_date', next24Hours.toISOString())
        .eq('status', 'menunggu');

      if (!error && data && data.length > 0) {
        toast({
          title: 'Pengingat Psikotes',
          description: `Ada ${data.length} jadwal psikotes dalam 24 jam ke depan.`,
          variant: 'default',
        });
      }
    };

    checkUpcomingPsikotes();

    return () => {
      console.log('Cleaning up notifications...');
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return null;
}
