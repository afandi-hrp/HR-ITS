-- Update the "Allow public uploads" policy to increase the file size limit to 3MB (3145728 bytes)
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;

CREATE POLICY "Allow public uploads"
ON storage.objects FOR INSERT
WITH CHECK ( 
  bucket_id = 'candidate-documents' AND
  (metadata->>'size')::integer <= 3145728 AND
  (
    metadata->>'mimetype' = 'image/jpeg' OR 
    metadata->>'mimetype' = 'image/png' OR 
    metadata->>'mimetype' = 'application/pdf' OR 
    metadata->>'mimetype' = 'application/msword' OR 
    metadata->>'mimetype' = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
);
