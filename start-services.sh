#!/bin/bash

set -e

# Load environment variables
if [ -f .env ]; then
    source .env
fi

echo "Checking PostgreSQL status..."

# Check if PostgreSQL is already running on port 5432
if ss -tlnp | grep -q ":5432"; then
    echo "PostgreSQL is already running on port 5432"
    
    # Test connection
    echo "Testing connection to existing PostgreSQL..."
    if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -c "SELECT version();" >/dev/null 2>&1; then
        echo "✅ Successfully connected to existing PostgreSQL"
        echo "Starting Supabase services without PostgreSQL container..."
        
        # Start services excluding db and supavisor
        sudo docker-compose up --scale db=0 --scale supavisor=0 -d
        
        echo "✅ Supabase services started successfully with external PostgreSQL"
    else
        echo "❌ Failed to connect to PostgreSQL with current credentials"
        echo "Please check your database credentials in .env file"
        echo "Current settings:"
        echo "  POSTGRES_HOST: ${POSTGRES_HOST:-localhost}"
        echo "  POSTGRES_PORT: ${POSTGRES_PORT:-5432}"
        echo "  POSTGRES_USER: ${POSTGRES_USER:-postgres}"
        echo "  POSTGRES_DB: ${POSTGRES_DB:-postgres}"
        exit 1
    fi
else
    echo "No PostgreSQL found on port 5432"
    echo "Starting all services including PostgreSQL container..."
    sudo docker-compose up -d
    echo "✅ All services started successfully"
fi

echo ""
echo "Service URLs:"
echo "🌐 Supabase Studio: http://localhost:${STUDIO_PORT:-3001}"
echo "🔗 API Gateway: http://localhost:${KONG_HTTP_PORT:-8000}"
echo "📊 Database: ${POSTGRES_HOST:-localhost}:${POSTGRES_PORT:-5432}"