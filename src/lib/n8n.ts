import { supabase } from './supabase';

export const waitForN8nJob = (jobId: string, timeoutMs = 120000): Promise<{ status: string, message: string }> => {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    let pollInterval: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (pollInterval) clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };

    const checkStatus = async () => {
      try {
        const { data } = await supabase.from('n8n_jobs').select('status, message').eq('id', jobId).single();
        if (data?.status === 'success') {
          cleanup();
          resolve({ status: 'success', message: data.message || 'Berhasil' });
        } else if (data?.status === 'error') {
          cleanup();
          reject(new Error(data.message || 'Terjadi kesalahan di n8n'));
        }
      } catch (err) {
        console.error('Error checking job status:', err);
      }
    };

    const channel = supabase
      .channel(`n8n_job_${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'n8n_jobs' },
        (payload) => {
          const newRecord = payload.new;
          if (newRecord.id !== jobId) return;

          if (newRecord.status === 'success') {
            cleanup();
            resolve({ status: 'success', message: newRecord.message || 'Berhasil' });
          } else if (newRecord.status === 'error') {
            cleanup();
            reject(new Error(newRecord.message || 'Terjadi kesalahan di n8n'));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Fallback: Check if it's already done before we subscribed
          checkStatus();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Realtime failed for job ${jobId}, falling back to polling...`);
          if (!pollInterval) {
            pollInterval = setInterval(checkStatus, 3000);
          }
        }
      });

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Waktu tunggu habis (Timeout). Proses mungkin masih berjalan di latar belakang.'));
    }, timeoutMs);
  });
};
