#!/bin/bash

# Docker initialization script for LaunchPadder
# This script runs automatically during Docker Compose startup
# It combines the functionality of start-fresh.sh and fix-volume-permissions.sh

set -e

echo "🚀 Running Docker initialization for LaunchPadder..."

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

# Get current user info (from environment variables set by Docker Compose)
USER_ID=${DOCKER_UID:-1000}
GROUP_ID=${DOCKER_GID:-1000}
USERNAME=${DOCKER_USERNAME:-appuser}

echo "Docker user: $USERNAME ($USER_ID:$GROUP_ID)"

# Function to fix directory permissions
fix_permissions() {
    local dir="$1"
    if [ -d "$dir" ]; then
        echo "Fixing permissions for $dir"
        if [ "$(stat -c %u "$dir" 2>/dev/null || echo "0")" != "$USER_ID" ] || [ "$(stat -c %g "$dir" 2>/dev/null || echo "0")" != "$GROUP_ID" ]; then
            chown -R "$USER_ID:$GROUP_ID" "$dir" 2>/dev/null || true
            print_status "Fixed ownership of $dir"
        else
            print_status "$dir already has correct ownership"
        fi
    else
        echo "📁 Creating $dir with correct ownership"
        mkdir -p "$dir"
        chown "$USER_ID:$GROUP_ID" "$dir" 2>/dev/null || true
    fi
}

# Step 1: Create volume directories with correct ownership
echo "📁 Creating volume directories with correct ownership..."
fix_permissions "/app/volumes/db/data"
fix_permissions "/app/volumes/storage"
fix_permissions "/app/volumes/functions"
fix_permissions "/app/volumes/logs"
fix_permissions "/app/volumes/pooler"

# Step 2: Create additional required directories
echo "📁 Creating additional required directories..."
mkdir -p /app/uploads /app/logs
chown "$USER_ID:$GROUP_ID" /app/uploads /app/logs 2>/dev/null || true

# Step 3: Set up proper permissions for config files
echo "🔧 Setting up config file permissions..."
if [ -f "/app/volumes/api/kong.yml" ]; then
    chown "$USER_ID:$GROUP_ID" /app/volumes/api/kong.yml 2>/dev/null || true
fi

if [ -f "/app/volumes/logs/vector.yml" ]; then
    chown "$USER_ID:$GROUP_ID" /app/volumes/logs/vector.yml 2>/dev/null || true
fi

if [ -f "/app/volumes/pooler/pooler.exs" ]; then
    chown "$USER_ID:$GROUP_ID" /app/volumes/pooler/pooler.exs 2>/dev/null || true
fi

print_status "Docker initialization completed successfully!"

echo "📋 Initialization summary:"
echo "   • Volume directories created and permissions set"
echo "   • User: $USERNAME ($USER_ID:$GROUP_ID)"
echo "   • Ready for application startup"
echo ""