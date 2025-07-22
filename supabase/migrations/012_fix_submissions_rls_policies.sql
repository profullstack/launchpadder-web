-- Fix RLS policies for submissions table after profiles -> users migration
-- The existing policies still reference profiles table which was replaced with users table

-- Drop existing policies that may reference the old profiles table
DROP POLICY IF EXISTS "Authenticated users can insert submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can update their own pending submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can delete their own pending submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can view their own submissions" ON public.submissions;

-- Recreate the policies with correct references to users table
CREATE POLICY "Authenticated users can insert submissions" ON public.submissions
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' 
        AND auth.uid() = submitted_by
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
    );

CREATE POLICY "Users can view their own submissions" ON public.submissions
    FOR SELECT USING (
        auth.uid() = submitted_by
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
    );

CREATE POLICY "Users can update their own pending submissions" ON public.submissions
    FOR UPDATE USING (
        auth.uid() = submitted_by 
        AND status = 'pending'
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
    );

CREATE POLICY "Users can delete their own pending submissions" ON public.submissions
    FOR DELETE USING (
        auth.uid() = submitted_by 
        AND status = 'pending'
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
    );

-- Also update the foreign key constraint to reference users table if not already done
-- This should have been done in migration 010, but let's ensure it's correct
DO $$
BEGIN
    -- Check if the constraint exists and points to the right table
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'submissions' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'submitted_by'
        AND ccu.table_name = 'profiles'
    ) THEN
        -- Drop the old constraint and recreate with users table
        ALTER TABLE public.submissions 
        DROP CONSTRAINT IF EXISTS submissions_submitted_by_fkey;
        
        ALTER TABLE public.submissions 
        ADD CONSTRAINT submissions_submitted_by_fkey 
        FOREIGN KEY (submitted_by) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add comment to document the fix
COMMENT ON TABLE public.submissions IS 'Submissions table with RLS policies updated for users table migration';