-- Master database initialization script for Supabase
-- This script sets up the complete Supabase database with all required schemas, roles, and extensions

-- Enable required extensions first
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_jsonschema";
CREATE EXTENSION IF NOT EXISTS "wrappers";
CREATE EXTENSION IF NOT EXISTS "vault";

-- Create schemas first
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS _analytics;
CREATE SCHEMA IF NOT EXISTS _realtime;
CREATE SCHEMA IF NOT EXISTS supabase_functions;
CREATE SCHEMA IF NOT EXISTS graphql;
CREATE SCHEMA IF NOT EXISTS graphql_public;
CREATE SCHEMA IF NOT EXISTS pgsodium;
CREATE SCHEMA IF NOT EXISTS pgsodium_masks;
CREATE SCHEMA IF NOT EXISTS vault;

-- Create Supabase roles and permissions
DO $$
BEGIN
    -- Create roles if they don't exist
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
        CREATE ROLE supabase_admin NOLOGIN NOINHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS;
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_auth_admin') THEN
        CREATE ROLE supabase_auth_admin NOINHERIT CREATEROLE LOGIN PASSWORD 'your-super-secret-and-long-postgres-password';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_storage_admin') THEN
        CREATE ROLE supabase_storage_admin NOINHERIT CREATEROLE LOGIN PASSWORD 'your-super-secret-and-long-postgres-password';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_realtime_admin') THEN
        CREATE ROLE supabase_realtime_admin NOINHERIT CREATEROLE LOGIN PASSWORD 'your-super-secret-and-long-postgres-password';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'your-super-secret-and-long-postgres-password';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'dashboard_user') THEN
        CREATE ROLE dashboard_user NOINHERIT LOGIN PASSWORD 'your-super-secret-and-long-postgres-password';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_functions_admin') THEN
        CREATE ROLE supabase_functions_admin NOINHERIT CREATEROLE LOGIN PASSWORD 'your-super-secret-and-long-postgres-password';
    END IF;
END
$$;

-- Grant roles to postgres
GRANT anon TO postgres;
GRANT authenticated TO postgres;
GRANT service_role TO postgres;
GRANT supabase_admin TO postgres;
GRANT supabase_auth_admin TO postgres;
GRANT supabase_storage_admin TO postgres;
GRANT supabase_realtime_admin TO postgres;
GRANT authenticator TO postgres;
GRANT dashboard_user TO postgres;
GRANT supabase_functions_admin TO postgres;

-- Grant roles to authenticator
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;

-- Grant schema permissions
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;

GRANT USAGE ON SCHEMA realtime TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA realtime TO supabase_realtime_admin;

GRANT ALL ON SCHEMA _analytics TO supabase_admin;
GRANT ALL ON SCHEMA _realtime TO supabase_realtime_admin;
GRANT ALL ON SCHEMA supabase_functions TO supabase_functions_admin;

-- Grant schema permissions for public
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- JWT helper functions for Supabase
CREATE OR REPLACE FUNCTION auth.jwt() 
RETURNS jsonb 
LANGUAGE sql STABLE
AS $$
  SELECT 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.role() 
RETURNS text 
LANGUAGE sql STABLE
AS $$
  SELECT 
    coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (auth.jwt() ->> 'role')
    )
$$;

CREATE OR REPLACE FUNCTION auth.uid() 
RETURNS uuid 
LANGUAGE sql STABLE
AS $$
  SELECT 
    coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (auth.jwt() ->> 'sub')
    )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.email() 
RETURNS text 
LANGUAGE sql STABLE
AS $$
  SELECT 
    coalesce(
        nullif(current_setting('request.jwt.claim.email', true), ''),
        (auth.jwt() ->> 'email')
    )
$$;

-- Grant execute permissions on JWT functions
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.email() TO anon, authenticated, service_role;

-- Create basic auth tables if they don't exist
CREATE TABLE IF NOT EXISTS auth.users (
    instance_id uuid,
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    aud character varying(255),
    role character varying(255),
    email character varying(255) UNIQUE,
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text UNIQUE,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::text,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean NOT NULL DEFAULT false,
    deleted_at timestamp with time zone
);

-- Create storage tables if they don't exist
CREATE TABLE IF NOT EXISTS storage.buckets (
    id text NOT NULL PRIMARY KEY,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text
);

CREATE TABLE IF NOT EXISTS storage.objects (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    last_accessed_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text
);

-- Create realtime schema tables
CREATE TABLE IF NOT EXISTS realtime.subscription (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] NOT NULL DEFAULT '{}'::realtime.user_defined_filter[],
    claims jsonb NOT NULL,
    claims_role regrole NOT NULL GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED,
    created_at timestamp without time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create a table to track initialization status
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
    RAISE NOTICE 'Supabase database initialization completed successfully';
END
$$;