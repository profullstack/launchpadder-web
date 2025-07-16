#!/bin/bash

# Fix Volume Ownership Script
# This script fixes the ownership of Docker volume directories to use the host user
# instead of container users, preventing permission issues.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current user info
CURRENT_USER=$(whoami)
USER_ID=$(id -u)
GROUP_ID=$(id -g)

echo -e "${YELLOW}Docker Volume Ownership Fix${NC}"
echo "=================================="
echo "Current user: $CURRENT_USER"
echo "User ID: $USER_ID"
echo "Group ID: $GROUP_ID"
echo ""

# Check if volumes directory exists
if [ ! -d "volumes" ]; then
    echo -e "${RED}Error: volumes directory not found!${NC}"
    echo "Please run this script from the project root directory."
    exit 1
fi

echo -e "${YELLOW}Checking current ownership...${NC}"
ls -la volumes/

echo ""
echo -e "${YELLOW}Fixing ownership of volumes directory...${NC}"

# Fix ownership recursively
if sudo chown -R "$CURRENT_USER:$CURRENT_USER" volumes/; then
    echo -e "${GREEN}✓ Successfully changed ownership of volumes/ to $CURRENT_USER:$CURRENT_USER${NC}"
else
    echo -e "${RED}✗ Failed to change ownership${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Verifying ownership changes...${NC}"
ls -la volumes/

echo ""
echo -e "${YELLOW}Checking database data directory...${NC}"
if [ -d "volumes/db/data" ]; then
    ls -la volumes/db/data/
else
    echo "Database data directory not found (this is normal if containers haven't been started yet)"
fi

echo ""
echo -e "${GREEN}✓ Volume ownership fix completed successfully!${NC}"
echo ""
echo "Note: You may need to restart your Docker containers for the changes to take full effect."
echo "Run: docker-compose down && docker-compose up -d"