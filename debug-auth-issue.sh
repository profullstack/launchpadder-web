#!/bin/bash
echo "🔍 Debugging auth schema issue..."

echo "1. Checking if auth schema exists in _supabase database:"
sudo docker exec supabase-db psql -U postgres -d "_supabase" -c "\dn" | grep auth

echo "2. Checking auth service environment (DATABASE_URL):"
sudo docker exec supabase-auth env | grep DATABASE_URL

echo "3. Checking what database the auth service is actually connecting to:"
sudo docker exec supabase-auth env | grep GOTRUE_DB_DATABASE_URL

echo "4. Listing all schemas in _supabase database:"
sudo docker exec supabase-db psql -U postgres -d "_supabase" -c "\dn"

echo "5. Checking if we can connect to the database the auth service is using:"
DATABASE_URL=$(sudo docker exec supabase-auth env | grep GOTRUE_DB_DATABASE_URL | cut -d'=' -f2)
echo "Auth service is connecting to: $DATABASE_URL"