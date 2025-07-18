#!/bin/bash
set -e

echo "Starting simple Supabase database initialization..."

# Create supabase_admin role FIRST to prevent any reference errors
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create supabase_admin role immediately
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
            CREATE ROLE supabase_admin NOINHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS;
        END IF;
    END
    \$\$;
EOSQL

# Now continue with the rest of the initialization
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create basic extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- Create basic schemas
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE SCHEMA IF NOT EXISTS realtime;
    CREATE SCHEMA IF NOT EXISTS _analytics;
    CREATE SCHEMA IF NOT EXISTS _realtime;
    CREATE SCHEMA IF NOT EXISTS supabase_functions;

    -- Create remaining roles
    DO \$\$
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
        
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
            CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${POSTGRES_PASSWORD}';
        END IF;
        
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_auth_admin') THEN
            CREATE ROLE supabase_auth_admin NOINHERIT CREATEROLE LOGIN PASSWORD '${POSTGRES_PASSWORD}';
        END IF;
        
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_storage_admin') THEN
            CREATE ROLE supabase_storage_admin NOINHERIT CREATEROLE LOGIN PASSWORD '${POSTGRES_PASSWORD}';
        END IF;
        
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_realtime_admin') THEN
            CREATE ROLE supabase_realtime_admin NOINHERIT CREATEROLE LOGIN PASSWORD '${POSTGRES_PASSWORD}';
        END IF;
        
        -- Create launch user if it doesn't exist (for migrations)
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'launch') THEN
            CREATE ROLE launch WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}' SUPERUSER;
        END IF;
    END
    \$\$;

    -- Grant roles
    GRANT anon TO postgres;
    GRANT authenticated TO postgres;
    GRANT service_role TO postgres;
    GRANT supabase_admin TO postgres;
    GRANT supabase_auth_admin TO postgres;
    GRANT supabase_storage_admin TO postgres;
    GRANT supabase_realtime_admin TO postgres;
    GRANT authenticator TO postgres;
    GRANT launch TO postgres;
    
    GRANT anon TO authenticator;
    GRANT authenticated TO authenticator;
    GRANT service_role TO authenticator;

    -- Basic permissions
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, launch;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role, launch;
    GRANT USAGE ON SCHEMA realtime TO anon, authenticated, service_role, launch;
    GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role, launch;
EOSQL

# Create the _supabase database separately (cannot be done inside a transaction)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE "_supabase"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '_supabase')\\gexec
EOSQL

echo "Supabase database initialization completed successfully!"