#!/bin/bash
echo "🔄 Restarting database services to apply initialization fixes..."

# Stop services that depend on the database
echo "Stopping dependent services..."
sudo docker-compose stop supavisor

# Restart the database to run the updated initialization script
echo "Restarting database service..."
sudo docker-compose restart db

# Wait for database to be ready
echo "Waiting for database to be ready..."
sleep 10

# Check if _supabase database was created
echo "Checking if _supabase database exists..."
sudo docker-compose exec db psql -U postgres -c "SELECT datname FROM pg_database WHERE datname = '_supabase';"

# Check if _supavisor schema exists
echo "Checking if _supavisor schema exists..."
sudo docker-compose exec db psql -U postgres -d "_supabase" -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name = '_supavisor';"

# Restart supavisor service
echo "Restarting supavisor service..."
sudo docker-compose start supavisor

echo "✅ Database services restarted. Check logs with: sudo docker-compose logs supavisor"