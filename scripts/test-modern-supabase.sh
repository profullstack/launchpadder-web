#!/bin/bash

# Test script for modern Supabase setup
# This script validates that the new configuration works correctly

set -e

echo "🧪 Testing Modern Supabase Configuration"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        exit 1
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Check if docker-compose.modern.yml exists
if [ ! -f "docker-compose.modern.yml" ]; then
    echo -e "${RED}❌ docker-compose.modern.yml not found${NC}"
    exit 1
fi

print_info "Using docker-compose.modern.yml for testing"

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found, using .env.modern.example"
    if [ -f ".env.modern.example" ]; then
        cp .env.modern.example .env
        print_info "Copied .env.modern.example to .env"
    else
        echo -e "${RED}❌ No environment file found${NC}"
        exit 1
    fi
fi

# Test 1: Validate docker-compose file syntax
print_info "Testing docker-compose file syntax..."
docker-compose -f docker-compose.modern.yml config > /dev/null 2>&1
print_status $? "Docker Compose file syntax is valid"

# Test 2: Check if required environment variables are set
print_info "Checking required environment variables..."
source .env

required_vars=("POSTGRES_PASSWORD" "JWT_SECRET" "ANON_KEY" "SERVICE_ROLE_KEY")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -eq 0 ]; then
    print_status 0 "All required environment variables are set"
else
    echo -e "${RED}❌ Missing required environment variables: ${missing_vars[*]}${NC}"
    exit 1
fi

# Test 3: Start the services
print_info "Starting Supabase services..."
docker-compose -f docker-compose.modern.yml up -d

# Wait for services to start
print_info "Waiting for services to start (60 seconds)..."
sleep 60

# Test 4: Check if Supabase container is running
print_info "Checking if Supabase container is running..."
if docker-compose -f docker-compose.modern.yml ps supabase | grep -q "Up"; then
    print_status 0 "Supabase container is running"
else
    print_status 1 "Supabase container is not running"
fi

# Test 5: Check health endpoint
print_info "Testing health endpoint..."
if curl -f -s http://localhost:8000/health > /dev/null; then
    print_status 0 "Health endpoint is accessible"
else
    print_status 1 "Health endpoint is not accessible"
fi

# Test 6: Check Studio endpoint
print_info "Testing Studio endpoint..."
if curl -f -s http://localhost:3001 > /dev/null; then
    print_status 0 "Studio endpoint is accessible"
else
    print_status 1 "Studio endpoint is not accessible"
fi

# Test 7: Check database connection
print_info "Testing database connection..."
if docker exec supabase-local psql -U postgres -d postgres -c "SELECT version();" > /dev/null 2>&1; then
    print_status 0 "Database connection is working"
else
    print_status 1 "Database connection failed"
fi

# Test 8: Check PostgREST endpoint
print_info "Testing PostgREST endpoint..."
if curl -f -s -H "apikey: ${ANON_KEY}" http://localhost:8000/rest/v1/ > /dev/null; then
    print_status 0 "PostgREST endpoint is accessible"
else
    print_status 1 "PostgREST endpoint is not accessible"
fi

# Test 9: Check Auth endpoint
print_info "Testing Auth endpoint..."
if curl -f -s http://localhost:8000/auth/v1/health > /dev/null; then
    print_status 0 "Auth endpoint is accessible"
else
    print_status 1 "Auth endpoint is not accessible"
fi

# Test 10: Check Storage endpoint
print_info "Testing Storage endpoint..."
if curl -f -s http://localhost:8000/storage/v1/status > /dev/null; then
    print_status 0 "Storage endpoint is accessible"
else
    print_status 1 "Storage endpoint is not accessible"
fi

echo ""
echo "🎉 All tests passed! Modern Supabase setup is working correctly."
echo ""
echo "📋 Service URLs:"
echo "   Studio:    http://localhost:3001"
echo "   API:       http://localhost:8000"
echo "   Database:  localhost:5432"
echo ""
echo "🔧 To stop services: docker-compose -f docker-compose.modern.yml down"
echo "📊 To view logs:     docker-compose -f docker-compose.modern.yml logs -f"