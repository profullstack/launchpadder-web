#!/bin/bash

# Supabase CLI Migration Runner
# This script uses the official Supabase CLI to run migrations properly

set -euo pipefail

# Configuration
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-postgres}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASSWORD="${POSTGRES_PASSWORD:-supabase123}"
SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}}"

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
        
        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
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

# Check if Supabase CLI is available
check_supabase_cli() {
    if ! command -v supabase &> /dev/null; then
        log_error "Supabase CLI not found in container"
        return 1
    fi
    
    log_info "Supabase CLI version: $(supabase --version)"
    return 0
}

# Initialize Supabase project if needed
init_supabase_project() {
    log_info "Checking Supabase project initialization..."
    
    if [ ! -f "supabase/config.toml" ]; then
        log_error "Supabase config.toml not found"
        return 1
    fi
    
    log_success "Supabase project configuration found"
    return 0
}

# Start Supabase services
start_supabase_services() {
    log_info "Starting Supabase services..."
    
    # Check if Supabase is already running
    if supabase status 2>/dev/null | grep -q "API URL"; then
        log_info "Supabase services are already running"
        return 0
    fi
    
    # Start Supabase services
    if supabase start; then
        log_success "Supabase services started successfully"
        
        # Wait a moment for services to fully initialize
        log_info "Waiting for services to initialize..."
        sleep 5
        
        return 0
    else
        log_error "Failed to start Supabase services"
        return 1
    fi
}

# Run database migrations using Supabase CLI
run_supabase_migrations() {
    log_info "Running Supabase migrations..."
    
    # Set the database URL for Supabase CLI
    export SUPABASE_DB_URL="$SUPABASE_DB_URL"
    
    # Check if there are any migrations to run
    local migration_files=(supabase/migrations/*.sql)
    if [ ! -e "${migration_files[0]}" ]; then
        log_info "No migration files found"
        return 0
    fi
    
    log_info "Found ${#migration_files[@]} migration files"
    
    # Apply migrations using Supabase CLI
    log_info "Applying migrations to database..."
    
    if supabase db push --db-url "$SUPABASE_DB_URL" --include-all; then
        log_success "Migrations applied successfully"
        return 0
    else
        log_error "Failed to apply migrations"
        return 1
    fi
}

# Alternative: Apply migrations manually if CLI push fails
run_migrations_manually() {
    log_info "Applying migrations manually as fallback..."
    
    local migration_files=($(find supabase/migrations -name "*.sql" | sort))
    
    if [ ${#migration_files[@]} -eq 0 ]; then
        log_info "No migration files found"
        return 0
    fi
    
    local all_success=true
    
    for file in "${migration_files[@]}"; do
        log_info "Applying migration: $(basename "$file")"
        
        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file" >/dev/null 2>&1; then
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

# Verify database schema after migrations
verify_database_schema() {
    log_info "Verifying database schema..."
    
    # Check for essential Supabase tables
    local auth_users_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'auth' AND table_name = 'users';
    " 2>/dev/null | tr -d ' ')
    
    if [ "$auth_users_count" = "1" ]; then
        log_success "Database verification passed - auth.users table exists"
    else
        log_warning "Database verification failed - auth.users table not found"
    fi
    
    # Check for application tables
    local app_tables_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name IN ('submissions', 'badges', 'users');
    " 2>/dev/null | tr -d ' ')
    
    log_info "Found $app_tables_count application tables"
    
    return 0
}

# Main execution
main() {
    log_info "Starting Supabase migration process..."
    
    # Check prerequisites
    if ! check_supabase_cli; then
        log_error "Supabase CLI check failed"
        exit 1
    fi
    
    if ! init_supabase_project; then
        log_error "Supabase project initialization failed"
        exit 1
    fi
    
    # Start Supabase services
    if ! start_supabase_services; then
        log_error "Failed to start Supabase services"
        exit 1
    fi
    
    # Wait for database
    if ! wait_for_db; then
        log_error "Cannot connect to database, aborting"
        exit 1
    fi
    
    # Try to run migrations with Supabase CLI first
    if run_supabase_migrations; then
        log_success "Supabase CLI migrations completed successfully!"
    else
        log_warning "Supabase CLI migrations failed, trying manual approach..."
        if run_migrations_manually; then
            log_success "Manual migrations completed successfully!"
        else
            log_error "Both Supabase CLI and manual migrations failed"
            exit 1
        fi
    fi
    
    # Verify the result
    verify_database_schema
    
    log_success "Migration process completed!"
    exit 0
}

# Run main function
main "$@"