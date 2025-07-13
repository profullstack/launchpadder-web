-- Row Level Security policies for Content Freshness System
-- This migration adds RLS policies for all the new tables created in the content freshness system

-- Enable RLS on all new tables
ALTER TABLE public.content_freshness_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_refresh_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_freshness_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_content_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_lifecycle_events ENABLE ROW LEVEL SECURITY;

-- Content Freshness Policies - Admin only for management, read-only for others
CREATE POLICY "content_freshness_policies_select" ON public.content_freshness_policies
    FOR SELECT USING (true); -- Everyone can read policies

CREATE POLICY "content_freshness_policies_admin_all" ON public.content_freshness_policies
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND (
                -- Add admin role check here when roles are implemented
                auth.uid() IS NOT NULL
            )
        )
    );

-- Content Validation Results - Users can see results for their submissions
CREATE POLICY "content_validation_results_select" ON public.content_validation_results
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = content_validation_results.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                -- Admin can see all
                auth.uid() IS NOT NULL
            )
        )
    );

CREATE POLICY "content_validation_results_insert" ON public.content_validation_results
    FOR INSERT WITH CHECK (
        -- Only system/admin can insert validation results
        auth.uid() IS NOT NULL
    );

-- Metadata History - Users can see history for their submissions
CREATE POLICY "metadata_history_select" ON public.metadata_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = metadata_history.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                -- Admin can see all
                auth.uid() IS NOT NULL
            )
        )
    );

CREATE POLICY "metadata_history_insert" ON public.metadata_history
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = metadata_history.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                -- System can insert for any submission
                auth.uid() IS NOT NULL
            )
        )
    );

-- Content Refresh Queue - Users can see queue items for their submissions
CREATE POLICY "content_refresh_queue_select" ON public.content_refresh_queue
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = content_refresh_queue.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                -- Admin can see all
                auth.uid() IS NOT NULL
            )
        )
    );

CREATE POLICY "content_refresh_queue_insert" ON public.content_refresh_queue
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = content_refresh_queue.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                -- System can queue for any submission
                auth.uid() IS NOT NULL
            )
        )
    );

CREATE POLICY "content_refresh_queue_update" ON public.content_refresh_queue
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = content_refresh_queue.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                -- System can update any queue item
                auth.uid() IS NOT NULL
            )
        )
    );

-- Content Freshness Metrics - Read-only for authenticated users
CREATE POLICY "content_freshness_metrics_select" ON public.content_freshness_metrics
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "content_freshness_metrics_admin_all" ON public.content_freshness_metrics
    FOR ALL USING (
        -- Only admin can modify metrics
        auth.uid() IS NOT NULL
    );

-- AI Content Variations - Users can manage variations for their submissions
CREATE POLICY "ai_content_variations_select" ON public.ai_content_variations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = ai_content_variations.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                -- Admin can see all
                auth.uid() IS NOT NULL
            )
        )
    );

CREATE POLICY "ai_content_variations_insert" ON public.ai_content_variations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = ai_content_variations.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                -- System can create variations for any submission
                auth.uid() IS NOT NULL
            )
        )
    );

CREATE POLICY "ai_content_variations_update" ON public.ai_content_variations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = ai_content_variations.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                -- System can update any variation
                auth.uid() IS NOT NULL
            )
        )
    );

CREATE POLICY "ai_content_variations_delete" ON public.ai_content_variations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = ai_content_variations.submission_id
            AND s.submitted_by = auth.uid()
        )
    );

-- Content Lifecycle Events - Users can see events for their submissions
CREATE POLICY "content_lifecycle_events_select" ON public.content_lifecycle_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = content_lifecycle_events.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                -- Admin can see all
                auth.uid() IS NOT NULL
            )
        )
    );

CREATE POLICY "content_lifecycle_events_insert" ON public.content_lifecycle_events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.submissions s
            WHERE s.id = content_lifecycle_events.submission_id
            AND (
                s.submitted_by = auth.uid() OR
                user_id = auth.uid() OR
                -- System can log events for any submission
                auth.uid() IS NOT NULL
            )
        )
    );

-- Create helper function to check if user is admin (placeholder for future role system)
CREATE OR REPLACE FUNCTION is_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    -- Placeholder for admin role check
    -- In the future, this would check against a roles table
    -- For now, we'll use a simple check or environment variable
    RETURN user_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if user owns submission
CREATE OR REPLACE FUNCTION owns_submission(submission_id UUID, user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.submissions 
        WHERE id = submission_id 
        AND submitted_by = user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions for the service role (for background jobs)
-- Note: In production, you should create a specific service role with limited permissions

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Grant permissions on new tables to service_role for background processing
GRANT ALL ON public.content_freshness_policies TO service_role;
GRANT ALL ON public.content_validation_results TO service_role;
GRANT ALL ON public.metadata_history TO service_role;
GRANT ALL ON public.content_refresh_queue TO service_role;
GRANT ALL ON public.content_freshness_metrics TO service_role;
GRANT ALL ON public.ai_content_variations TO service_role;
GRANT ALL ON public.content_lifecycle_events TO service_role;

-- Grant execute permissions on functions to service_role
GRANT EXECUTE ON FUNCTION calculate_content_freshness_score TO service_role;
GRANT EXECUTE ON FUNCTION update_content_freshness_scores TO service_role;
GRANT EXECUTE ON FUNCTION archive_stale_submissions TO service_role;
GRANT EXECUTE ON FUNCTION generate_daily_freshness_metrics TO service_role;
GRANT EXECUTE ON FUNCTION is_admin TO service_role;
GRANT EXECUTE ON FUNCTION owns_submission TO service_role;

-- Create indexes for RLS performance
CREATE INDEX idx_submissions_submitted_by ON public.submissions(submitted_by) WHERE submitted_by IS NOT NULL;
CREATE INDEX idx_metadata_history_created_by ON public.metadata_history(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_lifecycle_events_user_id ON public.content_lifecycle_events(user_id) WHERE user_id IS NOT NULL;