-- Pooler support for Supavisor
-- This file contains SQL commands to set up connection pooling support

-- Create pooler schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS _pooler;

-- Grant necessary permissions for pooler operations
GRANT USAGE ON SCHEMA _pooler TO supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA _pooler TO supabase_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA _pooler TO supabase_admin;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA _pooler TO supabase_admin;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA _pooler GRANT ALL ON TABLES TO supabase_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA _pooler GRANT ALL ON SEQUENCES TO supabase_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA _pooler GRANT ALL ON FUNCTIONS TO supabase_admin;