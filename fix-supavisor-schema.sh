#!/bin/bash
echo "🔧 Creating _supavisor schema in _supabase database..."

# Create the _supavisor schema in the _supabase database
sudo docker exec -it supabase-db psql -U postgres -d "_supabase" -c "CREATE SCHEMA IF NOT EXISTS \"_supavisor\";"

# Grant permissions to postgres user
sudo docker exec -it supabase-db psql -U postgres -d "_supabase" -c "GRANT ALL ON SCHEMA \"_supavisor\" TO postgres;"

echo "✅ Schema created! Now restarting supavisor..."
sudo docker restart supabase-pooler

echo "🔍 Checking supavisor status..."
sleep 5
sudo docker logs supabase-pooler --tail 20