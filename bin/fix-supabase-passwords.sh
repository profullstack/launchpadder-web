#!/bin/bash

# Fix Supabase user passwords to match environment variables
# This script updates the passwords for all Supabase service users

set -euo pipefail

# Configuration
DB_HOST="${POSTGRES_HOST:-db}"
DB_PORT="${POSTGRES_PORT:-5432}"
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
    # print db credentials
    echo "DB_HOST: $DB_HOST"
    echo "DB_PORT: $DB_PORT"
    echo "DB_NAME: $DB_NAME"
    echo "DB_USER: $DB_USER"
    echo "DB_PASSWORD: $DB_PASSWORD"
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

# Update user password
update_user_password() {
    local username="$1"
    local password="$2"
    
    log_info "Updating password for user: $username"
    
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "ALTER USER $username WITH PASSWORD '$password';" >/dev/null 2>&1; then
        log_success "Successfully updated password for: $username"
        return 0
    else
        log_error "Failed to update password for: $username"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting Supabase password fix process..."
    
    # Wait for database
    if ! wait_for_db; then
        log_error "Cannot connect to database, aborting"
        exit 1
    fi
    
    # List of Supabase users to update
    local users=(
        "supabase_auth_admin"
        "supabase_storage_admin"
        "supabase_realtime_admin"
        "supabase_functions_admin"
        "supabase_admin"
        "authenticator"
        "dashboard_user"
    )
    
    local success_count=0
    local total_count=${#users[@]}
    
    # Update passwords for all users
    for user in "${users[@]}"; do
        if update_user_password "$user" "$DB_PASSWORD"; then
            ((success_count++))
        fi
    done
    
    log_info "Password update summary: $success_count/$total_count users updated"
    
    if [ $success_count -eq $total_count ]; then
        log_success "All Supabase user passwords updated successfully!"
        
        # Verify a few key users can connect
        log_info "Verifying user connections..."
        
        local test_users=("supabase_auth_admin" "supabase_storage_admin")
        for test_user in "${test_users[@]}"; do
            if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$test_user" -d "$DB_NAME" -c "SELECT current_user;" >/dev/null 2>&1; then
                log_success "Verified connection for: $test_user"
            else
                log_warning "Could not verify connection for: $test_user"
            fi
        done
        
        exit 0
    else
        log_error "Some password updates failed"
        exit 1
    fi
}

# Run main function
main "$@"