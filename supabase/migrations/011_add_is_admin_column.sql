-- Add is_admin column to users table
-- This migration adds an is_admin boolean column to the users table
-- to support admin role checking functionality

-- Add is_admin column to users table
ALTER TABLE public.users
ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Add comment to document the column
COMMENT ON COLUMN public.users.is_admin IS 'Indicates if the user has admin privileges';

-- Create index for efficient admin queries
CREATE INDEX idx_users_is_admin ON public.users(is_admin) WHERE is_admin = TRUE;

-- Update the is_admin function to use the users table column instead of user_roles
-- This replaces the existing function that was checking user_roles table
CREATE OR REPLACE FUNCTION is_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    -- Return false if no user_id provided
    IF user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if user has admin flag set in users table
    RETURN EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = user_id
        AND is_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;

-- Add RLS policy to allow users to see their own admin status
CREATE POLICY "Users can view their own admin status" ON public.users
    FOR SELECT USING (auth.uid() = id);

-- Add RLS policy to allow admins to view all admin statuses
CREATE POLICY "Admins can view all admin statuses" ON public.users
    FOR SELECT USING (is_admin(auth.uid()));

-- Add comment to document the function
COMMENT ON FUNCTION is_admin(UUID) IS 'Checks if user has admin privileges by looking at users.is_admin column';