-- Create user_notifications table
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('success', 'error', 'info', 'warning')),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own notifications" ON public.user_notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON public.user_notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications" ON public.user_notifications
    FOR DELETE USING (auth.uid() = user_id);

-- Create a function to automatically create a notification when an n8n_job completes
CREATE OR REPLACE FUNCTION public.handle_n8n_job_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create notification if status changed to success or error
    IF NEW.status IN ('success', 'error') AND (OLD.status IS NULL OR OLD.status NOT IN ('success', 'error')) THEN
        INSERT INTO public.user_notifications (user_id, title, message, type)
        VALUES (
            NEW.user_id,
            CASE 
                WHEN NEW.status = 'success' THEN 'Tugas Selesai'
                ELSE 'Tugas Gagal'
            END,
            COALESCE(NEW.message, CASE WHEN NEW.status = 'success' THEN 'Proses berhasil diselesaikan.' ELSE 'Terjadi kesalahan saat memproses tugas.' END),
            NEW.status
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_n8n_job_completion ON public.n8n_jobs;
CREATE TRIGGER on_n8n_job_completion
    AFTER UPDATE ON public.n8n_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_n8n_job_completion();

-- Enable Realtime for user_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
