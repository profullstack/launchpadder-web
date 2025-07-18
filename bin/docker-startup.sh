#!/bin/bash

# Docker Startup Script for LaunchPadder with Supabase
# This script orchestrates the complete Docker setup including migrations and app startup

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_ROOT}/.env"

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

# Check if .env file exists
check_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        log_warning ".env file not found, creating from .env.example"
        if [ -f "${PROJECT_ROOT}/.env.example" ]; then
            cp "${PROJECT_ROOT}/.env.example" "$ENV_FILE"
            log_info "Please review and update the .env file with your configuration"
        else
            log_error ".env.example file not found"
            return 1
        fi
    fi
    log_success ".env file found"
    return 0
}

# Check Docker and Docker Compose availability
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        return 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        return 1
    fi

    log_success "Docker and Docker Compose are available"
    return 0
}

# Clean up existing containers and volumes
cleanup_containers() {
    log_info "Cleaning up existing containers and volumes..."
    
    cd "$PROJECT_ROOT"
    
    # Stop and remove containers
    docker-compose down -v --remove-orphans 2>/dev/null || true
    
    # Remove any dangling images
    docker image prune -f 2>/dev/null || true
    
    log_success "Cleanup completed"
}

# Build and start services
start_services() {
    log_info "Building and starting Docker services..."
    
    cd "$PROJECT_ROOT"
    
    # Build images
    log_info "Building Docker images..."
    if docker-compose build --no-cache; then
        log_success "Docker images built successfully"
    else
        log_error "Failed to build Docker images"
        return 1
    fi
    
    # Start infrastructure services first (database, auth, etc.)
    log_info "Starting infrastructure services..."
    if docker-compose up -d db auth rest realtime storage meta analytics functions kong vector supavisor; then
        log_success "Infrastructure services started"
    else
        log_error "Failed to start infrastructure services"
        return 1
    fi
    
    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    local max_wait=120
    local wait_time=0
    
    while [ $wait_time -lt $max_wait ]; do
        if docker-compose ps | grep -q "healthy"; then
            log_success "Services are healthy"
            break
        fi
        
        log_info "Waiting for services to be healthy... (${wait_time}s/${max_wait}s)"
        sleep 5
        wait_time=$((wait_time + 5))
    done
    
    if [ $wait_time -ge $max_wait ]; then
        log_warning "Services may not be fully healthy, but continuing..."
    fi
    
    # Run migrations
    log_info "Running database migrations..."
    if docker-compose up migrations; then
        log_success "Database migrations completed"
    else
        log_error "Database migrations failed"
        return 1
    fi
    
    # Start the application
    log_info "Starting the application..."
    if docker-compose up -d app; then
        log_success "Application started successfully"
    else
        log_error "Failed to start application"
        return 1
    fi
    
    return 0
}

# Check service health
check_services() {
    log_info "Checking service health..."
    
    cd "$PROJECT_ROOT"
    
    # Check if all services are running
    local services_status=$(docker-compose ps --format "table {{.Name}}\t{{.Status}}")
    echo "$services_status"
    
    # Check application health endpoint
    log_info "Checking application health endpoint..."
    local app_port=$(grep "^PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "3000")
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f "http://localhost:${app_port}/api/health" >/dev/null 2>&1; then
            log_success "Application health check passed"
            break
        fi
        
        log_info "Attempt $attempt/$max_attempts: Application not ready yet..."
        sleep 3
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log_warning "Application health check failed, but services may still be starting"
    fi
}

# Display service URLs
show_urls() {
    log_info "Service URLs:"
    
    local kong_port=$(grep "^KONG_HTTP_PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "8000")
    local app_port=$(grep "^PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "3000")
    local studio_port=$(grep "^STUDIO_PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "3001")
    
    echo "  Application:      http://localhost:${app_port}"
    echo "  Supabase API:     http://localhost:${kong_port}"
    echo "  Supabase Studio:  http://localhost:${studio_port}"
    echo "  Analytics:        http://localhost:4000"
    echo ""
    echo "To stop all services: docker-compose down"
    echo "To view logs: docker-compose logs -f [service-name]"
}

# Main execution
main() {
    log_info "Starting LaunchPadder Docker setup..."
    
    # Check prerequisites
    if ! check_env_file; then
        exit 1
    fi
    
    if ! check_docker; then
        exit 1
    fi
    
    # Clean up previous setup
    cleanup_containers
    
    # Start services
    if ! start_services; then
        log_error "Failed to start services"
        exit 1
    fi
    
    # Check service health
    check_services
    
    # Show URLs
    show_urls
    
    log_success "LaunchPadder Docker setup completed successfully!"
    exit 0
}

# Handle script interruption
trap 'log_error "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"