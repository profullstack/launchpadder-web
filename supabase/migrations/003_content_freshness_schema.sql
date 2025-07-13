-- Content Freshness and Regeneration System Schema
-- Migration 003: Content freshness tracking tables

-- Create custom types for content freshness
CREATE TYPE content_freshness_status AS ENUM ('fresh', 'stale', 'expired', 'processing', 'failed');
CREATE TYPE refresh_priority AS ENUM ('low', 'normal', 'high', 'critical');
CREATE TYPE change_detection_type AS ENUM ('content_hash', 'metadata_diff', 'image_change', 'full_scan');

-- Content freshness tracking table
CREATE TABLE public.content_freshness (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE NOT NULL,
    
    -- Freshness tracking
    status content_freshness_status DEFAULT 'fresh',
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    next_check_at TIMESTAMP WITH TIME ZONE,
    
    -- Content versioning
    content_version INTEGER DEFAULT 1,
    content_hash TEXT NOT NULL,
    metadata_hash TEXT NOT NULL,
    images_hash TEXT,
    
    -- Staleness scoring
    staleness_score DECIMAL(5,2) DEFAULT 0.0,
    freshness_threshold_hours INTEGER DEFAULT 24,
    
    -- Configuration
    refresh_interval_hours INTEGER DEFAULT 24,
    priority refresh_priority DEFAULT 'normal',
    auto_refresh_enabled BOOLEAN DEFAULT TRUE,
    
    -- Tracking
    check_count INTEGER DEFAULT 0,
    update_count INTEGER DEFAULT 0,
    last_change_detected_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(submission_id)
);

-- Content version history table
CREATE TABLE public.content_versions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE NOT NULL,
    freshness_id UUID REFERENCES public.content_freshness(id) ON DELETE CASCADE NOT NULL,
    
    -- Version tracking
    version_number INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    metadata_hash TEXT NOT NULL,
    images_hash TEXT,
    
    -- Change detection
    changes_detected JSONB DEFAULT '{}',
    change_summary TEXT,
    change_score DECIMAL(5,2) DEFAULT 0.0,
    
    -- Metadata snapshots
    original_meta_snapshot JSONB,
    rewritten_meta_snapshot JSONB,
    images_snapshot JSONB,
    
    -- Processing info
    processing_duration_ms INTEGER,
    detection_method change_detection_type,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(submission_id, version_number)
);

-- Refresh queue table for scheduling
CREATE TABLE public.refresh_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE NOT NULL,
    freshness_id UUID REFERENCES public.content_freshness(id) ON DELETE CASCADE NOT NULL,
    
    -- Queue management
    priority refresh_priority DEFAULT 'normal',
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Processing info
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    worker_id TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    
    -- Batch processing
    batch_id UUID,
    batch_size INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Refresh history and logs
CREATE TABLE public.refresh_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE NOT NULL,
    freshness_id UUID REFERENCES public.content_freshness(id) ON DELETE CASCADE NOT NULL,
    queue_id UUID REFERENCES public.refresh_queue(id) ON DELETE SET NULL,
    
    -- Refresh details
    refresh_type TEXT NOT NULL CHECK (refresh_type IN ('scheduled', 'manual', 'triggered', 'batch')),
    trigger_reason TEXT,
    
    -- Results
    success BOOLEAN NOT NULL,
    changes_found BOOLEAN DEFAULT FALSE,
    content_updated BOOLEAN DEFAULT FALSE,
    
    -- Performance metrics
    processing_duration_ms INTEGER,
    network_requests_count INTEGER DEFAULT 0,
    bytes_processed INTEGER DEFAULT 0,
    
    -- Change details
    changes_detected JSONB DEFAULT '{}',
    old_content_hash TEXT,
    new_content_hash TEXT,
    
    -- Error info
    error_message TEXT,
    error_code TEXT,
    
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance analytics table
CREATE TABLE public.freshness_analytics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Time period
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Metrics
    total_submissions_tracked INTEGER DEFAULT 0,
    fresh_submissions_count INTEGER DEFAULT 0,
    stale_submissions_count INTEGER DEFAULT 0,
    expired_submissions_count INTEGER DEFAULT 0,
    
    -- Processing stats
    total_refreshes_attempted INTEGER DEFAULT 0,
    successful_refreshes INTEGER DEFAULT 0,
    failed_refreshes INTEGER DEFAULT 0,
    changes_detected_count INTEGER DEFAULT 0,
    
    -- Performance metrics
    avg_processing_duration_ms DECIMAL(10,2),
    total_processing_time_ms BIGINT DEFAULT 0,
    avg_staleness_score DECIMAL(5,2),
    
    -- Resource usage
    total_network_requests INTEGER DEFAULT 0,
    total_bytes_processed BIGINT DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Configuration table for system settings
