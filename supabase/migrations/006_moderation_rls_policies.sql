-- Row Level Security Policies for Moderation Tables
-- Ensures proper access control for moderation system

-- Enable RLS on moderation tables
ALTER TABLE moderation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Moderation Reviews Policies
-- Moderators can view all reviews
CREATE POLICY "Moderators can view all reviews" ON moderation_reviews
  FOR SELECT USING (is_moderator());

-- Users can view reviews of their own submissions
CREATE POLICY "Users can view reviews of own submissions" ON moderation_reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions 
      WHERE submissions.id = moderation_reviews.submission_id 
        AND submissions.user_id = auth.uid()
    )
  );

-- Moderators can insert reviews
CREATE POLICY "Moderators can insert reviews" ON moderation_reviews
  FOR INSERT WITH CHECK (is_moderator() AND auth.uid() = moderator_id);

-- Service role can manage all reviews (for API operations)
CREATE POLICY "Service role can manage reviews" ON moderation_reviews
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Moderation Escalations Policies
-- Moderators can view all escalations
CREATE POLICY "Moderators can view all escalations" ON moderation_escalations
  FOR SELECT USING (is_moderator());

-- Users can view escalations of their own submissions
CREATE POLICY "Users can view escalations of own submissions" ON moderation_escalations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions 
      WHERE submissions.id = moderation_escalations.submission_id 
        AND submissions.user_id = auth.uid()
    )
  );

-- Moderators can insert escalations
CREATE POLICY "Moderators can insert escalations" ON moderation_escalations
  FOR INSERT WITH CHECK (is_moderator() AND auth.uid() = escalated_by);

-- Senior moderators can update escalations (resolve them)
CREATE POLICY "Senior moderators can update escalations" ON moderation_escalations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
        AND role IN ('senior_moderator', 'admin')
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Service role can manage all escalations
CREATE POLICY "Service role can manage escalations" ON moderation_escalations
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- User Roles Policies
-- Users can view their own roles
CREATE POLICY "Users can view own roles" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can view all roles
CREATE POLICY "Admins can view all roles" ON user_roles
  FOR SELECT USING (is_admin());

-- Admins can insert new roles
CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT WITH CHECK (is_admin());

-- Admins can update roles
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (is_admin());

-- Admins can delete roles
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (is_admin());

-- Service role can manage all roles
CREATE POLICY "Service role can manage roles" ON user_roles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant necessary permissions to authenticated users
GRANT SELECT ON moderation_reviews TO authenticated;
GRANT SELECT ON moderation_escalations TO authenticated;
GRANT SELECT ON user_roles TO authenticated;

-- Grant insert permissions for moderators (handled by RLS policies)
GRANT INSERT ON moderation_reviews TO authenticated;
GRANT INSERT ON moderation_escalations TO authenticated;
GRANT UPDATE ON moderation_escalations TO authenticated;

-- Grant role management permissions to authenticated users (handled by RLS policies)
GRANT INSERT, UPDATE, DELETE ON user_roles TO authenticated;

-- Grant full access to service role
GRANT ALL ON moderation_reviews TO service_role;
GRANT ALL ON moderation_escalations TO service_role;
GRANT ALL ON user_roles TO service_role;

-- Create function to get user's moderation permissions
CREATE OR REPLACE FUNCTION get_user_moderation_permissions(user_uuid UUID DEFAULT auth.uid())
RETURNS TABLE (
  can_moderate BOOLEAN,
  can_escalate BOOLEAN,
  can_resolve_escalations BOOLEAN,
  can_manage_roles BOOLEAN,
  roles TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    is_moderator(user_uuid) as can_moderate,
    is_moderator(user_uuid) as can_escalate,
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = user_uuid 
        AND role IN ('senior_moderator', 'admin')
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
    ) as can_resolve_escalations,
    is_admin(user_uuid) as can_manage_roles,
    ARRAY(
      SELECT role FROM user_roles 
      WHERE user_id = user_uuid 
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
    ) as roles;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get moderation queue for specific moderator
