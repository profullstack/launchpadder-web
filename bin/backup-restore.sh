#!/bin/bash

# LaunchPadder Backup and Restore Script
# This script handles backup and restore operations for the entire Docker application
# including PostgreSQL database, storage files, and configuration data.

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"

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

# Check if Docker and Docker Compose are available
check_dependencies() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi

    if ! command -v docker compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
}

# Load environment variables
load_env() {
    if [[ -f "${PROJECT_DIR}/.env" ]]; then
        log_info "Loading environment variables from .env file"
        set -a
        source "${PROJECT_DIR}/.env"
        set +a
    else
        log_warning "No .env file found. Using default values."
        # Set default values
        export POSTGRES_DB="${POSTGRES_DB:-postgres}"
        export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
        export POSTGRES_HOST="${POSTGRES_HOST:-db}"
        export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
    fi
}

# Check if services are running
check_services() {
    log_info "Checking if Docker services are running..."
    
    if ! docker compose -f "$COMPOSE_FILE" ps --services --filter "status=running" | grep -q "db"; then
        log_warning "Database service is not running. Starting services..."
        docker compose -f "$COMPOSE_FILE" up -d db
        
        # Wait for database to be ready
        log_info "Waiting for database to be ready..."
        timeout 60 bash -c 'until docker compose -f "$1" exec db pg_isready -U postgres -h localhost; do sleep 2; done' _ "$COMPOSE_FILE"
    fi
}

# Create backup directory
create_backup_dir() {
    local backup_path="$1"
    mkdir -p "$backup_path"
    log_info "Created backup directory: $backup_path"
}

# Backup PostgreSQL database
backup_database() {
    local backup_path="$1"
    local db_backup_file="${backup_path}/database.sql"
    
    log_info "Backing up PostgreSQL database..."
    
    # Backup main database
    docker compose -f "$COMPOSE_FILE" exec -T db pg_dump \
        -U postgres \
        -h localhost \
        --clean \
        --if-exists \
        --create \
        --verbose \
        "$POSTGRES_DB" > "$db_backup_file"
    
    # Backup _supabase database if it exists
    if docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -lqt | cut -d \| -f 1 | grep -qw "_supabase"; then
        local supabase_backup_file="${backup_path}/supabase_internal.sql"
        log_info "Backing up _supabase internal database..."
        docker compose -f "$COMPOSE_FILE" exec -T db pg_dump \
            -U postgres \
            -h localhost \
            --clean \
            --if-exists \
            --create \
            --verbose \
            "_supabase" > "$supabase_backup_file"
    fi
    
    # Backup global objects (roles, tablespaces, etc.)
    local globals_backup_file="${backup_path}/globals.sql"
    log_info "Backing up PostgreSQL global objects..."
    docker compose -f "$COMPOSE_FILE" exec -T db pg_dumpall \
        -U postgres \
        -h localhost \
        --globals-only \
        --verbose > "$globals_backup_file"
    
    log_success "Database backup completed"
}

