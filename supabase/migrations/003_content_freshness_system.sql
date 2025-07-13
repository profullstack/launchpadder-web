-- Content Freshness and Regeneration System Migration
-- This migration adds tables and columns to support content freshness monitoring,
-- metadata regeneration, AI content updates, and lifecycle management

-- Add content freshness tracking columns to submissions table
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS last_metadata_check TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS last_metadata_update TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS last_ai_regeneration TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS content_freshness_score INTEGER DEFAULT 100;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS url_status_code INTEGER;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS url_last_checked TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS metadata_version INTEGER DEFAULT 1;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT FALSE;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Create content freshness policies table
CREATE TABLE public.content_freshness_policies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    max_age_hours INTEGER NOT NULL DEFAULT 168, -- 7 days
    stale_threshold_hours INTEGER NOT NULL DEFAULT 720, -- 30 days
    check_frequency_hours INTEGER NOT NULL DEFAULT 24, -- Daily
    auto_regenerate BOOLEAN DEFAULT TRUE,
    auto_archive BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create content validation results table
CREATE TABLE public.content_validation_results (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    validation_type TEXT NOT NULL, -- 'url_check', 'metadata_validation', 'image_validation'
    status TEXT NOT NULL, -- 'passed', 'failed', 'warning'
    details JSONB NOT NULL DEFAULT '{}',
    error_message TEXT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_validation_submission_id (submission_id),
    INDEX idx_validation_type (validation_type),
    INDEX idx_validation_status (status),
    INDEX idx_validation_checked_at (checked_at DESC)
);

-- Create metadata history table for tracking changes
CREATE TABLE public.metadata_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    original_meta JSONB NOT NULL DEFAULT '{}',
    rewritten_meta JSONB NOT NULL DEFAULT '{}',
    images JSONB NOT NULL DEFAULT '{}',
    change_type TEXT NOT NULL, -- 'initial', 'refresh', 'ai_regeneration', 'manual'
    change_reason TEXT,
    metadata_diff JSONB, -- JSON diff of changes
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(submission_id, version),
    INDEX idx_metadata_history_submission_id (submission_id),
    INDEX idx_metadata_history_version (version),
    INDEX idx_metadata_history_change_type (change_type),
    INDEX idx_metadata_history_created_at (created_at DESC)
);

-- Create content refresh queue table
CREATE TABLE public.content_refresh_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    refresh_type TEXT NOT NULL, -- 'metadata', 'ai_regeneration', 'validation', 'full'
    priority INTEGER DEFAULT 5, -- 1 (highest) to 10 (lowest)
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    metadata JSONB DEFAULT '{}', -- Additional context for the refresh job
    
    INDEX idx_refresh_queue_status (status),
    INDEX idx_refresh_queue_priority (priority),
    INDEX idx_refresh_queue_scheduled_at (scheduled_at),
    INDEX idx_refresh_queue_submission_id (submission_id)
);

-- Create content freshness metrics table
CREATE TABLE public.content_freshness_metrics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    date DATE NOT NULL,
    total_submissions INTEGER DEFAULT 0,
    fresh_submissions INTEGER DEFAULT 0,
    stale_submissions INTEGER DEFAULT 0,
    archived_submissions INTEGER DEFAULT 0,
    failed_checks INTEGER DEFAULT 0,
    successful_regenerations INTEGER DEFAULT 0,
    failed_regenerations INTEGER DEFAULT 0,
    avg_freshness_score DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(date),
    INDEX idx_freshness_metrics_date (date DESC)
);

-- Create AI content variations table for A/B testing
CREATE TABLE public.ai_content_variations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    variation_name TEXT NOT NULL,
    title TEXT,
    description TEXT,
    tags TEXT[] DEFAULT '{}',
    ai_model TEXT,
    ai_prompt TEXT,
    generation_metadata JSONB DEFAULT '{}',
    performance_metrics JSONB DEFAULT '{}', -- CTR, engagement, etc.
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_ai_variations_submission_id (submission_id),
    INDEX idx_ai_variations_active (is_active),
    INDEX idx_ai_variations_created_at (created_at DESC)
);