CREATE OR REPLACE FUNCTION get_moderator_queue(
  moderator_uuid UUID DEFAULT auth.uid(),
  page_limit INTEGER DEFAULT 10,
  page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  url TEXT,
  status TEXT,
  submitted_for_review_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  user_email TEXT,
  user_username TEXT,
  priority INTEGER
) AS $$
BEGIN
  -- Check if user is a moderator
  IF NOT is_moderator(moderator_uuid) THEN
    RAISE EXCEPTION 'Access denied: User is not a moderator';
  END IF;
  
  RETURN QUERY
  SELECT 
    s.id,
    s.title,
    s.description,
    s.url,
    s.status,
    s.submitted_for_review_at,
    s.assigned_at,
    u.email as user_email,
    u.raw_user_meta_data->>'username' as user_username,
    CASE 
      WHEN s.status = 'escalated' THEN 1
      WHEN s.assigned_moderator = moderator_uuid THEN 2
      ELSE 3
    END as priority
  FROM submissions s
  JOIN auth.users u ON u.id = s.user_id
  WHERE s.status IN ('pending_review', 'escalated')
    AND (s.assigned_moderator = moderator_uuid OR s.assigned_moderator IS NULL)
  ORDER BY priority ASC, s.submitted_for_review_at ASC
  LIMIT page_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get submission details for moderation
CREATE OR REPLACE FUNCTION get_submission_for_moderation(submission_uuid UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  url TEXT,
  status TEXT,
  tags TEXT[],
  metadata JSONB,
  submitted_for_review_at TIMESTAMPTZ,
  assigned_moderator UUID,
  assigned_at TIMESTAMPTZ,
  user_id UUID,
  user_email TEXT,
  user_username TEXT,
  auto_moderation_result JSONB,
  moderation_flags TEXT[],
  review_history JSONB
) AS $$
BEGIN
  -- Check if user is a moderator
  IF NOT is_moderator() THEN
    RAISE EXCEPTION 'Access denied: User is not a moderator';
  END IF;
  
  RETURN QUERY
  SELECT 
    s.id,
    s.title,
    s.description,
    s.url,
    s.status,
    s.tags,
    s.metadata,
    s.submitted_for_review_at,
    s.assigned_moderator,
    s.assigned_at,
    s.user_id,
    u.email as user_email,
    u.raw_user_meta_data->>'username' as user_username,
    s.auto_moderation_result,
    s.moderation_flags,
    (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', mr.id,
            'decision', mr.decision,
            'notes', mr.notes,
            'reviewed_at', mr.reviewed_at,
            'moderator_email', mod_user.email
          ) ORDER BY mr.reviewed_at DESC
        ),
        '[]'::json
      )
      FROM moderation_reviews mr
      LEFT JOIN auth.users mod_user ON mod_user.id = mr.moderator_id
      WHERE mr.submission_id = s.id
    ) as review_history
  FROM submissions s
  JOIN auth.users u ON u.id = s.user_id
  WHERE s.id = submission_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to bulk assign moderators
CREATE OR REPLACE FUNCTION bulk_assign_moderator(
  submission_ids UUID[],
  moderator_uuid UUID
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Check if user is an admin or senior moderator
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
      AND role IN ('senior_moderator', 'admin')
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RAISE EXCEPTION 'Access denied: Insufficient permissions';
  END IF;
  
  -- Check if target user is a moderator
  IF NOT is_moderator(moderator_uuid) THEN
    RAISE EXCEPTION 'Target user is not a moderator';
  END IF;
  
  UPDATE submissions 
  SET 
    assigned_moderator = moderator_uuid,
    assigned_at = NOW(),
    updated_at = NOW()
  WHERE id = ANY(submission_ids)
    AND status = 'pending_review';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_user_moderation_permissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_moderator_queue(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_submission_for_moderation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_assign_moderator(UUID[], UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON POLICY "Moderators can view all reviews" ON moderation_reviews IS 'Allow moderators to view all moderation reviews';
COMMENT ON POLICY "Users can view reviews of own submissions" ON moderation_reviews IS 'Allow users to see reviews of their submissions';

COMMENT ON FUNCTION get_user_moderation_permissions(UUID) IS 'Get moderation permissions for a user';
COMMENT ON FUNCTION get_moderator_queue(UUID, INTEGER, INTEGER) IS 'Get prioritized moderation queue for a moderator';
COMMENT ON FUNCTION get_submission_for_moderation(UUID) IS 'Get detailed submission info for moderation review';
COMMENT ON FUNCTION bulk_assign_moderator(UUID[], UUID) IS 'Bulk assign moderator to multiple submissions';