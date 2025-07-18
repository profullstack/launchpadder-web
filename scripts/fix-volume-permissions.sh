#!/bin/bash

# Fix Docker volume permissions for host user
# This script ensures all Docker volumes are owned by the host user

set -e

echo "Fixing Docker volume permissions..."

# Get current user info
USER_ID=$(id -u)
GROUP_ID=$(id -g)
USERNAME=$(whoami)

echo "Host user: $USERNAME ($USER_ID:$GROUP_ID)"

# Function to fix directory permissions
fix_permissions() {
    local dir="$1"
    if [ -d "$dir" ]; then
        echo "Fixing permissions for $dir"
        if [ "$(stat -c %u "$dir")" != "$USER_ID" ] || [ "$(stat -c %g "$dir")" != "$GROUP_ID" ]; then
            sudo chown -R "$USER_ID:$GROUP_ID" "$dir"
            echo "✅ Fixed ownership of $dir"
        else
            echo "✅ $dir already has correct ownership"
        fi
    else
        echo "📁 Creating $dir with correct ownership"
        mkdir -p "$dir"
        chown "$USER_ID:$GROUP_ID" "$dir"
    fi
}

# Fix all volume directories
fix_permissions "volumes/db/data"
fix_permissions "volumes/storage"
fix_permissions "volumes/functions"
fix_permissions "volumes/logs"

echo "✅ All volume permissions fixed!"