-- Create content lifecycle events table
CREATE TABLE public.content_lifecycle_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'created', 'updated', 'refreshed', 'archived', 'restored'
    event_data JSONB DEFAULT '{}',
    triggered_by TEXT, -- 'system', 'user', 'scheduler'
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_lifecycle_events_submission_id (submission_id),
    INDEX idx_lifecycle_events_type (event_type),
    INDEX idx_lifecycle_events_created_at (created_at DESC)
);

-- Insert default content freshness policies
INSERT INTO public.content_freshness_policies (name, description, max_age_hours, stale_threshold_hours, check_frequency_hours, auto_regenerate, auto_archive, priority) VALUES
('default', 'Default policy for all submissions', 168, 720, 24, TRUE, FALSE, 5),
('high_priority', 'High priority submissions (featured, promoted)', 72, 336, 12, TRUE, FALSE, 1),
('low_priority', 'Low priority submissions (old, low engagement)', 336, 2160, 72, FALSE, TRUE, 8),
('ai_generated', 'AI-generated content with frequent updates', 48, 168, 6, TRUE, FALSE, 3),
('manual_only', 'Manual refresh only, no automation', 8760, 17520, 8760, FALSE, FALSE, 10);

-- Create indexes for performance
CREATE INDEX idx_submissions_last_metadata_check ON public.submissions(last_metadata_check);
CREATE INDEX idx_submissions_content_freshness_score ON public.submissions(content_freshness_score);
CREATE INDEX idx_submissions_is_stale ON public.submissions(is_stale);
CREATE INDEX idx_submissions_archived_at ON public.submissions(archived_at);
CREATE INDEX idx_submissions_url_status_code ON public.submissions(url_status_code);

-- Create function to calculate content freshness score
CREATE OR REPLACE FUNCTION calculate_content_freshness_score(
    last_check TIMESTAMP WITH TIME ZONE,
    last_update TIMESTAMP WITH TIME ZONE,
    url_status INTEGER,
    max_age_hours INTEGER DEFAULT 168
)
RETURNS INTEGER AS $$
DECLARE
    hours_since_check INTEGER;
    hours_since_update INTEGER;
    base_score INTEGER := 100;
    score INTEGER;
BEGIN
    -- Calculate hours since last check and update
    hours_since_check := EXTRACT(EPOCH FROM (NOW() - COALESCE(last_check, NOW() - INTERVAL '1 year'))) / 3600;
    hours_since_update := EXTRACT(EPOCH FROM (NOW() - COALESCE(last_update, NOW() - INTERVAL '1 year'))) / 3600;
    
    -- Start with base score
    score := base_score;
    
    -- Reduce score based on time since last check
    IF hours_since_check > max_age_hours THEN
        score := score - LEAST(50, (hours_since_check - max_age_hours) / 24 * 5);
    END IF;
    
    -- Reduce score based on time since last update
    IF hours_since_update > max_age_hours * 2 THEN
        score := score - LEAST(30, (hours_since_update - max_age_hours * 2) / 24 * 3);
    END IF;
    
    -- Reduce score for failed URL checks
    IF url_status IS NOT NULL AND url_status >= 400 THEN
        score := score - 40;
    END IF;
    
    -- Ensure score is between 0 and 100
    RETURN GREATEST(0, LEAST(100, score));
END;
$$ LANGUAGE plpgsql;

-- Create function to update freshness scores
CREATE OR REPLACE FUNCTION update_content_freshness_scores()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER := 0;
    submission_record RECORD;
    policy_record RECORD;
    new_score INTEGER;