# Backup storage files
backup_storage() {
    local backup_path="$1"
    local storage_backup_dir="${backup_path}/storage"
    
    log_info "Backing up storage files..."
    
    if [[ -d "${PROJECT_DIR}/volumes/storage" ]]; then
        mkdir -p "$storage_backup_dir"
        cp -r "${PROJECT_DIR}/volumes/storage"/* "$storage_backup_dir/" 2>/dev/null || true
        log_success "Storage files backup completed"
    else
        log_warning "Storage directory not found, skipping storage backup"
    fi
}

# Backup volumes and configuration
backup_volumes() {
    local backup_path="$1"
    local volumes_backup_dir="${backup_path}/volumes"
    
    log_info "Backing up volumes and configuration..."
    
    if [[ -d "${PROJECT_DIR}/volumes" ]]; then
        mkdir -p "$volumes_backup_dir"
        
        # Backup configuration files (excluding data directories)
        for dir in api db logs pooler functions; do
            if [[ -d "${PROJECT_DIR}/volumes/$dir" ]]; then
                mkdir -p "${volumes_backup_dir}/$dir"
                # Copy only configuration files, not data
                find "${PROJECT_DIR}/volumes/$dir" -type f \( -name "*.sql" -o -name "*.yml" -o -name "*.yaml" -o -name "*.exs" -o -name "*.ts" -o -name "*.js" \) \
                    -exec cp {} "${volumes_backup_dir}/$dir/" \; 2>/dev/null || true
            fi
        done
        
        log_success "Volumes backup completed"
    else
        log_warning "Volumes directory not found, skipping volumes backup"
    fi
}

# Create backup metadata
create_backup_metadata() {
    local backup_path="$1"
    local metadata_file="${backup_path}/backup_metadata.json"
    
    log_info "Creating backup metadata..."
    
    cat > "$metadata_file" << EOF
{
    "timestamp": "$TIMESTAMP",
    "date": "$(date -Iseconds)",
    "version": "1.0",
    "project": "launchpadder-web",
    "backup_type": "full",
    "database": {
        "postgres_version": "$(docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -t -c 'SELECT version();' | head -1 | xargs)",
        "databases": ["$POSTGRES_DB", "_supabase"]
    },
    "services": $(docker compose -f "$COMPOSE_FILE" ps --services | jq -R . | jq -s .),
    "volumes": ["storage", "db", "api", "logs", "pooler", "functions"]
}
EOF
    
    log_success "Backup metadata created"
}

# Perform full backup
perform_backup() {
    local backup_name="${1:-backup_$TIMESTAMP}"
    local backup_path="${BACKUP_DIR}/$backup_name"
    
    log_info "Starting backup process..."
    log_info "Backup will be saved to: $backup_path"
    
    create_backup_dir "$backup_path"
    check_services
    
    backup_database "$backup_path"
    backup_storage "$backup_path"
    backup_volumes "$backup_path"
    create_backup_metadata "$backup_path"
    
    # Create compressed archive
    local archive_file="${BACKUP_DIR}/${backup_name}.tar.gz"
    log_info "Creating compressed archive..."
    tar -czf "$archive_file" -C "$BACKUP_DIR" "$backup_name"
    
    # Remove uncompressed backup directory
    rm -rf "$backup_path"
    
    log_success "Backup completed successfully!"
    log_success "Backup archive: $archive_file"
    log_info "Backup size: $(du -h "$archive_file" | cut -f1)"
}

# Restore database
restore_database() {
    local backup_path="$1"
    
    log_info "Restoring PostgreSQL database..."
    
    # Stop services that depend on the database
    log_info "Stopping dependent services..."
    docker compose -f "$COMPOSE_FILE" stop web auth rest realtime storage meta functions analytics supavisor || true
    
    # Restore global objects first
    if [[ -f "${backup_path}/globals.sql" ]]; then
        log_info "Restoring global objects..."
        docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -h localhost < "${backup_path}/globals.sql" || true
    fi
    
    # Restore main database
    if [[ -f "${backup_path}/database.sql" ]]; then
        log_info "Restoring main database..."
        docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -h localhost < "${backup_path}/database.sql"
    fi
    
    # Restore _supabase database
    if [[ -f "${backup_path}/supabase_internal.sql" ]]; then
        log_info "Restoring _supabase internal database..."
        docker compose -f "$COMPOSE_FILE" exec -T db psql -U postgres -h localhost < "${backup_path}/supabase_internal.sql"
    fi
    
    log_success "Database restore completed"
}

# Restore storage files
restore_storage() {
    local backup_path="$1"
    local storage_backup_dir="${backup_path}/storage"
    
    log_info "Restoring storage files..."
    
    if [[ -d "$storage_backup_dir" ]]; then
        # Stop storage service
        docker compose -f "$COMPOSE_FILE" stop storage imgproxy || true
        
        # Backup existing storage (just in case)
        if [[ -d "${PROJECT_DIR}/volumes/storage" ]]; then
            mv "${PROJECT_DIR}/volumes/storage" "${PROJECT_DIR}/volumes/storage.backup.$(date +%s)" || true
        fi
        
        # Restore storage files
        mkdir -p "${PROJECT_DIR}/volumes/storage"
        cp -r "$storage_backup_dir"/* "${PROJECT_DIR}/volumes/storage/" 2>/dev/null || true
        
        log_success "Storage files restore completed"
    else
        log_warning "No storage backup found, skipping storage restore"
    fi
}

# Restore volumes and configuration
restore_volumes() {
    local backup_path="$1"
    local volumes_backup_dir="${backup_path}/volumes"
    
    log_info "Restoring volumes and configuration..."
    
    if [[ -d "$volumes_backup_dir" ]]; then
        # Restore configuration files
        for dir in api db logs pooler functions; do
            if [[ -d "${volumes_backup_dir}/$dir" ]]; then
                mkdir -p "${PROJECT_DIR}/volumes/$dir"
                cp -r "${volumes_backup_dir}/$dir"/* "${PROJECT_DIR}/volumes/$dir/" 2>/dev/null || true
            fi
        done
        
        log_success "Volumes restore completed"
    else
        log_warning "No volumes backup found, skipping volumes restore"
    fi
}

# Perform full restore
perform_restore() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log_info "Starting restore process..."
    log_info "Restoring from: $backup_file"
    
    # Extract backup archive
    local temp_dir=$(mktemp -d)
    local backup_name=$(basename "$backup_file" .tar.gz)
    
    log_info "Extracting backup archive..."
    tar -xzf "$backup_file" -C "$temp_dir"
    
    local backup_path="${temp_dir}/$backup_name"
    
    # Verify backup metadata
    if [[ -f "${backup_path}/backup_metadata.json" ]]; then
        log_info "Backup metadata found:"
        cat "${backup_path}/backup_metadata.json" | jq .
    else
        log_warning "No backup metadata found"
    fi
    
    # Confirm restore
    echo
    log_warning "This will overwrite all existing data!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restore cancelled"
        rm -rf "$temp_dir"
        exit 0
    fi
    
    check_services
    
    restore_volumes "$backup_path"
    restore_storage "$backup_path"
    restore_database "$backup_path"
    
    # Restart all services
    log_info "Restarting all services..."
    docker compose -f "$COMPOSE_FILE" up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Cleanup
    rm -rf "$temp_dir"
    
    log_success "Restore completed successfully!"
    log_info "All services have been restarted"
}

# List available backups
list_backups() {
    log_info "Available backups:"
    
    if [[ ! -d "$BACKUP_DIR" ]] || [[ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]]; then
        log_warning "No backups found in $BACKUP_DIR"
        return
    fi
    
    echo
    printf "%-30s %-20s %-10s\n" "BACKUP NAME" "DATE" "SIZE"
    printf "%-30s %-20s %-10s\n" "$(printf '%*s' 30 | tr ' ' '-')" "$(printf '%*s' 20 | tr ' ' '-')" "$(printf '%*s' 10 | tr ' ' '-')"
    
    for backup in "$BACKUP_DIR"/*.tar.gz; do
        if [[ -f "$backup" ]]; then
            local name=$(basename "$backup" .tar.gz)
            local date=$(stat -c %y "$backup" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
            local size=$(du -h "$backup" 2>/dev/null | cut -f1 || echo "unknown")
            printf "%-30s %-20s %-10s\n" "$name" "$date" "$size"
        fi
    done
    echo
}

# Show usage information
show_usage() {
    cat << EOF
LaunchPadder Backup and Restore Script

USAGE:
    $0 <command> [options]

COMMANDS:
    backup [name]           Create a full backup of the application
                           Optional: specify backup name (default: backup_TIMESTAMP)
    
    restore <backup_file>   Restore from a backup file
                           Required: path to backup .tar.gz file
    
    list                   List all available backups
    
    help                   Show this help message

EXAMPLES:
    $0 backup                           # Create backup with timestamp
    $0 backup my_backup                 # Create backup with custom name
    $0 restore backups/backup_20240101_120000.tar.gz
    $0 list                            # List all backups

BACKUP INCLUDES:
    - PostgreSQL databases (main + _supabase)
    - Storage files (uploads, etc.)
    - Configuration files
    - Volume data

NOTES:
    - Backups are stored in: $BACKUP_DIR
    - Database service must be running for backup/restore
    - Restore will overwrite existing data
    - Services will be restarted during restore

EOF
}

# Main script logic
main() {
    check_dependencies
    load_env
    
    case "${1:-}" in
        backup)
            perform_backup "${2:-}"
            ;;
        restore)
            if [[ -z "${2:-}" ]]; then
                log_error "Backup file path is required for restore"
                show_usage
                exit 1
            fi
            perform_restore "$2"
            ;;
        list)
            list_backups
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            log_error "Invalid command: ${1:-}"
            echo
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"