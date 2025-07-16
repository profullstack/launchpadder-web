#!/bin/bash

# Set Docker User Environment Variables
# This script automatically sets DOCKER_UID and DOCKER_GID environment variables
# to match the current host user, preventing volume permission issues.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get current user info
CURRENT_USER=$(whoami)
USER_ID=$(id -u)
GROUP_ID=$(id -g)

echo -e "${BLUE}Docker User Environment Setup${NC}"
echo "=================================="
echo "Current user: $CURRENT_USER"
echo "User ID: $USER_ID"
echo "Group ID: $GROUP_ID"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}Creating .env file from .env.example...${NC}"
        cp .env.example .env
        echo -e "${GREEN}✓ .env file created${NC}"
    else
        echo -e "${RED}Error: Neither .env nor .env.example file found!${NC}"
        echo "Please create a .env file with the required environment variables."
        exit 1
    fi
fi

# Function to update or add environment variable in .env file
update_env_var() {
    local var_name="$1"
    local var_value="$2"
    local env_file=".env"
    
    if grep -q "^${var_name}=" "$env_file"; then
        # Variable exists, update it
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/^${var_name}=.*/${var_name}=${var_value}/" "$env_file"
        else
            # Linux
            sed -i "s/^${var_name}=.*/${var_name}=${var_value}/" "$env_file"
        fi
        echo -e "${GREEN}✓ Updated ${var_name}=${var_value}${NC}"
    else
        # Variable doesn't exist, add it
        echo "${var_name}=${var_value}" >> "$env_file"
        echo -e "${GREEN}✓ Added ${var_name}=${var_value}${NC}"
    fi
}

echo -e "${YELLOW}Updating .env file with Docker user settings...${NC}"

# Update DOCKER_UID and DOCKER_GID in .env file
update_env_var "DOCKER_UID" "$USER_ID"
update_env_var "DOCKER_GID" "$GROUP_ID"

echo ""
echo -e "${GREEN}✓ Docker user environment variables configured successfully!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Run: docker-compose down (if containers are running)"
echo "2. Run: docker-compose up -d"
echo "3. All volume files will now be owned by your host user ($CURRENT_USER)"
echo ""
echo -e "${BLUE}Note:${NC} If you change users or move to a different system,"
echo "run this script again to update the UID/GID values."