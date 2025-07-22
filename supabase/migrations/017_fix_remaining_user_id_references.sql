-- Fix remaining user_id references in moderation and federation systems
-- The submissions table uses 'submitted_by' not 'user_id'

-- Fix moderation RLS policies that still reference submissions.user_id
DROP POLICY IF EXISTS "Users can view reviews of their own submissions" ON moderation_reviews;
CREATE POLICY "Users can view reviews of their own submissions" ON moderation_reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions
      WHERE submissions.id = moderation_reviews.submission_id
        AND submissions.submitted_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view escalations of their own submissions" ON moderation_escalations;
CREATE POLICY "Users can view escalations of their own submissions" ON moderation_escalations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions
      WHERE submissions.id = moderation_escalations.submission_id
        AND submissions.submitted_by = auth.uid()
    )
  );

-- Fix federation submission results RLS policies that still reference submissions.user_id
DROP POLICY IF EXISTS "Users can view their own federation results" ON federation_submission_results;
CREATE POLICY "Users can view their own federation results" ON federation_submission_results
  FOR SELECT USING (
    submission_id IN (
      SELECT id FROM submissions WHERE submitted_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own federation results" ON federation_submission_results;
CREATE POLICY "Users can insert their own federation results" ON federation_submission_results
  FOR INSERT WITH CHECK (
    submission_id IN (
      SELECT id FROM submissions WHERE submitted_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own federation results" ON federation_submission_results;
CREATE POLICY "Users can update their own federation results" ON federation_submission_results
  FOR UPDATE USING (
    submission_id IN (
      SELECT id FROM submissions WHERE submitted_by = auth.uid()
    )
  );

-- Fix the federation_submission_summary view that references user_id
DROP VIEW IF EXISTS federation_submission_summary;
CREATE VIEW federation_submission_summary AS
SELECT 
    s.id as submission_id,
    s.url,
    s.rewritten_meta->>'title' as title,
    s.submitted_by as user_id, -- Keep as user_id for backward compatibility in view
    s.status as submission_status,
    COUNT(fsr.id) as total_results,
    COUNT(CASE WHEN fsr.status = 'success' THEN 1 END) as successful_results,
    COUNT(CASE WHEN fsr.status = 'failed' THEN 1 END) as failed_results,
    AVG(CASE WHEN fsr.response_time_ms IS NOT NULL THEN fsr.response_time_ms END) as avg_response_time,
    MAX(fsr.created_at) as last_federation_attempt
FROM submissions s
LEFT JOIN federation_submission_results fsr ON s.id = fsr.submission_id
WHERE s.federation_enabled = true
GROUP BY s.id, s.url, s.rewritten_meta->>'title', s.submitted_by, s.status;

-- Fix any remaining functions that might reference submissions.user_id
-- Update the moderation assignment function to use submitted_by
CREATE OR REPLACE FUNCTION assign_moderator_to_submission(submission_uuid UUID)
RETURNS UUID AS $$
DECLARE
  assigned_moderator_id UUID;
BEGIN
  -- Find moderator with least assigned submissions
  SELECT ur.user_id INTO assigned_moderator_id
  FROM user_roles ur
  LEFT JOIN submissions s ON s.assigned_moderator = ur.user_id AND s.status = 'pending_review'
  WHERE ur.role IN ('moderator', 'senior_moderator')
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  GROUP BY ur.user_id
  ORDER BY COUNT(s.id) ASC, RANDOM()
  LIMIT 1;

  -- Update the submission
  UPDATE submissions 
  SET assigned_moderator = assigned_moderator_id,
      status = 'pending_review',
      updated_at = NOW()
  WHERE id = submission_uuid;

  RETURN assigned_moderator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;