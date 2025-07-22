-- Fix federation submission results RLS policies that reference incorrect column name
-- The policies reference 'user_id' but submissions table uses 'submitted_by'

-- Drop existing policies that have incorrect column references
DROP POLICY IF EXISTS "Users can read their own federation submission results" ON federation_submission_results;
DROP POLICY IF EXISTS "Users can create federation results for their submissions" ON federation_submission_results;
DROP POLICY IF EXISTS "Users can update their own federation results" ON federation_submission_results;

-- Recreate policies with correct column references
CREATE POLICY "Users can read their own federation submission results" ON federation_submission_results
    FOR SELECT
    TO authenticated
    USING (
        submission_id IN (
            SELECT id FROM submissions WHERE submitted_by = auth.uid()
        )
    );

CREATE POLICY "Users can create federation results for their submissions" ON federation_submission_results
    FOR INSERT
    TO authenticated
    WITH CHECK (
        submission_id IN (
            SELECT id FROM submissions WHERE submitted_by = auth.uid()
        )
    );

CREATE POLICY "Users can update their own federation results" ON federation_submission_results
    FOR UPDATE
    TO authenticated
    USING (
        submission_id IN (
            SELECT id FROM submissions WHERE submitted_by = auth.uid()
        )
    );

-- Fix the federation_submission_summary view that also references user_id
DROP VIEW IF EXISTS federation_submission_summary;

CREATE OR REPLACE VIEW federation_submission_summary AS
SELECT 
    s.id as submission_id,
    s.url,
    s.rewritten_meta->>'title' as title,
    s.submitted_by as user_id, -- Keep as user_id for backward compatibility in view
    s.status as submission_status,
    COUNT(fsr.id) as total_directories,
    COUNT(CASE WHEN fsr.status = 'approved' THEN 1 END) as approved_count,
    COUNT(CASE WHEN fsr.status = 'pending' OR fsr.status = 'submitted' THEN 1 END) as pending_count,
    COUNT(CASE WHEN fsr.status = 'rejected' THEN 1 END) as rejected_count,
    COUNT(CASE WHEN fsr.status = 'failed' THEN 1 END) as failed_count,
    MIN(fsr.created_at) as first_submission_at,
    MAX(fsr.updated_at) as last_updated_at
FROM submissions s
LEFT JOIN federation_submission_results fsr ON s.id = fsr.submission_id
WHERE s.status IN ('approved', 'federated') -- Only include approved submissions
GROUP BY s.id, s.url, s.rewritten_meta->>'title', s.submitted_by, s.status;

-- Grant access to the view
GRANT SELECT ON federation_submission_summary TO authenticated, service_role;

-- Add comment to document the fix
COMMENT ON VIEW federation_submission_summary IS 'Summary view of federation submission statistics - fixed to use submitted_by column';