BEGIN
    -- Update freshness scores for all submissions
    FOR submission_record IN 
        SELECT s.id, s.last_metadata_check, s.last_metadata_update, s.url_status_code,
               COALESCE(cfp.max_age_hours, 168) as max_age_hours
        FROM public.submissions s
        LEFT JOIN public.content_freshness_policies cfp ON cfp.name = 'default'
        WHERE s.archived_at IS NULL
    LOOP
        new_score := calculate_content_freshness_score(
            submission_record.last_metadata_check,
            submission_record.last_metadata_update,
            submission_record.url_status_code,
            submission_record.max_age_hours
        );
        
        UPDATE public.submissions 
        SET content_freshness_score = new_score,
            is_stale = (new_score < 50)
        WHERE id = submission_record.id;
        
        updated_count := updated_count + 1;
    END LOOP;
    
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update freshness score when relevant fields change
CREATE OR REPLACE FUNCTION trigger_update_freshness_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content_freshness_score := calculate_content_freshness_score(
        NEW.last_metadata_check,
        NEW.last_metadata_update,
        NEW.url_status_code,
        168 -- Default max age
    );
    
    NEW.is_stale := (NEW.content_freshness_score < 50);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_submission_freshness_score
    BEFORE UPDATE ON public.submissions
    FOR EACH ROW
    WHEN (OLD.last_metadata_check IS DISTINCT FROM NEW.last_metadata_check OR
          OLD.last_metadata_update IS DISTINCT FROM NEW.last_metadata_update OR
          OLD.url_status_code IS DISTINCT FROM NEW.url_status_code)
    EXECUTE FUNCTION trigger_update_freshness_score();

-- Create trigger for content freshness policies updated_at
CREATE TRIGGER update_content_freshness_policies_updated_at
    BEFORE UPDATE ON public.content_freshness_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to archive old submissions
CREATE OR REPLACE FUNCTION archive_stale_submissions(
    stale_threshold_hours INTEGER DEFAULT 720
)
RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER := 0;
BEGIN
    UPDATE public.submissions 
    SET archived_at = NOW()
    WHERE archived_at IS NULL
      AND is_stale = TRUE
      AND last_metadata_check < NOW() - INTERVAL '1 hour' * stale_threshold_hours;
    
    GET DIAGNOSTICS archived_count = ROW_COUNT;
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate daily freshness metrics
CREATE OR REPLACE FUNCTION generate_daily_freshness_metrics(target_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
DECLARE
    metrics_record RECORD;
BEGIN
    -- Calculate metrics for the target date
    SELECT 
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE content_freshness_score >= 70) as fresh_submissions,
        COUNT(*) FILTER (WHERE is_stale = TRUE) as stale_submissions,
        COUNT(*) FILTER (WHERE archived_at IS NOT NULL) as archived_submissions,
        COUNT(*) FILTER (WHERE url_status_code >= 400) as failed_checks,
        AVG(content_freshness_score) as avg_freshness_score
    INTO metrics_record
    FROM public.submissions
    WHERE DATE(created_at) <= target_date;
    
    -- Insert or update metrics
    INSERT INTO public.content_freshness_metrics (
        date, total_submissions, fresh_submissions, stale_submissions,
        archived_submissions, failed_checks, avg_freshness_score
    ) VALUES (
        target_date,
        metrics_record.total_submissions,
        metrics_record.fresh_submissions,
        metrics_record.stale_submissions,
        metrics_record.archived_submissions,
        metrics_record.failed_checks,
        ROUND(metrics_record.avg_freshness_score, 2)
    )
    ON CONFLICT (date) DO UPDATE SET
        total_submissions = EXCLUDED.total_submissions,
        fresh_submissions = EXCLUDED.fresh_submissions,
        stale_submissions = EXCLUDED.stale_submissions,
        archived_submissions = EXCLUDED.archived_submissions,
        failed_checks = EXCLUDED.failed_checks,
        avg_freshness_score = EXCLUDED.avg_freshness_score;
END;
$$ LANGUAGE plpgsql;