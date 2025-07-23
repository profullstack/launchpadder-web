#!/bin/bash
set -e

echo "Starting robust Supabase database initialization..."

# Function to safely create extensions
create_extension_safe() {
    local ext_name="$1"
    echo "Creating extension: $ext_name"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = '$ext_name') THEN
                CREATE EXTENSION "$ext_name";
                RAISE NOTICE 'Extension $ext_name created successfully';
            ELSE
                RAISE NOTICE 'Extension $ext_name already exists';
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'Failed to create extension $ext_name: %', SQLERRM;
        END
        \$\$;
EOSQL
}

# Create supabase_admin role FIRST to prevent any reference errors
echo "Creating supabase_admin role..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create supabase_admin role immediately
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
            CREATE ROLE supabase_admin NOINHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS LOGIN PASSWORD '${POSTGRES_PASSWORD}';
            RAISE NOTICE 'Created supabase_admin role with password';
        ELSE
            RAISE NOTICE 'supabase_admin role already exists';
        END IF;
    END
    \$\$;
EOSQL

# Create basic extensions using direct SQL (bypassing problematic extension scripts)
echo "Creating extensions directly..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create uuid-ossp extension directly
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
            -- Try to create the extension directly without custom scripts
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
            RAISE NOTICE 'Extension uuid-ossp created successfully';
        ELSE
            RAISE NOTICE 'Extension uuid-ossp already exists';
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Could not create uuid-ossp extension: %, continuing...', SQLERRM;
    END
    \$\$;

    -- Create pgcrypto extension directly
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
            -- Try to create the extension directly without custom scripts
            CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public;
            RAISE NOTICE 'Extension pgcrypto created successfully';
        ELSE
            RAISE NOTICE 'Extension pgcrypto already exists';
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Could not create pgcrypto extension: %, continuing...', SQLERRM;
    END
    \$\$;
EOSQL

# Continue with the rest of the initialization
echo "Creating schemas and remaining roles..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create basic schemas
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE SCHEMA IF NOT EXISTS realtime;
    CREATE SCHEMA IF NOT EXISTS _analytics;
    CREATE SCHEMA IF NOT EXISTS _realtime;
    CREATE SCHEMA IF NOT EXISTS _supavisor;
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
echo "Creating _supabase database..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE \"_supabase\";" 2>/dev/null || echo "_supabase database already exists"

# Set up _supabase database with proper schemas and permissions
echo "Setting up _supabase database schemas..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "_supabase" <<-EOSQL
    -- Create extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    
    -- Create necessary schemas in _supabase database
    CREATE SCHEMA IF NOT EXISTS "_supavisor";
    CREATE SCHEMA IF NOT EXISTS "_analytics";
    CREATE SCHEMA IF NOT EXISTS "public";
    CREATE SCHEMA IF NOT EXISTS "auth";
    CREATE SCHEMA IF NOT EXISTS "storage";
    CREATE SCHEMA IF NOT EXISTS "realtime";
    CREATE SCHEMA IF NOT EXISTS "_realtime";
    CREATE SCHEMA IF NOT EXISTS "supabase_functions";
    
    -- Create roles if they don't exist
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
            CREATE ROLE supabase_admin NOINHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS;
        END IF;
        
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
    END
    \$\$;
    
    -- Grant permissions to necessary roles
    GRANT ALL ON SCHEMA "_supavisor" TO postgres, supabase_admin;
    GRANT ALL ON SCHEMA "_analytics" TO postgres, supabase_admin;
    GRANT ALL ON SCHEMA "public" TO postgres, supabase_admin, anon, authenticated, service_role;
    GRANT ALL ON SCHEMA "auth" TO postgres, supabase_admin;
    GRANT ALL ON SCHEMA "storage" TO postgres, supabase_admin;
    GRANT ALL ON SCHEMA "realtime" TO postgres, supabase_admin;
    GRANT ALL ON SCHEMA "_realtime" TO postgres, supabase_admin;
    GRANT ALL ON SCHEMA "supabase_functions" TO postgres, supabase_admin;
    
    -- Grant roles
    GRANT anon TO postgres;
    GRANT authenticated TO postgres;
    GRANT service_role TO postgres;
    GRANT supabase_admin TO postgres;
    GRANT authenticator TO postgres;
    
    GRANT anon TO authenticator;
    GRANT authenticated TO authenticator;
    GRANT service_role TO authenticator;
EOSQL

echo "✅ Supabase database initialization completed successfully!"