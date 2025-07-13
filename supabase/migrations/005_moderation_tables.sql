-- Moderation System Tables Migration
-- Creates tables for content moderation, reviews, and escalations

-- Moderation reviews table to track all moderation decisions
CREATE TABLE IF NOT EXISTS moderation_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'escalated')),
  notes TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Moderation escalations table to track escalated submissions
CREATE TABLE IF NOT EXISTS moderation_escalations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  escalated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User roles table to manage moderator permissions
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'moderator', 'senior_moderator', 'admin')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Add moderation-related columns to submissions table
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS assigned_moderator UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_moderation_result JSONB,
ADD COLUMN IF NOT EXISTS moderation_flags TEXT[];

-- Update submissions status enum to include moderation statuses
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check 
  CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'escalated', 'published', 'archived'));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_moderation_reviews_submission_id ON moderation_reviews(submission_id);
CREATE INDEX IF NOT EXISTS idx_moderation_reviews_moderator_id ON moderation_reviews(moderator_id);
CREATE INDEX IF NOT EXISTS idx_moderation_reviews_decision ON moderation_reviews(decision);
CREATE INDEX IF NOT EXISTS idx_moderation_reviews_reviewed_at ON moderation_reviews(reviewed_at);

CREATE INDEX IF NOT EXISTS idx_moderation_escalations_submission_id ON moderation_escalations(submission_id);
CREATE INDEX IF NOT EXISTS idx_moderation_escalations_escalated_by ON moderation_escalations(escalated_by);
CREATE INDEX IF NOT EXISTS idx_moderation_escalations_resolved_by ON moderation_escalations(resolved_by);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);

CREATE INDEX IF NOT EXISTS idx_submissions_assigned_moderator ON submissions(assigned_moderator);
CREATE INDEX IF NOT EXISTS idx_submissions_reviewed_by ON submissions(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_for_review_at ON submissions(submitted_for_review_at);

-- Create function to get moderation statistics
CREATE OR REPLACE FUNCTION get_moderation_stats()
RETURNS TABLE (
  pending_count BIGINT,
  approved_today BIGINT,
  rejected_today BIGINT,
  escalated_count BIGINT,
  avg_review_time_hours NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM submissions WHERE status = 'pending_review') as pending_count,
    (SELECT COUNT(*) FROM submissions WHERE status = 'approved' AND reviewed_at >= CURRENT_DATE) as approved_today,
    (SELECT COUNT(*) FROM submissions WHERE status = 'rejected' AND reviewed_at >= CURRENT_DATE) as rejected_today,
    (SELECT COUNT(*) FROM submissions WHERE status = 'escalated') as escalated_count,
    (SELECT 
      COALESCE(
        AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_for_review_at)) / 3600), 
        0
      )::NUMERIC(10,2)
      FROM submissions 
      WHERE reviewed_at IS NOT NULL 
        AND submitted_for_review_at IS NOT NULL
        AND reviewed_at >= CURRENT_DATE - INTERVAL '7 days'
    ) as avg_review_time_hours;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get moderator workload
CREATE OR REPLACE FUNCTION get_moderator_workload(moderator_uuid UUID)
RETURNS TABLE (
  assigned_count BIGINT,
  completed_today BIGINT,
  avg_review_time_minutes NUMERIC,
  pending_escalations BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM submissions WHERE assigned_moderator = moderator_uuid AND status = 'pending_review') as assigned_count,
    (SELECT COUNT(*) FROM submissions WHERE reviewed_by = moderator_uuid AND reviewed_at >= CURRENT_DATE) as completed_today,
    (SELECT 
      COALESCE(
        AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_for_review_at)) / 60), 
        0
      )::NUMERIC(10,2)
      FROM submissions 
      WHERE reviewed_by = moderator_uuid 
        AND reviewed_at IS NOT NULL 
        AND submitted_for_review_at IS NOT NULL
        AND reviewed_at >= CURRENT_DATE - INTERVAL '7 days'
    ) as avg_review_time_minutes,
    (SELECT COUNT(*) FROM moderation_escalations WHERE escalated_by = moderator_uuid AND resolved_at IS NULL) as pending_escalations;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user has moderator role
CREATE OR REPLACE FUNCTION is_moderator(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = user_uuid 
      AND role IN ('moderator', 'senior_moderator', 'admin')
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user has admin role
CREATE OR REPLACE FUNCTION is_admin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = user_uuid 
      AND role = 'admin'
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to auto-assign moderators based on workload
CREATE OR REPLACE FUNCTION auto_assign_moderator(submission_uuid UUID)
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
  
  -- Assign the moderator if found
  IF assigned_moderator_id IS NOT NULL THEN
    UPDATE submissions 
    SET 
      assigned_moderator = assigned_moderator_id,
      assigned_at = NOW(),
      updated_at = NOW()
    WHERE id = submission_uuid;
  END IF;
  
  RETURN assigned_moderator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-assign moderators when submission is submitted for review
CREATE OR REPLACE FUNCTION trigger_auto_assign_moderator()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-assign if status changed to pending_review and no moderator assigned
  IF NEW.status = 'pending_review' 
     AND OLD.status != 'pending_review' 
     AND NEW.assigned_moderator IS NULL THEN
    
    NEW.assigned_moderator := auto_assign_moderator(NEW.id);
    NEW.assigned_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_moderator_trigger
  BEFORE UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_assign_moderator();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_moderation_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_moderator_workload(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_moderator(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_assign_moderator(UUID) TO service_role;

-- Add comments for documentation
COMMENT ON TABLE moderation_reviews IS 'Stores all moderation decisions and reviews';
COMMENT ON TABLE moderation_escalations IS 'Tracks escalated submissions requiring senior review';
COMMENT ON TABLE user_roles IS 'Manages user roles and permissions for moderation';

COMMENT ON FUNCTION get_moderation_stats() IS 'Returns overall moderation statistics';
COMMENT ON FUNCTION get_moderator_workload(UUID) IS 'Returns workload statistics for a specific moderator';
COMMENT ON FUNCTION is_moderator(UUID) IS 'Checks if user has moderator privileges';
COMMENT ON FUNCTION is_admin(UUID) IS 'Checks if user has admin privileges';
COMMENT ON FUNCTION auto_assign_moderator(UUID) IS 'Automatically assigns moderator based on workload';