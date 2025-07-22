-- Add missing public read policy for approved submissions
-- This was accidentally removed in migration 012

-- Add public read access for approved/published submissions
CREATE POLICY "Published submissions are viewable by everyone" ON public.submissions
    FOR SELECT USING (
        status IN ('approved', 'federated') 
        AND published_at IS NOT NULL
    );

-- Add comment to document the fix
COMMENT ON POLICY "Published submissions are viewable by everyone" ON public.submissions 
IS 'Allows public read access to approved and federated submissions that have been published';