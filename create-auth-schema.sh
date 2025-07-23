#!/bin/bash
echo "🔧 Creating auth schema in _supabase database..."

sudo docker exec supabase-db psql -U postgres -d "_supabase" <<-'EOSQL'
    -- Create auth schema
    CREATE SCHEMA IF NOT EXISTS "auth";
    
    -- Create other necessary schemas
    CREATE SCHEMA IF NOT EXISTS "storage";
    CREATE SCHEMA IF NOT EXISTS "realtime";
    CREATE SCHEMA IF NOT EXISTS "_realtime";
    CREATE SCHEMA IF NOT EXISTS "supabase_functions";
    
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
        
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
            CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'supabase123';
        END IF;
    END
    $$;
    
    -- Grant permissions
    GRANT ALL ON SCHEMA "auth" TO postgres;
    GRANT ALL ON SCHEMA "storage" TO postgres;
    GRANT ALL ON SCHEMA "realtime" TO postgres;
    GRANT ALL ON SCHEMA "_realtime" TO postgres;
    GRANT ALL ON SCHEMA "supabase_functions" TO postgres;
    
    -- Grant roles
    GRANT anon TO postgres;
    GRANT authenticated TO postgres;
    GRANT service_role TO postgres;
    GRANT authenticator TO postgres;
    
    GRANT anon TO authenticator;
    GRANT authenticated TO authenticator;
    GRANT service_role TO authenticator;
EOSQL

echo "✅ Auth schema created! Now restarting auth service..."
sudo docker-compose restart auth

echo "🔍 Checking auth service logs..."
sleep 5
sudo docker-compose logs auth --tail 10