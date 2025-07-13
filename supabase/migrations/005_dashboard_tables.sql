-- Migration: Dashboard Tables
-- Description: Creates tables for dashboard functionality including audit logs, export jobs, and platform settings

-- Create audit_logs table for tracking admin actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create export_jobs table for data export functionality
CREATE TABLE IF NOT EXISTS export_jobs (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('submissions', 'users', 'revenue', 'federation', 'audit_logs')),
    filters JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    download_url TEXT,
    error_message TEXT,
    file_size BIGINT,
    record_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Create platform_settings table for configurable platform settings
CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    platform_name VARCHAR(255) DEFAULT 'LaunchPadder',
    platform_description TEXT,
    submission_fee DECIMAL(10,2) DEFAULT 5.00,
    premium_submission_fee DECIMAL(10,2) DEFAULT 15.00,
    auto_approval BOOLEAN DEFAULT false,
    federation_enabled BOOLEAN DEFAULT true,
    max_submissions_per_user INTEGER DEFAULT 10,
    max_submissions_per_day INTEGER DEFAULT 100,
    maintenance_mode BOOLEAN DEFAULT false,
    maintenance_message TEXT,
    email_notifications BOOLEAN DEFAULT true,
    slack_webhook_url TEXT,
    discord_webhook_url TEXT,
    analytics_enabled BOOLEAN DEFAULT true,
    custom_css TEXT,
    custom_js TEXT,
    seo_title VARCHAR(255),
    seo_description TEXT,
    seo_keywords TEXT,
    social_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create error_logs table for system error tracking
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    request_path VARCHAR(500),
    request_method VARCHAR(10),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    occurrence_count INTEGER DEFAULT 1,
    first_occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_jobs_user_id ON export_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_type ON export_jobs(type);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON export_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_last_occurred_at ON error_logs(last_occurred_at DESC);

-- Create updated_at trigger for platform_settings
CREATE OR REPLACE FUNCTION update_platform_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_platform_settings_updated_at
    BEFORE UPDATE ON platform_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_platform_settings_updated_at();

-- Row Level Security (RLS) policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs policies
CREATE POLICY "Admins can read all audit logs" ON audit_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'moderator')
        )
    );

CREATE POLICY "System can insert audit logs" ON audit_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Export jobs policies
CREATE POLICY "Users can manage their own export jobs" ON export_jobs
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all export jobs" ON export_jobs
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Platform settings policies
CREATE POLICY "Everyone can read platform settings" ON platform_settings
    FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "Admins can manage platform settings" ON platform_settings
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Error logs policies
CREATE POLICY "Admins can read error logs" ON error_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'moderator')
        )
    );

CREATE POLICY "System can manage error logs" ON error_logs
    FOR ALL
    TO service_role
    USING (true);

-- Create database functions for dashboard analytics

