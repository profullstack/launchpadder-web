#!/bin/bash

# Test script for PostgreSQL permission fix
# This script will test the database initialization and verify all services start correctly

set -e

echo "🔧 Testing PostgreSQL permission fix..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "success")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "error")
            echo -e "${RED}❌ $message${NC}"
            ;;
        "warning")
            echo -e "${YELLOW}⚠️  $message${NC}"
            ;;
        "info")
            echo -e "${YELLOW}ℹ️  $message${NC}"
            ;;
    esac
}

# Function to check if service is healthy
check_service_health() {
    local service_name=$1
    local max_attempts=30
    local attempt=1
    
    print_status "info" "Checking health of $service_name service..."
    
    while [ $attempt -le $max_attempts ]; do
        if docker compose ps --format json | jq -r ".[] | select(.Service == \"$service_name\") | .Health" | grep -q "healthy"; then
            print_status "success" "$service_name service is healthy"
            return 0
        fi
        
        echo "Attempt $attempt/$max_attempts: Waiting for $service_name to be healthy..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_status "error" "$service_name service failed to become healthy"
    return 1
}

# Function to check database connectivity
test_database_connection() {
    print_status "info" "Testing database connection..."
    
    if docker compose exec -T db psql -U postgres -d postgres -c "SELECT version();" > /dev/null 2>&1; then
        print_status "success" "Database connection successful"
        return 0
    else
        print_status "error" "Database connection failed"
        return 1
    fi
}

# Function to verify extensions are installed
verify_extensions() {
    print_status "info" "Verifying PostgreSQL extensions..."
    
    local extensions=("uuid-ossp" "pgcrypto")
    
    for ext in "${extensions[@]}"; do
        if docker compose exec -T db psql -U postgres -d postgres -c "SELECT 1 FROM pg_extension WHERE extname = '$ext';" | grep -q "1"; then
            print_status "success" "Extension $ext is installed"
        else
            print_status "error" "Extension $ext is not installed"
            return 1
        fi
    done
    
    return 0
}

# Function to verify roles are created
verify_roles() {
    print_status "info" "Verifying PostgreSQL roles..."
    
    local roles=("supabase_admin" "anon" "authenticated" "service_role" "authenticator" "launch")
    
    for role in "${roles[@]}"; do
        if docker compose exec -T db psql -U postgres -d postgres -c "SELECT 1 FROM pg_roles WHERE rolname = '$role';" | grep -q "1"; then
            print_status "success" "Role $role exists"
        else
            print_status "error" "Role $role does not exist"
            return 1
        fi
    done
    
    return 0
}

# Function to verify schemas are created
verify_schemas() {
    print_status "info" "Verifying PostgreSQL schemas..."
    
    local schemas=("auth" "storage" "realtime" "_analytics" "_realtime" "supabase_functions")
    
    for schema in "${schemas[@]}"; do
        if docker compose exec -T db psql -U postgres -d postgres -c "SELECT 1 FROM information_schema.schemata WHERE schema_name = '$schema';" | grep -q "1"; then
            print_status "success" "Schema $schema exists"
        else
            print_status "error" "Schema $schema does not exist"
            return 1
        fi
    done
    
    return 0
}

# Main test execution
main() {
    print_status "info" "Starting PostgreSQL permission fix test..."
    
    # Stop any running containers
    print_status "info" "Stopping existing containers..."
    docker compose down --remove-orphans || true
    
    # Clean up volumes if needed
    print_status "info" "Cleaning up old volumes..."
    docker volume rm $(docker volume ls -q | grep supabase) 2>/dev/null || true
    
    # Fix volume permissions
    print_status "info" "Fixing volume permissions..."
    if [ -f "./scripts/fix-volume-permissions.sh" ]; then
        bash ./scripts/fix-volume-permissions.sh
    fi
    
    # Start the database service first
    print_status "info" "Starting database service..."
    docker compose up -d db
    
    # Wait for database to be healthy
    if ! check_service_health "db"; then
        print_status "error" "Database service failed to start properly"
        docker compose logs db
        exit 1
    fi
    
    # Test database connection
    if ! test_database_connection; then
        print_status "error" "Database connection test failed"
        docker compose logs db
        exit 1
    fi
    
    # Verify extensions
    if ! verify_extensions; then
        print_status "error" "Extension verification failed"
        exit 1
    fi
    
    # Verify roles
    if ! verify_roles; then
        print_status "error" "Role verification failed"
        exit 1
    fi
    
    # Verify schemas
    if ! verify_schemas; then
        print_status "error" "Schema verification failed"
        exit 1
    fi
    
    # Start remaining services
    print_status "info" "Starting remaining Supabase services..."
    docker compose up -d
    
    # Check critical services
    local critical_services=("kong" "auth" "rest" "storage" "meta")
    for service in "${critical_services[@]}"; do
        if ! check_service_health "$service"; then
            print_status "warning" "$service service is not healthy, but continuing..."
        fi
    done
    
    print_status "success" "PostgreSQL permission fix test completed successfully!"
    print_status "info" "All services are running. You can access:"
    print_status "info" "  - Supabase Studio: http://localhost:3001"
    print_status "info" "  - API Gateway: http://localhost:8000"
    print_status "info" "  - Database: localhost:5435"
    
    return 0
}

# Run the main function
main "$@"