CREATE TABLE public.freshness_config (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Configuration key-value pairs
    config_key TEXT NOT NULL UNIQUE,
    config_value JSONB NOT NULL,
    config_type TEXT NOT NULL CHECK (config_type IN ('string', 'number', 'boolean', 'object', 'array')),
    
    -- Metadata
    description TEXT,
    category TEXT DEFAULT 'general',
    is_system BOOLEAN DEFAULT FALSE,
    
    -- Validation
    validation_schema JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_content_freshness_submission_id ON public.content_freshness(submission_id);
CREATE INDEX idx_content_freshness_status ON public.content_freshness(status);
CREATE INDEX idx_content_freshness_next_check ON public.content_freshness(next_check_at);
CREATE INDEX idx_content_freshness_priority ON public.content_freshness(priority);
CREATE INDEX idx_content_freshness_staleness ON public.content_freshness(staleness_score DESC);

CREATE INDEX idx_content_versions_submission_id ON public.content_versions(submission_id);
CREATE INDEX idx_content_versions_freshness_id ON public.content_versions(freshness_id);
CREATE INDEX idx_content_versions_version_number ON public.content_versions(version_number DESC);
CREATE INDEX idx_content_versions_created_at ON public.content_versions(created_at DESC);

CREATE INDEX idx_refresh_queue_status ON public.refresh_queue(status);
CREATE INDEX idx_refresh_queue_priority ON public.refresh_queue(priority);
CREATE INDEX idx_refresh_queue_scheduled_at ON public.refresh_queue(scheduled_at);
CREATE INDEX idx_refresh_queue_batch_id ON public.refresh_queue(batch_id);
CREATE INDEX idx_refresh_queue_submission_id ON public.refresh_queue(submission_id);

CREATE INDEX idx_refresh_history_submission_id ON public.refresh_history(submission_id);
CREATE INDEX idx_refresh_history_success ON public.refresh_history(success);
CREATE INDEX idx_refresh_history_started_at ON public.refresh_history(started_at DESC);
CREATE INDEX idx_refresh_history_refresh_type ON public.refresh_history(refresh_type);

CREATE INDEX idx_freshness_analytics_period ON public.freshness_analytics(period_start, period_end);
CREATE INDEX idx_freshness_config_key ON public.freshness_config(config_key);
CREATE INDEX idx_freshness_config_category ON public.freshness_config(category);

-- Create triggers for updated_at columns
CREATE TRIGGER update_content_freshness_updated_at
    BEFORE UPDATE ON public.content_freshness
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refresh_queue_updated_at
    BEFORE UPDATE ON public.refresh_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_freshness_config_updated_at
    BEFORE UPDATE ON public.freshness_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate staleness score
CREATE OR REPLACE FUNCTION calculate_staleness_score(
    last_checked TIMESTAMP WITH TIME ZONE,
    threshold_hours INTEGER,
    priority refresh_priority
)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    hours_since_check DECIMAL(10,2);
    base_score DECIMAL(5,2);
    priority_multiplier DECIMAL(3,2);
BEGIN
    -- Calculate hours since last check
    hours_since_check := EXTRACT(EPOCH FROM (NOW() - last_checked)) / 3600.0;
    
    -- Base score calculation
    base_score := LEAST(100.0, (hours_since_check / threshold_hours) * 100.0);
    
    -- Priority multiplier
    priority_multiplier := CASE priority
        WHEN 'critical' THEN 1.5
        WHEN 'high' THEN 1.2
        WHEN 'normal' THEN 1.0
        WHEN 'low' THEN 0.8
        ELSE 1.0
    END;
    
    RETURN ROUND(base_score * priority_multiplier, 2);
END;
$$ LANGUAGE plpgsql;

-- Function to update staleness scores
CREATE OR REPLACE FUNCTION update_staleness_scores()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    UPDATE public.content_freshness
    SET staleness_score = calculate_staleness_score(
        last_checked_at,
        freshness_threshold_hours,
        priority
    )
    WHERE auto_refresh_enabled = TRUE;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically create freshness tracking for new submissions
CREATE OR REPLACE FUNCTION create_freshness_tracking()
RETURNS TRIGGER AS $$
DECLARE
    initial_hash TEXT;
    meta_hash TEXT;
BEGIN
    -- Generate initial content hash
    initial_hash := encode(digest(NEW.url || COALESCE(NEW.original_meta::text, ''), 'sha256'), 'hex');
    meta_hash := encode(digest(COALESCE(NEW.original_meta::text, '{}'), 'sha256'), 'hex');
    
    -- Create freshness tracking record
    INSERT INTO public.content_freshness (
        submission_id,
        content_hash,
        metadata_hash,
        status,
        next_check_at
    ) VALUES (
        NEW.id,
        initial_hash,
        meta_hash,
        'fresh',
        NOW() + INTERVAL '24 hours'
    );
    
    -- Create initial version record
    INSERT INTO public.content_versions (
        submission_id,
        freshness_id,
        version_number,
        content_hash,
        metadata_hash,
        original_meta_snapshot,
        rewritten_meta_snapshot,
        images_snapshot,
        detection_method
    ) VALUES (
        NEW.id,
        (SELECT id FROM public.content_freshness WHERE submission_id = NEW.id),
        1,
        initial_hash,
        meta_hash,
        NEW.original_meta,
        NEW.rewritten_meta,
        NEW.images,
        'full_scan'
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic freshness tracking
CREATE TRIGGER create_submission_freshness_tracking
    AFTER INSERT ON public.submissions
    FOR EACH ROW
    EXECUTE FUNCTION create_freshness_tracking();

-- Insert default configuration values
INSERT INTO public.freshness_config (config_key, config_value, config_type, description, category, is_system) VALUES
('default_refresh_interval_hours', '24', 'number', 'Default refresh interval in hours', 'scheduling', true),
('max_concurrent_refreshes', '10', 'number', 'Maximum concurrent refresh operations', 'performance', true),
('batch_size_limit', '100', 'number', 'Maximum batch size for bulk operations', 'performance', true),
('staleness_threshold_hours', '48', 'number', 'Hours after which content is considered stale', 'freshness', true),
('expiry_threshold_hours', '168', 'number', 'Hours after which content is considered expired (7 days)', 'freshness', true),
('retry_max_attempts', '3', 'number', 'Maximum retry attempts for failed refreshes', 'reliability', true),
('retry_backoff_multiplier', '2.0', 'number', 'Backoff multiplier for retry delays', 'reliability', true),
('change_detection_sensitivity', '0.1', 'number', 'Sensitivity threshold for change detection (0-1)', 'detection', true),
('enable_auto_refresh', 'true', 'boolean', 'Enable automatic refresh scheduling', 'scheduling', true),
('enable_batch_processing', 'true', 'boolean', 'Enable batch processing for efficiency', 'performance', true),
('priority_weights', '{"low": 0.5, "normal": 1.0, "high": 1.5, "critical": 2.0}', 'object', 'Priority weights for scheduling', 'scheduling', true),
('performance_monitoring', 'true', 'boolean', 'Enable performance monitoring and analytics', 'monitoring', true);