import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ui/use-toast';

export default function RealtimeNotifications() {
  const { toast } = useToast();

  useEffect(() => {
    // Check for upcoming psikotes within 24 hours
    const checkUpcomingPsikotes = async () => {
      const now = new Date();
      const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const { data, error } = await supabase
        .from('psikotes_schedules')
        .select('id, schedule_date, candidates!inner(full_name)')
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

    // Subscribe to candidates table changes
    const candidatesChannel = supabase
      .channel('candidates-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'candidates' },
        (payload) => {
          const newStatus = payload.new.status_screening;
          const oldStatus = payload.old.status_screening;
          
          if (newStatus !== oldStatus) {
            toast({
              title: 'Perubahan Status',
              description: `Status kandidat ${payload.new.full_name} berubah menjadi ${newStatus}.`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'candidates' },
        (payload) => {
          toast({
            title: 'Kandidat Baru',
            description: `Kandidat baru ${payload.new.full_name} telah mendaftar.`,
          });
        }
      )
      .subscribe();

    // Subscribe to psikotes schedules
    const psikotesChannel = supabase
      .channel('psikotes-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'psikotes_schedules' },
        (payload) => {
          toast({
            title: 'Jadwal Psikotes Baru',
            description: `Jadwal psikotes baru telah dibuat.`,
          });
        }
      )
      .subscribe();

    // Subscribe to interview schedules
    const interviewChannel = supabase
      .channel('interview-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interview_schedules' },
        (payload) => {
          toast({
            title: 'Jadwal Interview Baru',
            description: `Jadwal interview baru telah dibuat.`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(candidatesChannel);
      supabase.removeChannel(psikotesChannel);
      supabase.removeChannel(interviewChannel);
    };
  }, [toast]);

  return null;
}
