-- Spam Prevention and Rate Limiting System Migration
-- This migration creates all necessary tables for comprehensive spam prevention

-- Enable additional extensions
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create custom types for spam prevention
CREATE TYPE rate_limit_type AS ENUM ('ip', 'user', 'api_key', 'global');
CREATE TYPE penalty_type AS ENUM ('warning', 'rate_limit', 'temporary_ban', 'permanent_ban', 'ip_block');
CREATE TYPE abuse_report_status AS ENUM ('pending', 'investigating', 'resolved', 'dismissed');
CREATE TYPE ip_reputation AS ENUM ('trusted', 'neutral', 'suspicious', 'blocked');

-- Rate limiting configuration table
CREATE TABLE public.rate_limit_configs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type rate_limit_type NOT NULL,
    max_requests INTEGER NOT NULL,
    window_seconds INTEGER NOT NULL,
    burst_allowance INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positive_max_requests CHECK (max_requests > 0),
    CONSTRAINT positive_window CHECK (window_seconds > 0),
    CONSTRAINT non_negative_burst CHECK (burst_allowance >= 0)
);

-- Rate limiting tracking table
CREATE TABLE public.rate_limit_tracking (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    identifier TEXT NOT NULL, -- IP, user_id, api_key, or 'global'
    config_id UUID REFERENCES public.rate_limit_configs(id) ON DELETE CASCADE,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_request_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_until TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(identifier, config_id)
);

-- IP reputation and management table
CREATE TABLE public.ip_addresses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ip_address INET NOT NULL UNIQUE,
    reputation ip_reputation DEFAULT 'neutral',
    country_code TEXT,
    is_vpn BOOLEAN DEFAULT FALSE,
    is_proxy BOOLEAN DEFAULT FALSE,
    is_tor BOOLEAN DEFAULT FALSE,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    request_count INTEGER DEFAULT 0,
    abuse_score INTEGER DEFAULT 0,
    notes TEXT,
    
    CONSTRAINT valid_abuse_score CHECK (abuse_score >= 0 AND abuse_score <= 100)
);

-- Spam detection rules table
CREATE TABLE public.spam_detection_rules (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    rule_type TEXT NOT NULL, -- 'content', 'url', 'behavior', 'pattern'
    pattern TEXT, -- Regex pattern or keyword
    threshold DECIMAL(5,2), -- Confidence threshold (0-100)
    action TEXT NOT NULL, -- 'flag', 'block', 'quarantine'
    is_active BOOLEAN DEFAULT TRUE,
    weight INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_threshold CHECK (threshold >= 0 AND threshold <= 100),
    CONSTRAINT positive_weight CHECK (weight > 0)
);

-- Spam detection results table
CREATE TABLE public.spam_detections (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.spam_detection_rules(id) ON DELETE CASCADE,
    confidence_score DECIMAL(5,2) NOT NULL,
    matched_content TEXT,
    action_taken TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 100)
);

-- CAPTCHA challenges table
CREATE TABLE public.captcha_challenges (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    challenge_token TEXT NOT NULL UNIQUE,
    ip_address INET NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    challenge_type TEXT NOT NULL, -- 'recaptcha', 'hcaptcha', 'turnstile'
    action_type TEXT NOT NULL, -- 'submission', 'registration', 'password_reset'
    is_solved BOOLEAN DEFAULT FALSE,
    solution_data JSONB,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    solved_at TIMESTAMP WITH TIME ZONE
);

-- Abuse reports table
CREATE TABLE public.abuse_reports (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    report_type TEXT NOT NULL, -- 'spam', 'inappropriate', 'copyright', 'other'
    description TEXT NOT NULL,
    status abuse_report_status DEFAULT 'pending',
    priority INTEGER DEFAULT 1, -- 1=low, 2=medium, 3=high, 4=critical
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 4),
    CONSTRAINT non_empty_description CHECK (LENGTH(TRIM(description)) > 0)
);

