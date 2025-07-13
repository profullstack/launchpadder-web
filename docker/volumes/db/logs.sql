-- Logs schema for Supabase Analytics
CREATE SCHEMA IF NOT EXISTS _analytics;
GRANT ALL ON SCHEMA _analytics TO supabase_admin;

-- Create logs table for analytics
CREATE TABLE IF NOT EXISTS _analytics.logs (
  id BIGSERIAL PRIMARY KEY,
  instance_id UUID,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  level TEXT,
  event_message TEXT,
  metadata JSONB,
  path TEXT,
  search TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS logs_timestamp_idx ON _analytics.logs (timestamp);
CREATE INDEX IF NOT EXISTS logs_level_idx ON _analytics.logs (level);
CREATE INDEX IF NOT EXISTS logs_path_idx ON _analytics.logs (path);
CREATE INDEX IF NOT EXISTS logs_search_idx ON _analytics.logs USING gin(search gin_trgm_ops);

-- Grant permissions
GRANT ALL ON _analytics.logs TO supabase_admin;
GRANT SELECT ON _analytics.logs TO authenticated;

-- Create function to add logs
CREATE OR REPLACE FUNCTION _analytics.add_log(
  p_level TEXT,
  p_event_message TEXT,
  p_metadata JSONB DEFAULT NULL,
  p_path TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  log_id BIGINT;
BEGIN
  INSERT INTO _analytics.logs (level, event_message, metadata, path, search)
  VALUES (p_level, p_event_message, p_metadata, p_path, p_event_message || ' ' || COALESCE(p_path, ''))
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION _analytics.add_log TO authenticated, service_role;

-- Create function to clean old logs
CREATE OR REPLACE FUNCTION _analytics.clean_old_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM _analytics.logs 
  WHERE timestamp < NOW() - INTERVAL '1 day' * days_to_keep;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION _analytics.clean_old_logs TO service_role;