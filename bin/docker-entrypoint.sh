#!/bin/bash

# Docker Entrypoint Script for LaunchPadder
# This script runs migrations before starting the SvelteKit application

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

# Wait for database to be ready
wait_for_db() {
    log_info "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_info "Attempt $attempt/$max_attempts: Checking database connection..."
        
        if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" >/dev/null 2>&1; then
            log_success "Database is ready!"
            return 0
        fi
        
        log_info "Database not ready, waiting 2 seconds..."
        sleep 2
        ((attempt++))
    done
    
    log_error "Database failed to become ready after $max_attempts attempts"
    return 1
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Check if there are any migrations to run
    if [ ! -d "supabase/migrations" ] || [ -z "$(ls -A supabase/migrations 2>/dev/null)" ]; then
        log_info "No migration files found, skipping migrations"
        return 0
    fi
    
    log_info "Found migration files, applying them..."
    
    # Try to run migrations using the existing script
    if [ -f "./bin/run-supabase-migrations.sh" ]; then
        log_info "Using existing migration script..."
        if ./bin/run-supabase-migrations.sh; then
            log_success "Migrations completed successfully"
            return 0
        else
            log_warning "Migration script failed, trying manual approach..."
        fi
    fi
    
    # Fallback: Apply migrations manually
    log_info "Applying migrations manually..."
    local migration_files=($(find supabase/migrations -name "*.sql" | sort))
    
    if [ ${#migration_files[@]} -eq 0 ]; then
        log_info "No SQL migration files found"
        return 0
    fi
    
    local all_success=true
    
    for file in "${migration_files[@]}"; do
        log_info "Applying migration: $(basename "$file")"
        
        if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$file" >/dev/null 2>&1; then
            log_success "Applied: $(basename "$file")"
        else
            log_error "Failed to apply: $(basename "$file")"
            all_success=false
        fi
    done
    
    if [ "$all_success" = true ]; then
        log_success "All migrations applied successfully"
        return 0
    else
        log_error "Some migrations failed"
        return 1
    fi
}

# Start the application
start_app() {
    log_info "Starting SvelteKit application..."
    exec node build
}

# Main execution
main() {
    log_info "Starting LaunchPadder application container..."
    
    # Wait for database
    if ! wait_for_db; then
        log_error "Cannot connect to database, aborting"
        exit 1
    fi
    
    # Run migrations
    if ! run_migrations; then
        log_error "Migration failed, aborting"
        exit 1
    fi
    
    # Start the application
    start_app
}

# Handle script interruption
trap 'log_error "Container startup interrupted"; exit 1' INT TERM

# Run main function
main "$@"