-- User penalties table
CREATE TABLE public.user_penalties (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    penalty_type penalty_type NOT NULL,
    reason TEXT NOT NULL,
    severity INTEGER DEFAULT 1, -- 1=minor, 2=moderate, 3=severe, 4=critical
    is_active BOOLEAN DEFAULT TRUE,
    starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    applied_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    appeal_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_severity CHECK (severity >= 1 AND severity <= 4),
    CONSTRAINT non_empty_reason CHECK (LENGTH(TRIM(reason)) > 0)
);

-- Monitoring alerts table
CREATE TABLE public.monitoring_alerts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    alert_type TEXT NOT NULL, -- 'rate_limit_breach', 'spam_surge', 'abuse_pattern'
    severity TEXT NOT NULL, -- 'info', 'warning', 'error', 'critical'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT non_empty_title CHECK (LENGTH(TRIM(title)) > 0)
);

-- Create indexes for performance
CREATE INDEX idx_rate_limit_tracking_identifier ON public.rate_limit_tracking(identifier);
CREATE INDEX idx_rate_limit_tracking_window_start ON public.rate_limit_tracking(window_start);
CREATE INDEX idx_rate_limit_tracking_blocked ON public.rate_limit_tracking(is_blocked);

CREATE INDEX idx_ip_addresses_ip ON public.ip_addresses(ip_address);
CREATE INDEX idx_ip_addresses_reputation ON public.ip_addresses(reputation);
CREATE INDEX idx_ip_addresses_abuse_score ON public.ip_addresses(abuse_score);
CREATE INDEX idx_ip_addresses_last_seen ON public.ip_addresses(last_seen_at);

CREATE INDEX idx_spam_detections_submission ON public.spam_detections(submission_id);
CREATE INDEX idx_spam_detections_rule ON public.spam_detections(rule_id);
CREATE INDEX idx_spam_detections_confidence ON public.spam_detections(confidence_score);
CREATE INDEX idx_spam_detections_detected_at ON public.spam_detections(detected_at);

CREATE INDEX idx_captcha_challenges_token ON public.captcha_challenges(challenge_token);
CREATE INDEX idx_captcha_challenges_ip ON public.captcha_challenges(ip_address);
CREATE INDEX idx_captcha_challenges_expires ON public.captcha_challenges(expires_at);
CREATE INDEX idx_captcha_challenges_solved ON public.captcha_challenges(is_solved);

CREATE INDEX idx_abuse_reports_submission ON public.abuse_reports(submission_id);
CREATE INDEX idx_abuse_reports_status ON public.abuse_reports(status);
CREATE INDEX idx_abuse_reports_priority ON public.abuse_reports(priority);
CREATE INDEX idx_abuse_reports_created_at ON public.abuse_reports(created_at);

CREATE INDEX idx_user_penalties_user ON public.user_penalties(user_id);
CREATE INDEX idx_user_penalties_active ON public.user_penalties(is_active);
CREATE INDEX idx_user_penalties_type ON public.user_penalties(penalty_type);
CREATE INDEX idx_user_penalties_expires ON public.user_penalties(expires_at);

CREATE INDEX idx_monitoring_alerts_type ON public.monitoring_alerts(alert_type);
CREATE INDEX idx_monitoring_alerts_severity ON public.monitoring_alerts(severity);
CREATE INDEX idx_monitoring_alerts_acknowledged ON public.monitoring_alerts(is_acknowledged);
CREATE INDEX idx_monitoring_alerts_created_at ON public.monitoring_alerts(created_at);

-- Create triggers for updated_at columns
CREATE TRIGGER update_rate_limit_configs_updated_at
    BEFORE UPDATE ON public.rate_limit_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spam_detection_rules_updated_at
    BEFORE UPDATE ON public.spam_detection_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_abuse_reports_updated_at
    BEFORE UPDATE ON public.abuse_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired rate limit tracking
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM public.rate_limit_tracking 
    WHERE window_start < NOW() - INTERVAL '1 hour'
    AND is_blocked = FALSE;
    
    UPDATE public.rate_limit_tracking 
    SET is_blocked = FALSE, blocked_until = NULL
    WHERE blocked_until IS NOT NULL 
    AND blocked_until < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired CAPTCHA challenges
