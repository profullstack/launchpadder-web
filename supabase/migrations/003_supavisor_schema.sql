-- Create the _supavisor schema for Supabase pooler
CREATE SCHEMA IF NOT EXISTS _supavisor;

-- Grant necessary permissions to the supavisor user
DO $$
BEGIN
    -- Create supavisor user if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supavisor') THEN
        CREATE USER supavisor WITH PASSWORD 'supavisor';
    END IF;
END
$$;

-- Grant permissions to supavisor user
GRANT USAGE ON SCHEMA _supavisor TO supavisor;
GRANT CREATE ON SCHEMA _supavisor TO supavisor;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA _supavisor TO supavisor;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA _supavisor TO supavisor;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA _supavisor TO supavisor;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA _supavisor GRANT ALL ON TABLES TO supavisor;
ALTER DEFAULT PRIVILEGES IN SCHEMA _supavisor GRANT ALL ON SEQUENCES TO supavisor;
ALTER DEFAULT PRIVILEGES IN SCHEMA _supavisor GRANT ALL ON FUNCTIONS TO supavisor;

-- Also grant permissions to postgres user (superuser)
GRANT ALL PRIVILEGES ON SCHEMA _supavisor TO postgres;

-- Create the schema_migrations table that Ecto expects
CREATE TABLE IF NOT EXISTS _supavisor.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);

-- Create unique index on version
CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_version_index ON _supavisor.schema_migrations (version);

-- Grant permissions on the schema_migrations table
GRANT ALL PRIVILEGES ON TABLE _supavisor.schema_migrations TO supavisor;
GRANT ALL PRIVILEGES ON TABLE _supavisor.schema_migrations TO postgres;