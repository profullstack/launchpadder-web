-- Fix moderation RLS policies that reference incorrect column name
-- The policies reference 'user_id' but submissions table uses 'submitted_by'

-- Drop existing moderation policies that have incorrect column references
DROP POLICY IF EXISTS "Users can view reviews of their own submissions" ON moderation_reviews;
DROP POLICY IF EXISTS "Users can view escalations of their own submissions" ON moderation_escalations;

-- Recreate moderation policies with correct column references
CREATE POLICY "Users can view reviews of their own submissions" ON moderation_reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions
      WHERE submissions.id = moderation_reviews.submission_id
        AND submissions.submitted_by = auth.uid()
    )
  );

CREATE POLICY "Users can view escalations of their own submissions" ON moderation_escalations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions
      WHERE submissions.id = moderation_escalations.submission_id
        AND submissions.submitted_by = auth.uid()
    )
  );

-- Add comment to document the fix
COMMENT ON POLICY "Users can view reviews of their own submissions" ON moderation_reviews 
IS 'Allows users to view moderation reviews for their own submissions - fixed to use submitted_by column';

COMMENT ON POLICY "Users can view escalations of their own submissions" ON moderation_escalations 
IS 'Allows users to view moderation escalations for their own submissions - fixed to use submitted_by column';