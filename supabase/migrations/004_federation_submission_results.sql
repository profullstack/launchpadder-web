-- Migration: Federation Submission Results Table
-- Description: Creates table for tracking federated submission results across multiple directories

-- Create federation_submission_results table
CREATE TABLE IF NOT EXISTS federation_submission_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    directory_id VARCHAR(255) NOT NULL,
    instance_url VARCHAR(500) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'failed')),
    remote_submission_id VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional metadata
    response_data JSONB DEFAULT '{}'::jsonb,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    UNIQUE(submission_id, directory_id, instance_url)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_federation_results_submission_id ON federation_submission_results(submission_id);
CREATE INDEX IF NOT EXISTS idx_federation_results_status ON federation_submission_results(status);
CREATE INDEX IF NOT EXISTS idx_federation_results_directory_id ON federation_submission_results(directory_id);
CREATE INDEX IF NOT EXISTS idx_federation_results_instance_url ON federation_submission_results(instance_url);
CREATE INDEX IF NOT EXISTS idx_federation_results_created_at ON federation_submission_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_federation_results_updated_at ON federation_submission_results(updated_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_federation_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_federation_results_updated_at
    BEFORE UPDATE ON federation_submission_results
    FOR EACH ROW
    EXECUTE FUNCTION update_federation_results_updated_at();

-- Row Level Security (RLS) policies
ALTER TABLE federation_submission_results ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own submission results
CREATE POLICY "Users can read their own federation submission results" ON federation_submission_results
    FOR SELECT
    TO authenticated
    USING (
        submission_id IN (
            SELECT id FROM submissions WHERE user_id = auth.uid()
        )
    );

-- Policy: Service role can manage all federation results
CREATE POLICY "Service role can manage federation submission results" ON federation_submission_results
    FOR ALL
    TO service_role
    USING (true);

-- Policy: Authenticated users can insert federation results for their submissions
CREATE POLICY "Users can create federation results for their submissions" ON federation_submission_results
    FOR INSERT
    TO authenticated
    WITH CHECK (
        submission_id IN (
            SELECT id FROM submissions WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can update their own federation results
CREATE POLICY "Users can update their own federation results" ON federation_submission_results
    FOR UPDATE
    TO authenticated
    USING (
        submission_id IN (
            SELECT id FROM submissions WHERE user_id = auth.uid()
        )
    );

-- Create a view for federation submission summaries
CREATE OR REPLACE VIEW federation_submission_summary AS
SELECT 
    s.id as submission_id,
    s.url,
    s.title,
    s.user_id,
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
WHERE s.federation_enabled = true
GROUP BY s.id, s.url, s.title, s.user_id, s.status;

-- Grant access to the view
GRANT SELECT ON federation_submission_summary TO authenticated, service_role;

-- Create function to get federation status for a submission
CREATE OR REPLACE FUNCTION get_federation_status(submission_uuid UUID)
RETURNS TABLE (
    directory_id VARCHAR(255),
    instance_url VARCHAR(500),
    status VARCHAR(50),
    remote_submission_id VARCHAR(255),
    error_message TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fsr.directory_id,
        fsr.instance_url,
        fsr.status,
        fsr.remote_submission_id,
        fsr.error_message,
        fsr.submitted_at,
        fsr.updated_at
    FROM federation_submission_results fsr
    WHERE fsr.submission_id = submission_uuid
    ORDER BY fsr.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_federation_status(UUID) TO authenticated, service_role;

-- Create function to retry failed federation submissions
CREATE OR REPLACE FUNCTION retry_failed_federation_submissions(submission_uuid UUID)
RETURNS TABLE (
    directory_id VARCHAR(255),
    instance_url VARCHAR(500),
    retry_count INTEGER
) AS $$
BEGIN
    -- Update retry count and timestamp for failed submissions
    UPDATE federation_submission_results 
    SET 
        retry_count = retry_count + 1,
        last_retry_at = NOW(),
        status = 'pending',
        error_message = NULL,
        updated_at = NOW()
    WHERE submission_id = submission_uuid 
    AND status = 'failed';
    
    -- Return the updated records
    RETURN QUERY
    SELECT 
        fsr.directory_id,
        fsr.instance_url,
        fsr.retry_count
    FROM federation_submission_results fsr
    WHERE fsr.submission_id = submission_uuid 
    AND fsr.last_retry_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the retry function
GRANT EXECUTE ON FUNCTION retry_failed_federation_submissions(UUID) TO authenticated, service_role;

-- Insert some sample federation submission results for testing
INSERT INTO federation_submission_results (
    submission_id,
    directory_id,
    instance_url,
    status,
    remote_submission_id,
    submitted_at
) 
SELECT 
    s.id,
    'main',
    'https://ph-clone.example.com',
    'approved',
    'remote-' || substr(gen_random_uuid()::text, 1, 8),
    NOW() - INTERVAL '1 day'
FROM submissions s 
WHERE s.url = 'https://example.com'
LIMIT 1
ON CONFLICT (submission_id, directory_id, instance_url) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE federation_submission_results IS 'Tracks the results of submissions to federated directories across multiple instances';
COMMENT ON COLUMN federation_submission_results.submission_id IS 'Reference to the local submission';
COMMENT ON COLUMN federation_submission_results.directory_id IS 'ID of the directory on the remote instance';
COMMENT ON COLUMN federation_submission_results.instance_url IS 'Base URL of the federation instance';
COMMENT ON COLUMN federation_submission_results.status IS 'Current status: pending, submitted, approved, rejected, or failed';
COMMENT ON COLUMN federation_submission_results.remote_submission_id IS 'ID assigned by the remote instance';
COMMENT ON COLUMN federation_submission_results.response_data IS 'Additional response data from the remote instance';
COMMENT ON VIEW federation_submission_summary IS 'Summary view of federation submission statistics';
COMMENT ON FUNCTION get_federation_status(UUID) IS 'Returns federation status for a specific submission';
COMMENT ON FUNCTION retry_failed_federation_submissions(UUID) IS 'Marks failed federation submissions for retry';