#!/bin/bash

# Check if PostgreSQL is already running on port 5432
check_postgres_running() {
    if ss -tlnp | grep -q ":5432"; then
        echo "PostgreSQL is already running on port 5432"
        return 0
    else
        echo "PostgreSQL is not running on port 5432"
        return 1
    fi
}

# Test connection to existing PostgreSQL
test_postgres_connection() {
    local host="${POSTGRES_HOST:-localhost}"
    local port="${POSTGRES_PORT:-5432}"
    local user="${POSTGRES_USER:-postgres}"
    local password="${POSTGRES_PASSWORD}"
    local database="${POSTGRES_DB:-postgres}"
    
    echo "Testing connection to PostgreSQL..."
    echo "Host: $host, Port: $port, User: $user, Database: $database"
    
    if PGPASSWORD="$password" psql -h "$host" -p "$port" -U "$user" -d "$database" -c "SELECT version();" >/dev/null 2>&1; then
        echo "Successfully connected to existing PostgreSQL"
        return 0
    else
        echo "Failed to connect to PostgreSQL"
        return 1
    fi
}

# Main logic
if check_postgres_running; then
    if test_postgres_connection; then
        echo "Using existing PostgreSQL instance"
        export USE_EXTERNAL_POSTGRES=true
    else
        echo "PostgreSQL is running but connection failed"
        echo "Please check your database credentials in .env file"
        exit 1
    fi
else
    echo "No PostgreSQL found, will use Docker container"
    export USE_EXTERNAL_POSTGRES=false
fi

echo "USE_EXTERNAL_POSTGRES=$USE_EXTERNAL_POSTGRES"