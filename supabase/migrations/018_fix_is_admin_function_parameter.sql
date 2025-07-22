-- Fix is_admin function parameter name to avoid conflict with submissions table
-- The function parameter 'user_id' conflicts with submissions table operations
-- Rename it to 'target_user_id' to avoid RLS policy conflicts

CREATE OR REPLACE FUNCTION is_admin(target_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    -- Return false if no target_user_id provided
    IF target_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if user has admin flag set in users table
    RETURN EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = target_user_id
        AND is_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the comment to reflect the parameter name change
COMMENT ON FUNCTION is_admin(UUID) IS 'Checks if user has admin privileges by looking at users.is_admin column. Parameter renamed to target_user_id to avoid RLS conflicts.';

-- Grant execute permission to authenticated users (reapply after function recreation)
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;