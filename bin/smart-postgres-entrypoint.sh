#!/bin/bash

# Smart PostgreSQL detection and configuration
set -e

# Load environment variables
if [ -f /.env ]; then
    source /.env
fi

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"

# Function to check if external PostgreSQL is available
check_external_postgres() {
    echo "Checking for external PostgreSQL at $POSTGRES_HOST:$POSTGRES_PORT..."
    
    # Use netcat to check if port is open (from host perspective)
    if timeout 5 bash -c "</dev/tcp/$POSTGRES_HOST/$POSTGRES_PORT" 2>/dev/null; then
        echo "Port $POSTGRES_PORT is open on $POSTGRES_HOST"
        
        # Test database connection
        if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" >/dev/null 2>&1; then
            echo "✅ External PostgreSQL is available and accessible"
            return 0
        else
            echo "❌ External PostgreSQL is running but connection failed with current credentials"
            return 1
        fi
    else
        echo "Port $POSTGRES_PORT is not accessible on $POSTGRES_HOST"
        return 1
    fi
}

# Check if we should use external PostgreSQL
if [ "$POSTGRES_HOST" = "host.docker.internal" ] && check_external_postgres; then
    echo "Using external PostgreSQL on localhost:$POSTGRES_PORT"
    echo "This container will act as a healthy proxy"
    
    # Create a simple health check loop
    while true; do
        if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" >/dev/null 2>&1; then
            sleep 30
        else
            echo "Lost connection to external PostgreSQL"
            exit 1
        fi
    done
else
    echo "Starting internal PostgreSQL container"
    # Run the original PostgreSQL entrypoint with proper configuration
    exec docker-entrypoint.sh postgres -c "config_file=/etc/postgresql/postgresql.conf" -c "log_min_messages=fatal" -c "listen_addresses=*"
fi