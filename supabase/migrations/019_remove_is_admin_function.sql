-- Remove is_admin function since we're using user.is_admin property directly in application code
-- This eliminates the function that was causing RLS policy conflicts

-- Drop the is_admin function completely
DROP FUNCTION IF EXISTS is_admin(UUID);

-- Remove any policies that were using the is_admin() function
-- These can be reimplemented later if needed with direct column checks
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can view all admin statuses" ON public.users;

-- Keep the users.is_admin column and related policies that don't use the function
-- The "Users can view their own admin status" policy should remain as it uses direct column access

-- Add comment to document the change
COMMENT ON COLUMN public.users.is_admin IS 'Boolean flag for admin privileges. Use this column directly instead of is_admin() function.';