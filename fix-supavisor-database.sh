#!/bin/bash
echo "🔧 Creating _supabase database and _supavisor schema..."

# Create the _supabase database
echo "Creating _supabase database..."
sudo docker-compose exec db psql -U postgres -c 'CREATE DATABASE "_supabase";' 2>/dev/null || echo "_supabase database already exists"

# Create the _supavisor schema within the _supabase database
echo "Creating _supavisor schema in _supabase database..."
sudo docker-compose exec db psql -U postgres -d "_supabase" <<-'EOSQL'
    -- Create the _supavisor schema
    CREATE SCHEMA IF NOT EXISTS "_supavisor";
    
    -- Grant permissions to necessary roles
    GRANT USAGE ON SCHEMA "_supavisor" TO postgres;
    GRANT ALL ON SCHEMA "_supavisor" TO postgres;
    
    -- Create basic roles needed for supavisor if they don't exist
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
            CREATE ROLE supabase_admin NOINHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS;
            RAISE NOTICE 'Created supabase_admin role';
        ELSE
            RAISE NOTICE 'supabase_admin role already exists';
        END IF;
    END
    $$;
    
    GRANT USAGE ON SCHEMA "_supavisor" TO supabase_admin;
    GRANT ALL ON SCHEMA "_supavisor" TO supabase_admin;
EOSQL

echo "✅ Database setup completed!"
echo "Now restarting supavisor service..."
sudo docker-compose restart supavisor

echo "🔍 Checking supavisor status..."
sleep 5
sudo docker-compose ps supavisor