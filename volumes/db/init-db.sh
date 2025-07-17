#!/bin/bash
set -e

echo "Starting simple Supabase database initialization..."

# Simple, reliable initialization with proper role checking
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

    -- Create roles with proper checks
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
            CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '$POSTGRES_PASSWORD';
        END IF;
        
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
            CREATE ROLE supabase_admin NOINHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS;
        END IF;
    END
    \$\$;

    -- Grant roles
    GRANT anon TO postgres;
    GRANT authenticated TO postgres;
    GRANT service_role TO postgres;
    GRANT supabase_admin TO postgres;
    GRANT authenticator TO postgres;
    
    GRANT anon TO authenticator;
    GRANT authenticated TO authenticator;
    GRANT service_role TO authenticator;

    -- Basic permissions
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA realtime TO anon, authenticated, service_role;
    GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
EOSQL

# Create the _supabase database separately (cannot be done inside a transaction)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE "_supabase"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '_supabase')\\gexec
EOSQL

echo "Supabase database initialization completed successfully!"