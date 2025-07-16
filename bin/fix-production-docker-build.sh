#!/bin/bash

# Fix Production Docker Build Issues
# This script addresses the permission denied error when building Docker images in production

set -e

echo "🔧 Fixing Production Docker Build Issues..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [[ ! -f "docker-compose.production.yml" ]]; then
    print_error "docker-compose.production.yml not found. Please run this script from the project root."
    exit 1
fi

# Step 1: Fix volume permissions if they exist
print_status "Checking for problematic volume directories..."

if [[ -d "volumes/db/data" ]]; then
    print_warning "Found volumes/db/data directory with potential permission issues"
    
    # Check current permissions
    CURRENT_PERMS=$(ls -ld volumes/db/data 2>/dev/null || echo "")
    if [[ -n "$CURRENT_PERMS" ]]; then
        print_status "Current permissions: $CURRENT_PERMS"
    fi
    
    # Option 1: Remove the problematic directory (safest for build)
    read -p "Do you want to remove the volumes/db/data directory to fix build issues? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Removing volumes/db/data directory..."
        sudo rm -rf volumes/db/data
        print_success "Removed volumes/db/data directory"
    else
        # Option 2: Fix permissions
        print_status "Attempting to fix permissions..."
        sudo chmod -R 755 volumes/db/ 2>/dev/null || true
        sudo chown -R $(id -u):$(id -g) volumes/db/ 2>/dev/null || true
        print_success "Fixed permissions for volumes/db/"
    fi
else
    print_success "No problematic volume directories found"
fi

# Step 2: Verify .dockerignore is properly configured
print_status "Verifying .dockerignore configuration..."

DOCKERIGNORE_ENTRIES=(
    "volumes/"
    "volumes/db/data/"
    "volumes/*/data/"
    "docker/volumes/"
)

for entry in "${DOCKERIGNORE_ENTRIES[@]}"; do
    if grep -q "^${entry}$" .dockerignore; then
        print_success ".dockerignore contains: $entry"
    else
        print_warning ".dockerignore missing: $entry"
        echo "$entry" >> .dockerignore
        print_success "Added $entry to .dockerignore"
    fi
done

# Step 3: Verify environment variables are set
print_status "Checking required environment variables..."

REQUIRED_VARS=(
    "ANON_KEY"
    "SERVICE_ROLE_KEY"
    "POSTGRES_PASSWORD"
    "JWT_SECRET"
)

MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var}" ]]; then
        MISSING_VARS+=("$var")
    fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    print_error "Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    print_warning "Please set these variables in your environment or .env file before building"
    
    # Check if .env.production exists
    if [[ -f ".env.production" ]]; then
        print_status "Found .env.production file. Make sure it contains the required variables."
    else
        print_warning "No .env.production file found. Consider creating one based on .env.production.example"
    fi
else
    print_success "All required environment variables are set"
fi

# Step 4: Test Docker build context
print_status "Testing Docker build context loading..."

# Create a temporary Dockerfile to test context loading
cat > Dockerfile.test << 'EOF'
FROM alpine:latest
COPY . /test
RUN echo "Build context loaded successfully"
EOF

if docker build -f Dockerfile.test -t test-context . >/dev/null 2>&1; then
    print_success "Docker build context loads without permission errors"
    docker rmi test-context >/dev/null 2>&1 || true
else
    print_error "Docker build context still has permission issues"
    print_status "Try running: sudo chown -R $(id -u):$(id -g) ."
fi

# Clean up test Dockerfile
rm -f Dockerfile.test

# Step 5: Provide build instructions
print_status "Production build instructions:"
echo
echo "To build the production Docker images, run:"
echo
echo "  docker-compose -f docker-compose.production.yml build"
echo
echo "Or to build and start all services:"
echo
echo "  docker-compose -f docker-compose.production.yml up -d --build"
echo
echo "Make sure your .env.production file contains:"
echo "  - ANON_KEY=your_supabase_anon_key"
echo "  - SERVICE_ROLE_KEY=your_supabase_service_role_key"
echo "  - POSTGRES_PASSWORD=your_postgres_password"
echo "  - JWT_SECRET=your_jwt_secret"
echo "  - All other required production variables"

print_success "Production Docker build fix completed!"