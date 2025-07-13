-- Migration: Federation Instances Table
-- Description: Creates table for managing federation instances and their discovery

-- Create federation_instances table
CREATE TABLE IF NOT EXISTS federation_instances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    base_url VARCHAR(500) NOT NULL UNIQUE,
    description TEXT,
    admin_email VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'error')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Federation metadata
    api_version VARCHAR(20),
    federation_enabled BOOLEAN DEFAULT true,
    supported_features JSONB DEFAULT '[]'::jsonb,
    
    -- Health check data
    health_status VARCHAR(50) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
    last_health_check TIMESTAMP WITH TIME ZONE,
    error_count INTEGER DEFAULT 0,
    
    -- Constraints
    CONSTRAINT valid_email CHECK (admin_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_url CHECK (base_url ~* '^https?://[^\s/$.?#].[^\s]*$')
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_federation_instances_status ON federation_instances(status);
CREATE INDEX IF NOT EXISTS idx_federation_instances_last_seen ON federation_instances(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_federation_instances_health_status ON federation_instances(health_status);
CREATE INDEX IF NOT EXISTS idx_federation_instances_created_at ON federation_instances(created_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_federation_instances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_federation_instances_updated_at
    BEFORE UPDATE ON federation_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_federation_instances_updated_at();

-- Row Level Security (RLS) policies
ALTER TABLE federation_instances ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to active instances (for federation discovery)
CREATE POLICY "Public read access to active federation instances" ON federation_instances
    FOR SELECT
    USING (status = 'active');

-- Policy: Allow authenticated users to read all instances
CREATE POLICY "Authenticated users can read all federation instances" ON federation_instances
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Allow service role to manage all instances
CREATE POLICY "Service role can manage federation instances" ON federation_instances
    FOR ALL
    TO service_role
    USING (true);

-- Policy: Allow public registration of new instances
CREATE POLICY "Public can register new federation instances" ON federation_instances
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Insert some sample federation instances for testing
INSERT INTO federation_instances (
    name, 
    base_url, 
    description, 
    admin_email, 
    status,
    api_version,
    federation_enabled,
    supported_features,
    health_status
) VALUES 
(
    'LaunchPadder Main',
    'https://launchpadder.com',
    'Main LaunchPadder instance for product and startup directory submissions',
    'admin@launchpadder.com',
    'active',
    '1.0',
    true,
    '["submissions", "directories", "metadata_extraction", "ai_enhancement", "crypto_payments"]'::jsonb,
    'healthy'
),
(
    'ProductHunt Clone',
    'https://ph-clone.example.com',
    'Product Hunt style directory for tech products and startups',
    'admin@ph-clone.example.com',
    'active',
    '1.0',
    true,
    '["submissions", "directories", "voting"]'::jsonb,
    'healthy'
),
(
    'Indie Hackers Directory',
    'https://ih-directory.example.com',
    'Directory focused on indie projects and bootstrapped startups',
    'admin@ih-directory.example.com',
    'pending',
    '0.9',
    true,
    '["submissions", "directories"]'::jsonb,
    'unknown'
)
ON CONFLICT (base_url) DO NOTHING;

-- Create a view for public federation instance information
CREATE OR REPLACE VIEW public_federation_instances AS
SELECT 
    id,
    name,
    base_url,
    description,
    status,
    created_at,
    last_seen,
    api_version,
    federation_enabled,
    supported_features,
    health_status,
    last_health_check
FROM federation_instances
WHERE status = 'active' AND federation_enabled = true;

-- Grant access to the view
GRANT SELECT ON public_federation_instances TO anon, authenticated;

-- Add comments for documentation
COMMENT ON TABLE federation_instances IS 'Stores information about federated LaunchPadder instances for discovery and communication';
COMMENT ON COLUMN federation_instances.base_url IS 'Base URL of the federation instance (must be unique)';
COMMENT ON COLUMN federation_instances.status IS 'Current status: pending (awaiting verification), active (verified and working), inactive (temporarily down), error (failed verification)';
COMMENT ON COLUMN federation_instances.supported_features IS 'JSON array of features supported by this instance';
COMMENT ON COLUMN federation_instances.health_status IS 'Result of last health check: healthy, unhealthy, or unknown';
COMMENT ON VIEW public_federation_instances IS 'Public view of active federation instances for discovery';