-- Function to get submission statistics
CREATE OR REPLACE FUNCTION get_submission_stats(date_filter TIMESTAMP WITH TIME ZONE DEFAULT NULL)
RETURNS TABLE (
    total_submissions BIGINT,
    pending_submissions BIGINT,
    approved_submissions BIGINT,
    rejected_submissions BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_submissions,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_submissions,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_submissions
    FROM submissions
    WHERE (date_filter IS NULL OR created_at >= date_filter);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user statistics
CREATE OR REPLACE FUNCTION get_user_stats(date_filter TIMESTAMP WITH TIME ZONE DEFAULT NULL)
RETURNS TABLE (
    total_users BIGINT,
    new_users_this_period BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM auth.users) as total_users,
        COUNT(*) as new_users_this_period
    FROM auth.users
    WHERE (date_filter IS NULL OR created_at >= date_filter);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get revenue statistics
CREATE OR REPLACE FUNCTION get_revenue_stats(date_filter TIMESTAMP WITH TIME ZONE DEFAULT NULL)
RETURNS TABLE (
    total_revenue DECIMAL(10,2),
    revenue_this_period DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COALESCE(SUM(amount) FILTER (WHERE date_filter IS NULL OR created_at >= date_filter), 0) as revenue_this_period
    FROM payments
    WHERE status = 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get federation statistics
CREATE OR REPLACE FUNCTION get_federation_stats(date_filter TIMESTAMP WITH TIME ZONE DEFAULT NULL)
RETURNS TABLE (
    total_instances BIGINT,
    active_instances BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_instances,
        COUNT(*) FILTER (WHERE status = 'active') as active_instances
    FROM federation_instances
    WHERE (date_filter IS NULL OR created_at >= date_filter);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get submission trends
CREATE OR REPLACE FUNCTION get_submission_trends(date_filter TIMESTAMP WITH TIME ZONE DEFAULT NULL)
RETURNS TABLE (
    date DATE,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
    FROM submissions
    WHERE (date_filter IS NULL OR created_at >= date_filter)
    GROUP BY DATE(created_at)
    ORDER BY date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get revenue trends
CREATE OR REPLACE FUNCTION get_revenue_trends(date_filter TIMESTAMP WITH TIME ZONE DEFAULT NULL)
RETURNS TABLE (
    date DATE,
    amount DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(amount), 0) as amount
    FROM payments
    WHERE status = 'completed'
    AND (date_filter IS NULL OR created_at >= date_filter)
    GROUP BY DATE(created_at)
    ORDER BY date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get total revenue
CREATE OR REPLACE FUNCTION get_total_revenue()
RETURNS TABLE (total DECIMAL(10,2)) AS $$
BEGIN
    RETURN QUERY
    SELECT COALESCE(SUM(amount), 0) as total
    FROM payments
    WHERE status = 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get revenue by period
CREATE OR REPLACE FUNCTION get_revenue_by_period(start_date TIMESTAMP WITH TIME ZONE, end_date TIMESTAMP WITH TIME ZONE)
RETURNS TABLE (total DECIMAL(10,2)) AS $$
BEGIN
    RETURN QUERY
    SELECT COALESCE(SUM(amount), 0) as total
    FROM payments
    WHERE status = 'completed'
    AND created_at >= start_date
    AND created_at <= end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get revenue by submission type
CREATE OR REPLACE FUNCTION get_revenue_by_submission_type()
RETURNS TABLE (
    basic DECIMAL(10,2),
    premium DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(amount) FILTER (WHERE amount <= 10), 0) as basic,
        COALESCE(SUM(amount) FILTER (WHERE amount > 10), 0) as premium
    FROM payments
    WHERE status = 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get federation revenue
CREATE OR REPLACE FUNCTION get_federation_revenue()
RETURNS TABLE (total DECIMAL(10,2)) AS $$
BEGIN
    RETURN QUERY
    SELECT COALESCE(SUM(p.amount), 0) as total
    FROM payments p
    JOIN federated_submissions fs ON p.submission_id = fs.submission_id
    WHERE p.status = 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get average approval time
CREATE OR REPLACE FUNCTION get_average_approval_time(filters JSONB DEFAULT '{}'::jsonb)
RETURNS TABLE (average_hours DECIMAL(10,2)) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(
            AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600), 
            0
        )::DECIMAL(10,2) as average_hours
    FROM submissions
    WHERE status = 'approved'
    AND updated_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get system health metrics
CREATE OR REPLACE FUNCTION get_system_health_metrics()
RETURNS TABLE (
    uptime VARCHAR(10),
    error_rate VARCHAR(10)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        '99.9%' as uptime,  -- Simplified - would need actual monitoring
        '0.1%' as error_rate -- Simplified - would calculate from error_logs
    ;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_submission_stats(TIMESTAMP WITH TIME ZONE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_stats(TIMESTAMP WITH TIME ZONE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_revenue_stats(TIMESTAMP WITH TIME ZONE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_federation_stats(TIMESTAMP WITH TIME ZONE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_submission_trends(TIMESTAMP WITH TIME ZONE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_revenue_trends(TIMESTAMP WITH TIME ZONE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_total_revenue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_revenue_by_period(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_revenue_by_submission_type() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_federation_revenue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_average_approval_time(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_system_health_metrics() TO authenticated, service_role;

-- Insert default platform settings
INSERT INTO platform_settings (
    platform_name,
    platform_description,
    submission_fee,
    premium_submission_fee,
    auto_approval,
    federation_enabled,
    max_submissions_per_user,
    max_submissions_per_day,
    email_notifications,
    analytics_enabled,
    seo_title,
    seo_description
) VALUES (
    'LaunchPadder',
    'The federated launch platform for discovering and sharing amazing products',
    5.00,
    15.00,
    false,
    true,
    10,
    100,
    true,
    true,
    'LaunchPadder - Discover Amazing Products',
    'A federated platform for launching and discovering innovative products across multiple directories'
) ON CONFLICT DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE audit_logs IS 'Tracks administrative actions and system events for auditing purposes';
COMMENT ON TABLE export_jobs IS 'Manages data export jobs for dashboard analytics';
COMMENT ON TABLE platform_settings IS 'Configurable platform settings and preferences';
COMMENT ON TABLE error_logs IS 'System error tracking and monitoring';

COMMENT ON FUNCTION get_submission_stats(TIMESTAMP WITH TIME ZONE) IS 'Returns submission statistics for dashboard overview';
COMMENT ON FUNCTION get_user_stats(TIMESTAMP WITH TIME ZONE) IS 'Returns user statistics for dashboard overview';
COMMENT ON FUNCTION get_revenue_stats(TIMESTAMP WITH TIME ZONE) IS 'Returns revenue statistics for dashboard overview';
COMMENT ON FUNCTION get_federation_stats(TIMESTAMP WITH TIME ZONE) IS 'Returns federation statistics for dashboard overview';