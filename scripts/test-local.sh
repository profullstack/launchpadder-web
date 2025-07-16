#!/bin/bash

# LaunchPadder - Local Testing Script
# Test the application locally using Docker before deploying to server

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! sudo docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi
    
    # Check if pnpm is installed
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed. Please install pnpm first: npm install -g pnpm"
        exit 1
    fi
    
    log_success "All prerequisites are met"
}

# Setup environment
setup_environment() {
    log_info "Setting up environment..."
    
    # Copy environment file if it doesn't exist
    if [[ ! -f ".env.local" ]]; then
        log_warning ".env.local not found. Please create it with your configuration."
        log_info "You can use the provided .env.local as a template."
        exit 1
    fi
    
    # Create necessary directories
    mkdir -p docker/volumes/storage
    mkdir -p docker/volumes/logs
    
    log_success "Environment setup complete"
}

# Start Supabase services
start_supabase() {
    log_info "Starting Supabase services..."
    
    # Use docker-compose.local.yml for local testing - prefer newer docker compose
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
    
    # Clear potentially problematic Docker environment variables
    unset DOCKER_HOST DOCKER_TLS_VERIFY DOCKER_CERT_PATH
    
    # Load environment variables
    set -a
    source .env.local
    set +a
    
    # Debug: Check if variables are loaded
    echo "DEBUG: POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
    echo "DEBUG: SUPABASE_URL=$SUPABASE_URL"
    echo "DEBUG: JWT_SECRET=$JWT_SECRET"
    
    # Start database first to check if it can start
    log_info "Starting database container first..."
    sudo DOCKER_HOST=unix:///var/run/docker.sock \
         POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
         SUPABASE_URL="$SUPABASE_URL" \
         SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
         SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
         POSTGRES_DB="$POSTGRES_DB" \
         JWT_SECRET="$JWT_SECRET" \
         API_EXTERNAL_URL="$API_EXTERNAL_URL" \
         SITE_URL="$SITE_URL" \
         LOGFLARE_API_KEY="$LOGFLARE_API_KEY" \
         ADDITIONAL_REDIRECT_URLS="$ADDITIONAL_REDIRECT_URLS" \
         SMTP_ADMIN_EMAIL="$SMTP_ADMIN_EMAIL" \
         SMTP_HOST="$SMTP_HOST" \
         SMTP_PORT="$SMTP_PORT" \
         SMTP_USER="$SMTP_USER" \
         SMTP_PASS="$SMTP_PASS" \
         SMTP_SENDER_NAME="$SMTP_SENDER_NAME" \
         $COMPOSE_CMD -f docker-compose.local.yml up -d db || {
             log_error "Database failed to start. Checking container status..."
             sudo DOCKER_HOST=unix:///var/run/docker.sock docker ps -a | grep supabase-db
             log_info "Container logs:"
             sudo DOCKER_HOST=unix:///var/run/docker.sock docker logs supabase-db 2>&1 | tail -30
             exit 1
         }
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 45
    
    # Start core services first
    log_info "Starting core services..."
    sudo DOCKER_HOST=unix:///var/run/docker.sock \
         POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
         SUPABASE_URL="$SUPABASE_URL" \
         SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
         SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
         POSTGRES_DB="$POSTGRES_DB" \
         JWT_SECRET="$JWT_SECRET" \
         API_EXTERNAL_URL="$API_EXTERNAL_URL" \
         SITE_URL="$SITE_URL" \
         LOGFLARE_API_KEY="$LOGFLARE_API_KEY" \
         ADDITIONAL_REDIRECT_URLS="$ADDITIONAL_REDIRECT_URLS" \
         SMTP_ADMIN_EMAIL="$SMTP_ADMIN_EMAIL" \
         SMTP_HOST="$SMTP_HOST" \
         SMTP_PORT="$SMTP_PORT" \
         SMTP_USER="$SMTP_USER" \
         SMTP_PASS="$SMTP_PASS" \
         SMTP_SENDER_NAME="$SMTP_SENDER_NAME" \
         $COMPOSE_CMD -f docker-compose.local.yml up -d vector imgproxy analytics
    
    # Wait for core services
    log_info "Waiting for core services..."
    sleep 30
    
    # Start remaining services
    log_info "Starting remaining services..."
    sudo DOCKER_HOST=unix:///var/run/docker.sock \
         POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
         SUPABASE_URL="$SUPABASE_URL" \
         SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
         SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
         POSTGRES_DB="$POSTGRES_DB" \
         JWT_SECRET="$JWT_SECRET" \
         API_EXTERNAL_URL="$API_EXTERNAL_URL" \
         SITE_URL="$SITE_URL" \
         LOGFLARE_API_KEY="$LOGFLARE_API_KEY" \
         ADDITIONAL_REDIRECT_URLS="$ADDITIONAL_REDIRECT_URLS" \
         SMTP_ADMIN_EMAIL="$SMTP_ADMIN_EMAIL" \
         SMTP_HOST="$SMTP_HOST" \
         SMTP_PORT="$SMTP_PORT" \
         SMTP_USER="$SMTP_USER" \
         SMTP_PASS="$SMTP_PASS" \
         SMTP_SENDER_NAME="$SMTP_SENDER_NAME" \
         $COMPOSE_CMD -f docker-compose.local.yml up -d kong auth rest realtime storage meta functions studio
    
    # Wait for services to be healthy
    log_info "Waiting for services to be ready..."
    sleep 90
    
    # Check service status first
    log_info "Checking service status..."
    sudo docker ps --format "table {{.Names}}\t{{.Status}}"
    
    # Check if Kong is responding
    local retries=0
    local max_retries=30
    
    while [[ $retries -lt $max_retries ]]; do
        log_info "Testing Kong connection..."
        if curl -f http://localhost:8000/ &> /dev/null; then
            log_success "Supabase services are ready"
            return 0
        else
            log_info "Kong not ready yet, checking logs..."
            sudo docker logs supabase-kong | tail -5
        fi
        
        log_info "Waiting for services... ($((retries + 1))/$max_retries)"
        sleep 5
        ((retries++))
    done
    
    log_error "Services failed to start properly"
    sudo -E env DOCKER_HOST=unix:///var/run/docker.sock $COMPOSE_CMD -f docker-compose.local.yml logs
    exit 1
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Wait a bit more for database to be fully ready
    sleep 10
    
    # Run Supabase migrations if they exist
    if [[ -d "supabase/migrations" ]]; then
        # Apply migrations using psql
        for migration in supabase/migrations/*.sql; do
            if [[ -f "$migration" ]]; then
                log_info "Applying migration: $(basename "$migration")"
                sudo docker exec -i supabase-db psql -U postgres -d postgres < "$migration" || true
            fi
        done
    fi
    
    log_success "Database migrations completed"
}

# Build and start the web application
start_web_app() {
    log_info "Building and starting the web application..."
    
    # Install dependencies
    log_info "Installing dependencies..."
    pnpm install
    
    # Build the application
    log_info "Building application..."
    pnpm run build
    
    # Start the application in the background
    log_info "Starting web application..."
    NODE_ENV=development pnpm run preview --port 3000 &
    WEB_PID=$!
    
    # Wait for the web app to start
    local retries=0
    local max_retries=30
    
    while [[ $retries -lt $max_retries ]]; do
        if curl -f http://localhost:3000/api/health &> /dev/null; then
            log_success "Web application is ready at http://localhost:3000"
            return 0
        fi
        
        log_info "Waiting for web app... ($((retries + 1))/$max_retries)"
        sleep 2
        ((retries++))
    done
    
    log_error "Web application failed to start"
    kill $WEB_PID 2>/dev/null || true
    exit 1
}

# Run tests
run_tests() {
    log_info "Running tests..."
    
    # Set test environment
    export NODE_ENV=test
    
    # Run unit tests
    log_info "Running unit tests..."
    pnpm run test
    
    # Run integration tests if they exist
    if [[ -d "test/integration" ]]; then
        log_info "Running integration tests..."
        pnpm run test:integration || log_warning "Integration tests failed or not configured"
    fi
    
    log_success "Tests completed"
}

# Health check
health_check() {
    log_info "Performing comprehensive health check..."
    
    # Check Supabase Studio
    if curl -f http://localhost:3001 &> /dev/null; then
        log_success "✅ Supabase Studio is accessible at http://localhost:3001"
    else
        log_error "❌ Supabase Studio is not accessible"
    fi
    
    # Check Kong API Gateway
    if curl -f http://localhost:8000/ &> /dev/null; then
        log_success "✅ Kong API Gateway is accessible at http://localhost:8000"
    else
        log_error "❌ Kong API Gateway is not accessible"
    fi
    
    # Check Web Application
    if curl -f http://localhost:3000/api/health &> /dev/null; then
        log_success "✅ Web Application is accessible at http://localhost:3000"
    else
        log_error "❌ Web Application is not accessible"
    fi
    
    # Check Database
    if sudo docker exec supabase-db pg_isready -U postgres &> /dev/null; then
        log_success "✅ PostgreSQL Database is ready"
    else
        log_error "❌ PostgreSQL Database is not ready"
    fi
    
    log_info "Health check completed"
}

# Display useful information
display_info() {
    log_info "🎉 Local testing environment is ready!"
    echo ""
    echo "📋 Available Services:"
    echo "  🌐 Web Application:    http://localhost:3000"
    echo "  🎛️  Supabase Studio:   http://localhost:3001"
    echo "  🚪 Kong API Gateway:   http://localhost:8000"
    echo "  🗄️  PostgreSQL:        localhost:5432"
    echo ""
    echo "🔧 Useful Commands:"
    echo "  View logs:             sudo docker-compose -f docker-compose.local.yml logs -f"
    echo "  Stop services:         sudo docker-compose -f docker-compose.local.yml down"
    echo "  Restart web app:       kill $WEB_PID && pnpm run preview --port 3000 &"
    echo "  Run tests:             pnpm run test"
    echo ""
    echo "🔑 Default Credentials:"
    echo "  Supabase Studio:       supabase / this_password_is_insecure_and_should_be_updated"
    echo ""
    echo "Press Ctrl+C to stop all services"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    
    # Stop web application
    if [[ -n "${WEB_PID:-}" ]]; then
        kill $WEB_PID 2>/dev/null || true
    fi
    
    # Stop Docker services (only if Docker is running)
    if sudo docker info &> /dev/null; then
        if docker compose version &> /dev/null; then
            sudo DOCKER_HOST=unix:///var/run/docker.sock \
                 POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
                 SUPABASE_URL="$SUPABASE_URL" \
                 SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
                 SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
                 POSTGRES_DB="$POSTGRES_DB" \
                 JWT_SECRET="$JWT_SECRET" \
                 API_EXTERNAL_URL="$API_EXTERNAL_URL" \
                 SITE_URL="$SITE_URL" \
                 LOGFLARE_API_KEY="$LOGFLARE_API_KEY" \
                 docker compose -f docker-compose.local.yml down
        else
            sudo DOCKER_HOST=unix:///var/run/docker.sock \
                 POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
                 SUPABASE_URL="$SUPABASE_URL" \
                 SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
                 SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
                 POSTGRES_DB="$POSTGRES_DB" \
                 JWT_SECRET="$JWT_SECRET" \
                 API_EXTERNAL_URL="$API_EXTERNAL_URL" \
                 SITE_URL="$SITE_URL" \
                 LOGFLARE_API_KEY="$LOGFLARE_API_KEY" \
                 docker-compose -f docker-compose.local.yml down
        fi
    else
        log_warning "Docker is not running, skipping service cleanup"
    fi
    
    log_success "Cleanup completed"
}

# Trap cleanup on script exit
trap cleanup EXIT

# Main execution
main() {
    log_info "🚀 Starting LaunchPadder local testing environment..."
    
    check_prerequisites
    setup_environment
    start_supabase
    run_migrations
    start_web_app
    run_tests
    health_check
    display_info
    
    # Keep the script running
    wait
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "LaunchPadder Local Testing Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "This script sets up a complete local testing environment using Docker."
        echo "It starts Supabase services and your web application for testing."
        echo ""
        echo "Prerequisites:"
        echo "  - Docker and Docker Compose"
        echo "  - pnpm"
        echo "  - .env.local file with configuration"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac