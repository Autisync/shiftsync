INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('leave-attachments', 'leave-attachments', false, 10485760)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated upload own leave attachments" ON storage.objects;
CREATE POLICY "Authenticated upload own leave attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'leave-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated read own leave attachments" ON storage.objects;
CREATE POLICY "Authenticated read own leave attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'leave-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated update own leave attachments" ON storage.objects;
CREATE POLICY "Authenticated update own leave attachments"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'leave-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'leave-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated delete own leave attachments" ON storage.objects;
CREATE POLICY "Authenticated delete own leave attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'leave-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );