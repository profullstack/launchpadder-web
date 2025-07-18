#!/bin/bash

# Complete fresh start script for LaunchPadder
# This script handles all setup from scratch including Docker build fixes and volume permissions

set -e

echo "🚀 Starting LaunchPadder from fresh..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Step 1: Clean up any existing containers and volumes
echo "🧹 Cleaning up existing containers and volumes..."
docker-compose down -v 2>/dev/null || true
docker system prune -f --volumes 2>/dev/null || true
print_status "Cleaned up existing containers"

# Step 2: Remove any root-owned volume directories
echo "🗑️  Removing any root-owned volume directories..."
if [ -d "volumes/db/data" ]; then
    sudo rm -rf volumes/db/data
    print_status "Removed old database data"
fi

# Step 3: Set up environment variables for host user
echo "👤 Setting up host user environment..."
export DOCKER_UID=$(id -u)
export DOCKER_GID=$(id -g)
export DOCKER_USERNAME=$(whoami)

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file with host user settings..."
    cat > .env << EOF
# Docker user settings (auto-generated)
DOCKER_UID=$DOCKER_UID
DOCKER_GID=$DOCKER_GID
DOCKER_USERNAME=$DOCKER_USERNAME

# Add your other environment variables here
# Copy from .env.example and customize as needed
EOF
    print_status "Created .env file with host user settings"
else
    # Update existing .env file with Docker user settings
    echo "📝 Updating .env file with host user settings..."
    
    # Remove existing DOCKER_* lines
    sed -i '/^DOCKER_UID=/d' .env
    sed -i '/^DOCKER_GID=/d' .env
    sed -i '/^DOCKER_USERNAME=/d' .env
    
    # Add new DOCKER_* lines
    echo "" >> .env
    echo "# Docker user settings (auto-generated)" >> .env
    echo "DOCKER_UID=$DOCKER_UID" >> .env
    echo "DOCKER_GID=$DOCKER_GID" >> .env
    echo "DOCKER_USERNAME=$DOCKER_USERNAME" >> .env
    
    print_status "Updated .env file with host user settings"
fi

# Step 4: Create volume directories with correct ownership
echo "📁 Creating volume directories with correct ownership..."
mkdir -p volumes/db/data
mkdir -p volumes/storage
mkdir -p volumes/functions
mkdir -p volumes/logs

# Ensure correct ownership
chown -R "$DOCKER_UID:$DOCKER_GID" volumes/ 2>/dev/null || true
print_status "Created volume directories with correct ownership"

# Step 5: Build and start services
echo "🏗️  Building and starting services..."
docker-compose up -d --build

print_status "Services started successfully!"

# Step 6: Wait for database to be healthy
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
    echo "Waiting... ($counter/$timeout seconds)"
done

if [ $counter -ge $timeout ]; then
    print_error "Database failed to become healthy within $timeout seconds"
    echo "Check logs with: docker-compose logs db"
    exit 1
fi

# Step 7: Fix any volume permissions that may have been created as root
echo "🔧 Fixing volume permissions..."
./scripts/fix-volume-permissions.sh

# Step 8: Show status
echo "📊 Service status:"
docker-compose ps

echo ""
print_status "LaunchPadder is ready!"
echo ""
echo "🌐 Access points:"
echo "   • Web App: http://localhost:3000"
echo "   • Supabase Studio: http://localhost:3001"
echo "   • Database: localhost:5435"
echo ""
echo "📋 Useful commands:"
echo "   • View logs: docker-compose logs -f"
echo "   • Stop services: docker-compose down"
echo "   • Restart: docker-compose restart"
echo ""