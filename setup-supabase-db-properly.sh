#!/bin/bash
echo "🔧 Setting up _supabase database properly according to standard Supabase architecture..."

# First, run the setup in the _supabase database
sudo docker exec supabase-db psql -U postgres -d "_supabase" <<-'EOSQL'
    -- Create extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    
    -- Create necessary schemas in _supabase database
    CREATE SCHEMA IF NOT EXISTS "_supavisor";
    CREATE SCHEMA IF NOT EXISTS "_analytics";
    CREATE SCHEMA IF NOT EXISTS "public";
    
    -- Create roles if they don't exist
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
            CREATE ROLE supabase_admin NOINHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS;
        END IF;
    END
    $$;
    
    -- Grant permissions to necessary roles
    GRANT ALL ON SCHEMA "_supavisor" TO postgres;
    GRANT ALL ON SCHEMA "_analytics" TO postgres;
    GRANT ALL ON SCHEMA "public" TO postgres;
    
    GRANT ALL ON SCHEMA "_supavisor" TO supabase_admin;
    GRANT ALL ON SCHEMA "_analytics" TO supabase_admin;
    GRANT ALL ON SCHEMA "public" TO supabase_admin;
EOSQL

echo "✅ _supabase database properly configured!"
echo "Now restarting supavisor with correct database connection..."

# Restart supavisor
sudo docker restart supabase-pooler

echo "🔍 Checking supavisor status..."
sleep 5
sudo docker logs supabase-pooler --tail 10