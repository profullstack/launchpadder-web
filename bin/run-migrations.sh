#!/bin/bash

# Migration runner script for Supabase and application migrations
# This script ensures all database migrations are run in the correct order

set -euo pipefail

# Configuration
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5433}"
DB_NAME="${POSTGRES_DB:-postgres}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASSWORD="${POSTGRES_PASSWORD:-your-super-secret-and-long-postgres-password}"

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
        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
            log_success "Database is ready!"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts: Database not ready, waiting 2 seconds..."
        sleep 2
        ((attempt++))
    done
    
    log_error "Database failed to become ready after $max_attempts attempts"
    return 1
}

# Execute SQL file
execute_sql_file() {
    local file_path="$1"
    local description="$2"
    
    if [ ! -f "$file_path" ]; then
        log_warning "File not found: $file_path"
        return 1
    fi
    
    log_info "Executing $description: $(basename "$file_path")"
    
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file_path" >/dev/null 2>&1; then
        log_success "Successfully executed: $(basename "$file_path")"
        return 0
    else
        log_error "Failed to execute: $(basename "$file_path")"
        return 1
    fi
}

# Check if migrations have already been run
check_migration_status() {
    local component="$1"
    
    local result=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'supabase_init_status';
    " 2>/dev/null | tr -d ' ')
    
    if [ "$result" = "1" ]; then
        local initialized=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
            SELECT COUNT(*) FROM public.supabase_init_status WHERE component = '$component';
        " 2>/dev/null | tr -d ' ')
        
        if [ "$initialized" = "1" ]; then
            return 0  # Already initialized
        fi
    fi
    
    return 1  # Not initialized
}

# Mark component as initialized
mark_initialized() {
    local component="$1"
    local version="$2"
    
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        INSERT INTO public.supabase_init_status (component, version) 
        VALUES ('$component', '$version') 
        ON CONFLICT (component) DO UPDATE SET 
            initialized_at = now(),
            version = EXCLUDED.version;
    " >/dev/null 2>&1
}

# Run database initialization
run_db_initialization() {
    log_info "Starting database initialization..."
    
    if check_migration_status "database"; then
        log_success "Database already initialized, skipping..."
        return 0
    fi
    
    # Run the master initialization script
    if execute_sql_file "./volumes/db/init-db.sql" "database initialization"; then
        log_success "Database initialization completed"
        return 0
    else
        log_error "Database initialization failed"
        return 1
    fi
}

# Run additional Supabase setup scripts
run_supabase_setup() {
    log_info "Running additional Supabase setup scripts..."
    
    if check_migration_status "supabase_setup"; then
        log_success "Supabase setup already completed, skipping..."
        return 0
    fi
    
    local setup_files=(
        "./volumes/db/realtime.sql"
        "./volumes/db/webhooks.sql"
        "./volumes/db/logs.sql"
        "./volumes/db/pooler.sql"
    )
    
    local all_success=true
    
    for file in "${setup_files[@]}"; do
        if [ -f "$file" ]; then
            if ! execute_sql_file "$file" "Supabase setup"; then
                all_success=false
            fi
        else
            log_warning "Setup file not found: $file"
        fi
    done
    
    if [ "$all_success" = true ]; then
        mark_initialized "supabase_setup" "1.0.0"
        log_success "Supabase setup completed"
        return 0
    else
        log_error "Some Supabase setup scripts failed"
        return 1
    fi
}

# Run application migrations
run_app_migrations() {
    log_info "Running application migrations..."
    
    if check_migration_status "app_migrations"; then
        log_success "Application migrations already completed, skipping..."
        return 0
    fi
    
    local migration_dir="./supabase/migrations"
    
    if [ ! -d "$migration_dir" ]; then
        log_warning "Migration directory not found: $migration_dir"
        mark_initialized "app_migrations" "1.0.0"
        return 0
    fi
    
    local migration_files=($(find "$migration_dir" -name "*.sql" | sort))
    
    if [ ${#migration_files[@]} -eq 0 ]; then
        log_info "No migration files found"
        mark_initialized "app_migrations" "1.0.0"
        return 0
    fi
    
    local all_success=true
    
    for file in "${migration_files[@]}"; do
        if ! execute_sql_file "$file" "application migration"; then
            all_success=false
        fi
    done
    
    if [ "$all_success" = true ]; then
        mark_initialized "app_migrations" "1.0.0"
        log_success "Application migrations completed"
        return 0
    else
        log_error "Some application migrations failed"
        return 1
    fi
}

# Create migration status table if it doesn't exist
create_migration_table() {
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        CREATE TABLE IF NOT EXISTS public.supabase_init_status (
            id serial PRIMARY KEY,
            component text NOT NULL UNIQUE,
            initialized_at timestamp with time zone DEFAULT now(),
            version text
        );
    " >/dev/null 2>&1
}

# Main execution
main() {
    log_info "Starting migration process..."
    
    # Wait for database
    if ! wait_for_db; then
        log_error "Cannot connect to database, aborting"
        exit 1
    fi
    
    # Create migration tracking table
    create_migration_table
    
    # Run migrations in order
    if run_db_initialization && run_supabase_setup && run_app_migrations; then
        log_success "All migrations completed successfully!"
        
        # Verify database is properly set up
        log_info "Verifying database setup..."
        local auth_users_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_schema = 'auth' AND table_name = 'users';
        " 2>/dev/null | tr -d ' ')
        
        if [ "$auth_users_count" = "1" ]; then
            log_success "Database verification passed - auth.users table exists"
        else
            log_warning "Database verification failed - auth.users table not found"
        fi
        
        exit 0
    else
        log_error "Migration process failed"
        exit 1
    fi
}

# Run main function
main "$@"