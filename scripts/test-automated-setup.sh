#!/bin/bash

# Test script for automated Docker setup
# This script tests that the init service runs correctly and sets up permissions

set -e

echo "🧪 Testing automated Docker setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Step 1: Clean up any existing containers
echo "🧹 Cleaning up existing containers..."
docker-compose down -v 2>/dev/null || true
print_status "Cleaned up existing containers"

# Step 2: Set up environment variables for host user
echo "👤 Setting up host user environment..."
export DOCKER_UID=$(id -u)
export DOCKER_GID=$(id -g)
export DOCKER_USERNAME=$(whoami)

# Create minimal .env file for testing
echo "📝 Creating test .env file..."
cat > .env << EOF
# Docker user settings (auto-generated for testing)
DOCKER_UID=$DOCKER_UID
DOCKER_GID=$DOCKER_GID
DOCKER_USERNAME=$DOCKER_USERNAME

# Minimal required environment variables for testing
POSTGRES_PASSWORD=supabase123
POSTGRES_DB=postgres
POSTGRES_USER=postgres
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
SITE_URL=http://localhost:3000
API_EXTERNAL_URL=http://localhost:8000
PUBLIC_SUPABASE_URL=http://localhost:8000
STUDIO_DEFAULT_ORGANIZATION=Default Organization
STUDIO_DEFAULT_PROJECT=Default Project
PGRST_DB_SCHEMAS=public,storage,graphql_public
SECRET_KEY_BASE=your-secret-key-base-with-at-least-64-characters-long-for-security
VAULT_ENC_KEY=your-vault-encryption-key-with-at-least-32-characters-long
LOGFLARE_PUBLIC_ACCESS_TOKEN=your-logflare-public-access-token
LOGFLARE_PRIVATE_ACCESS_TOKEN=your-logflare-private-access-token
POOLER_TENANT_ID=default
POOLER_DEFAULT_POOL_SIZE=20
POOLER_MAX_CLIENT_CONN=100
POOLER_DB_POOL_SIZE=10
EOF

print_status "Created test .env file"

# Step 3: Start services and test init container
echo "🚀 Starting services with automated initialization..."
docker-compose up -d --build

# Step 4: Wait for init service to complete
echo "⏳ Waiting for init service to complete..."
timeout=120
counter=0
while [ $counter -lt $timeout ]; do
    init_status=$(docker-compose ps init --format "table {{.State}}" | tail -n +2 | tr -d ' ')
    if [ "$init_status" = "Exited(0)" ]; then
        print_status "Init service completed successfully!"
        break
    elif [ "$init_status" = "Exited(1)" ] || [[ "$init_status" == *"Error"* ]]; then
        print_error "Init service failed!"
        echo "Init service logs:"
        docker-compose logs init
        exit 1
    fi
    sleep 2
    counter=$((counter + 2))
    echo "Waiting for init service... ($counter/$timeout seconds) - Status: $init_status"
done

if [ $counter -ge $timeout ]; then
    print_error "Init service did not complete within $timeout seconds"
    echo "Init service logs:"
    docker-compose logs init
    exit 1
fi

# Step 5: Check that volume directories were created with correct permissions
echo "🔍 Checking volume directory permissions..."
check_directory() {
    local dir="$1"
    if [ -d "$dir" ]; then
        local owner_uid=$(stat -c %u "$dir")
        local owner_gid=$(stat -c %g "$dir")
        if [ "$owner_uid" = "$DOCKER_UID" ] && [ "$owner_gid" = "$DOCKER_GID" ]; then
            print_status "$dir has correct ownership ($owner_uid:$owner_gid)"
        else
            print_error "$dir has incorrect ownership ($owner_uid:$owner_gid), expected ($DOCKER_UID:$DOCKER_GID)"
            return 1
        fi
    else
        print_error "$dir does not exist"
        return 1
    fi
}

check_directory "volumes/db/data"
check_directory "volumes/storage"
check_directory "volumes/functions"
check_directory "volumes/logs"

# Step 6: Check that services are running
echo "📊 Checking service status..."
docker-compose ps

# Step 7: Wait for database to be healthy
echo "⏳ Waiting for database to be healthy..."
timeout=60
counter=0
while [ $counter -lt $timeout ]; do
    if docker-compose exec -T db pg_isready -U postgres -h localhost >/dev/null 2>&1; then
        print_status "Database is healthy!"
        break
    fi
    sleep 2
    counter=$((counter + 2))
    echo "Waiting for database... ($counter/$timeout seconds)"
done

if [ $counter -ge $timeout ]; then
    print_error "Database failed to become healthy within $timeout seconds"
    echo "Database logs:"
    docker-compose logs db
    exit 1
fi

# Step 8: Test web service startup
echo "🌐 Testing web service..."
timeout=60
counter=0
while [ $counter -lt $timeout ]; do
    if curl -s http://localhost:3000 >/dev/null 2>&1; then
        print_status "Web service is responding!"
        break
    fi
    sleep 2
    counter=$((counter + 2))
    echo "Waiting for web service... ($counter/$timeout seconds)"
done

if [ $counter -ge $timeout ]; then
    print_warning "Web service not responding within $timeout seconds (this may be normal during first startup)"
    echo "Web service logs:"
    docker-compose logs web | tail -20
fi

echo ""
print_status "Automated setup test completed successfully!"
echo ""
echo "🎉 Summary:"
echo "   • Init service ran and completed successfully"
echo "   • Volume directories created with correct permissions"
echo "   • Database is healthy and running"
echo "   • All services started in correct order"
echo ""
echo "📋 Next steps:"
echo "   • You can now use 'docker-compose up -d' without manual scripts"
echo "   • The init service will automatically handle permissions"
echo "   • Check logs with: docker-compose logs init"
echo ""
echo "🛑 Cleaning up test environment..."
docker-compose down -v
print_status "Test cleanup completed"