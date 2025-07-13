-- Federation Partners and API Management Tables
-- This migration creates tables for managing federation partners, API keys, and related functionality

-- Federation Partners table
CREATE TABLE IF NOT EXISTS federation_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    organization VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    api_endpoint TEXT NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    tier VARCHAR(50) DEFAULT 'basic' CHECK (tier IN ('basic', 'premium', 'enterprise')),
    rate_limit INTEGER DEFAULT 100,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Federation Instances table (for tracking known federation instances)
CREATE TABLE IF NOT EXISTS federation_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'maintenance')),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    capabilities TEXT[] DEFAULT ARRAY[]::TEXT[],
    trust_score DECIMAL(3,1) DEFAULT 5.0 CHECK (trust_score >= 0 AND trust_score <= 10),
    api_version VARCHAR(50) DEFAULT '1.0',
    supported_features TEXT[] DEFAULT ARRAY[]::TEXT[],
    contact_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Directories table (for managing submission directories)
CREATE TABLE IF NOT EXISTS directories (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    submission_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submission_fee_usd DECIMAL(10,2) DEFAULT 5.00,
    crypto_supported BOOLEAN DEFAULT true,
    url_required BOOLEAN DEFAULT true,
    description_min_length INTEGER DEFAULT 50,
    moderation_required BOOLEAN DEFAULT true,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Webhooks table (for managing webhook endpoints)
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES federation_partners(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    secret VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_triggered TIMESTAMP WITH TIME ZONE,
    failure_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT webhooks_owner_check CHECK (
        (partner_id IS NOT NULL AND user_id IS NULL) OR 
        (partner_id IS NULL AND user_id IS NOT NULL)
    )
);

-- Webhook Deliveries table (for tracking webhook delivery attempts)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
    response_status INTEGER,
    response_body TEXT,
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE
);

-- API Usage Logs table (for tracking API usage and rate limiting)
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES federation_partners(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT api_usage_logs_user_check CHECK (
        (partner_id IS NOT NULL AND user_id IS NULL) OR 
        (partner_id IS NULL AND user_id IS NOT NULL)
    )
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_federation_partners_api_key ON federation_partners(api_key);
CREATE INDEX IF NOT EXISTS idx_federation_partners_status ON federation_partners(status);
CREATE INDEX IF NOT EXISTS idx_federation_partners_tier ON federation_partners(tier);

CREATE INDEX IF NOT EXISTS idx_federation_instances_url ON federation_instances(url);
CREATE INDEX IF NOT EXISTS idx_federation_instances_status ON federation_instances(status);
CREATE INDEX IF NOT EXISTS idx_federation_instances_trust_score ON federation_instances(trust_score DESC);

CREATE INDEX IF NOT EXISTS idx_directories_category ON directories(category);
CREATE INDEX IF NOT EXISTS idx_directories_status ON directories(status);
CREATE INDEX IF NOT EXISTS idx_directories_submission_count ON directories(submission_count DESC);

CREATE INDEX IF NOT EXISTS idx_webhooks_partner_id ON webhooks(partner_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_partner_id ON api_usage_logs(partner_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_endpoint ON api_usage_logs(endpoint);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_federation_partners_updated_at 
    BEFORE UPDATE ON federation_partners 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_federation_instances_updated_at 
    BEFORE UPDATE ON federation_instances 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_directories_updated_at 
    BEFORE UPDATE ON directories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at 
    BEFORE UPDATE ON webhooks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default directories
INSERT INTO directories (id, name, description, category, submission_fee_usd, tags) VALUES
('main', 'Main Directory', 'Primary product and service directory', 'products', 5.00, ARRAY['products', 'services', 'startups']),
('startups', 'Startup Showcase', 'Directory for early-stage startups and new ventures', 'startups', 10.00, ARRAY['startups', 'ventures', 'funding']),
('tools', 'Developer Tools', 'Directory for developer tools and productivity software', 'tools', 3.00, ARRAY['tools', 'development', 'productivity']),
('ai', 'AI & Machine Learning', 'Directory for AI tools, models, and ML platforms', 'ai', 7.50, ARRAY['ai', 'machine-learning', 'automation']),
('design', 'Design Resources', 'Directory for design tools, assets, and creative resources', 'design', 4.00, ARRAY['design', 'creative', 'assets'])
ON CONFLICT (id) DO NOTHING;

-- Function to generate API keys
CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS TEXT AS $$
BEGIN
    RETURN 'fed_key_' || encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to generate webhook secrets
CREATE OR REPLACE FUNCTION generate_webhook_secret()
RETURNS TEXT AS $$
BEGIN
    RETURN 'whsec_' || encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE federation_partners IS 'Stores information about federation partners and their API access';
COMMENT ON TABLE federation_instances IS 'Tracks known federation instances in the network';
COMMENT ON TABLE directories IS 'Manages submission directories and their configurations';
COMMENT ON TABLE webhooks IS 'Stores webhook endpoint configurations for real-time notifications';
COMMENT ON TABLE webhook_deliveries IS 'Tracks webhook delivery attempts and their status';
COMMENT ON TABLE api_usage_logs IS 'Logs API usage for monitoring and rate limiting';