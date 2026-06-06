
-- Public read of review images
CREATE POLICY "Review images are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-images');

-- Users can upload to their own folder: review-images/{user_id}/...
CREATE POLICY "Users can upload their own review images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'review-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own review images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'review-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own review images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'review-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
