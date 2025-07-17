-- Minimal database initialization script for Supabase
-- This script sets up basic roles and schemas needed for Supabase to function

-- Basic Supabase setup (postgres user is created by Docker automatically)

-- Enable basic extensions that are available in standard PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create basic schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS _analytics;
CREATE SCHEMA IF NOT EXISTS _realtime;
CREATE SCHEMA IF NOT EXISTS supabase_functions;

-- Note: _supabase database will be created separately if needed

-- Create essential Supabase roles
DO $$
BEGIN
    -- Create basic roles if they don't exist
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
        RAISE NOTICE 'Created anon role';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
        RAISE NOTICE 'Created authenticated role';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
        RAISE NOTICE 'Created service_role';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'supabase123';
        RAISE NOTICE 'Created authenticator role';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
        CREATE ROLE supabase_admin NOINHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS;
        RAISE NOTICE 'Created supabase_admin role';
    END IF;
END
$$;

-- Grant basic roles to postgres
GRANT anon TO postgres;
GRANT authenticated TO postgres;
GRANT service_role TO postgres;
GRANT supabase_admin TO postgres;
GRANT authenticator TO postgres;

-- Grant roles to authenticator
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;

-- Grant basic schema permissions
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA realtime TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- Create a simple status table
CREATE TABLE IF NOT EXISTS public.supabase_init_status (
    id serial PRIMARY KEY,
    component text NOT NULL UNIQUE,
    initialized_at timestamp with time zone DEFAULT now(),
    version text
);

-- Mark database as initialized
INSERT INTO public.supabase_init_status (component, version) 
VALUES ('database', '1.0.0') 
ON CONFLICT (component) DO UPDATE SET 
    initialized_at = now(),
    version = EXCLUDED.version;

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'Basic Supabase database initialization completed successfully';
END
$$;