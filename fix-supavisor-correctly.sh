#!/bin/bash
echo "🔧 Creating _supavisor schema in postgres database..."

# Create the _supavisor schema in the postgres database (where schema_migrations already exists)
sudo docker exec supabase-db psql -U postgres -d postgres -c "CREATE SCHEMA IF NOT EXISTS \"_supavisor\";"

# Grant permissions to postgres user
sudo docker exec supabase-db psql -U postgres -d postgres -c "GRANT ALL ON SCHEMA \"_supavisor\" TO postgres;"

echo "✅ Schema created in postgres database! Now restarting supavisor..."
sudo docker restart supabase-pooler

echo "🔍 Checking supavisor status..."
sleep 5
sudo docker logs supabase-pooler --tail 10