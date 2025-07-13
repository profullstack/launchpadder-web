-- LaunchPadder Database Initialization Script
-- This script sets up the initial database structure for self-hosted deployments

-- Create the auth schema for Supabase Auth
CREATE SCHEMA IF NOT EXISTS auth;

-- Create the storage schema for Supabase Storage
CREATE SCHEMA IF NOT EXISTS storage;

-- Create the realtime schema for Supabase Realtime
CREATE SCHEMA IF NOT EXISTS _realtime;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA _realtime TO postgres, anon, authenticated, service_role;

-- Create roles if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
END
$$;

-- Grant permissions to roles
GRANT anon TO postgres;
GRANT authenticated TO postgres;
GRANT service_role TO postgres;

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA auth TO postgres, service_role;
GRANT ALL ON SCHEMA storage TO postgres, service_role;
GRANT ALL ON SCHEMA _realtime TO postgres, service_role;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt";

-- Set up Row Level Security
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- Create a function to handle updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a function to generate random IDs
CREATE OR REPLACE FUNCTION public.generate_id(size INT DEFAULT 21)
RETURNS TEXT AS $$
DECLARE
    alphabet TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    id TEXT := '';
    i INT;
BEGIN
    FOR i IN 1..size LOOP
        id := id || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    END LOOP;
    RETURN id;
END;
$$ LANGUAGE plpgsql;

-- Set up basic auth schema tables (simplified version)
-- Note: The full auth schema will be created by GoTrue on startup

-- Create users table in auth schema if it doesn't exist
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    encrypted_password VARCHAR(255),
    email_confirmed_at TIMESTAMP WITH TIME ZONE,
    invited_at TIMESTAMP WITH TIME ZONE,
    confirmation_token VARCHAR(255),
    confirmation_sent_at TIMESTAMP WITH TIME ZONE,
    recovery_token VARCHAR(255),
    recovery_sent_at TIMESTAMP WITH TIME ZONE,
    email_change_token_new VARCHAR(255),
    email_change VARCHAR(255),
    email_change_sent_at TIMESTAMP WITH TIME ZONE,
    last_sign_in_at TIMESTAMP WITH TIME ZONE,
    raw_app_meta_data JSONB,
    raw_user_meta_data JSONB,
    is_super_admin BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    phone VARCHAR(15),
    phone_confirmed_at TIMESTAMP WITH TIME ZONE,
    phone_change VARCHAR(15),
    phone_change_token VARCHAR(255),
    phone_change_sent_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current VARCHAR(255),
    email_change_confirm_status SMALLINT,
    banned_until TIMESTAMP WITH TIME ZONE,
    reauthentication_token VARCHAR(255),
    reauthentication_sent_at TIMESTAMP WITH TIME ZONE,
    is_sso_user BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for auth.users
CREATE INDEX IF NOT EXISTS users_email_idx ON auth.users (email);
CREATE INDEX IF NOT EXISTS users_phone_idx ON auth.users (phone);

-- Grant permissions on auth.users
GRANT ALL ON auth.users TO service_role;
GRANT SELECT ON auth.users TO authenticated;

-- Create a view for public user data
CREATE OR REPLACE VIEW public.users AS
SELECT 
    id,
    email,
    created_at,
    updated_at,
    raw_user_meta_data
FROM auth.users;

-- Grant permissions on the view
GRANT SELECT ON public.users TO anon, authenticated;

-- Enable RLS on the view
ALTER VIEW public.users SET (security_invoker = true);

-- Create basic storage schema tables
CREATE TABLE IF NOT EXISTS storage.buckets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    public BOOLEAN DEFAULT FALSE,
    avif_autodetection BOOLEAN DEFAULT FALSE,
    file_size_limit BIGINT,
    allowed_mime_types TEXT[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id TEXT REFERENCES storage.buckets(id),
    name TEXT NOT NULL,
    owner UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    path_tokens TEXT[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
    version TEXT,
    owner_id TEXT
);

-- Create indexes for storage
CREATE INDEX IF NOT EXISTS objects_bucket_id_idx ON storage.objects (bucket_id);
CREATE INDEX IF NOT EXISTS objects_name_idx ON storage.objects (name);
CREATE INDEX IF NOT EXISTS objects_owner_idx ON storage.objects (owner);

-- Grant permissions on storage tables
GRANT ALL ON storage.buckets TO service_role;
GRANT ALL ON storage.objects TO service_role;

-- Create default storage bucket for uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Set up realtime schema
CREATE TABLE IF NOT EXISTS _realtime.subscription (
    id BIGSERIAL PRIMARY KEY,
    subscription_id UUID NOT NULL,
    entity REGCLASS NOT NULL,
    filters REALTIME.USER_DEFINED_FILTER[] NOT NULL DEFAULT '{}',
    claims JSONB NOT NULL,
    claims_role REGROLE NOT NULL GENERATED ALWAYS AS (REALTIME.TO_REGROLE(claims)) STORED,
    created_at TIMESTAMP DEFAULT timezone('utc', now()) NOT NULL
);

-- Create unique index for realtime subscriptions
CREATE UNIQUE INDEX IF NOT EXISTS subscription_subscription_id_entity_filters_idx 
ON _realtime.subscription (subscription_id, entity, filters);

-- Grant permissions on realtime tables
GRANT ALL ON _realtime.subscription TO service_role;

-- Create a notification for database initialization completion
DO $$
BEGIN
    RAISE NOTICE 'LaunchPadder database initialization completed successfully!';
    RAISE NOTICE 'Database: %', current_database();
    RAISE NOTICE 'Schemas created: public, auth, storage, _realtime';
    RAISE NOTICE 'Extensions enabled: uuid-ossp, pgcrypto, pgjwt';
    RAISE NOTICE 'Ready for LaunchPadder application startup.';
END
$$;