CREATE OR REPLACE FUNCTION cleanup_expired_captchas()
RETURNS void AS $$
BEGIN
    DELETE FROM public.captcha_challenges 
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to update IP address last seen
CREATE OR REPLACE FUNCTION update_ip_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.ip_addresses (ip_address, last_seen_at, request_count)
    VALUES (NEW.ip_address, NOW(), 1)
    ON CONFLICT (ip_address) 
    DO UPDATE SET 
        last_seen_at = NOW(),
        request_count = ip_addresses.request_count + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate spam score for submissions
CREATE OR REPLACE FUNCTION calculate_spam_score(submission_id UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_score DECIMAL(5,2) := 0;
    detection_record RECORD;
BEGIN
    FOR detection_record IN 
        SELECT sd.confidence_score, sdr.weight
        FROM public.spam_detections sd
        JOIN public.spam_detection_rules sdr ON sd.rule_id = sdr.id
        WHERE sd.submission_id = submission_id
        AND sdr.is_active = TRUE
    LOOP
        total_score := total_score + (detection_record.confidence_score * detection_record.weight);
    END LOOP;
    
    RETURN LEAST(total_score, 100.0);
END;
$$ LANGUAGE plpgsql;

-- Insert default rate limit configurations
INSERT INTO public.rate_limit_configs (name, type, max_requests, window_seconds, burst_allowance) VALUES
('ip_anonymous_basic', 'ip', 10, 60, 2),
('ip_anonymous_strict', 'ip', 5, 60, 1),
('user_authenticated', 'user', 30, 60, 5),
('user_premium', 'user', 100, 60, 10),
('api_key_basic', 'api_key', 1000, 3600, 50),
('api_key_premium', 'api_key', 10000, 3600, 100),
('global_protection', 'global', 10000, 60, 500);

-- Insert default spam detection rules
INSERT INTO public.spam_detection_rules (name, description, rule_type, pattern, threshold, action, weight) VALUES
('excessive_caps', 'Detects excessive use of capital letters', 'content', '[A-Z]{10,}', 70.0, 'flag', 1),
('repeated_chars', 'Detects repeated characters pattern', 'content', '(.)\1{5,}', 80.0, 'flag', 2),
('spam_keywords', 'Common spam keywords', 'content', '(?i)(viagra|casino|lottery|winner|congratulations|urgent|act now)', 85.0, 'block', 3),
('suspicious_urls', 'Suspicious URL patterns', 'url', '(?i)(bit\.ly|tinyurl|t\.co)/[a-z0-9]+$', 60.0, 'flag', 2),
('duplicate_content', 'Duplicate submission detection', 'behavior', '', 95.0, 'block', 4),
('rapid_submission', 'Rapid submission pattern', 'behavior', '', 75.0, 'flag', 2);

-- Create a view for active penalties
CREATE VIEW public.active_user_penalties AS
SELECT 
    up.*,
    p.username,
    p.full_name
FROM public.user_penalties up
JOIN public.profiles p ON up.user_id = p.id
WHERE up.is_active = TRUE
AND (up.expires_at IS NULL OR up.expires_at > NOW());

-- Create a view for spam statistics
CREATE VIEW public.spam_statistics AS
SELECT 
    DATE_TRUNC('day', detected_at) as detection_date,
    sdr.name as rule_name,
    sdr.rule_type,
    COUNT(*) as detection_count,
    AVG(sd.confidence_score) as avg_confidence,
    COUNT(DISTINCT sd.submission_id) as unique_submissions
FROM public.spam_detections sd
JOIN public.spam_detection_rules sdr ON sd.rule_id = sdr.id
WHERE sd.detected_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', detected_at), sdr.name, sdr.rule_type
ORDER BY detection_date DESC, detection_count DESC;