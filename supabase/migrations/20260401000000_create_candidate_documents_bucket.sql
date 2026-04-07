-- Create candidate-documents bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-documents', 'candidate-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to candidate-documents
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'candidate-documents' );

CREATE POLICY "Allow public uploads"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'candidate-documents' );
