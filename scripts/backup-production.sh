#!/bin/bash

# Production Backup Script for LaunchPadder
# Creates comprehensive backups of database, files, and configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="launchpadder_backup_$TIMESTAMP"

# AWS S3 Configuration (optional)
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Functions
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

check_dependencies() {
    log_info "Checking backup dependencies..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check AWS CLI if S3 backup is enabled
    if [[ -n "$S3_BUCKET" ]] && ! command -v aws &> /dev/null; then
        log_warning "AWS CLI not found. S3 backup will be skipped."
        S3_BUCKET=""
    fi
    
    log_success "Dependencies check completed"
}

create_backup_directory() {
    log_info "Creating backup directory..."
    
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
    chmod 755 "$BACKUP_DIR/$BACKUP_NAME"
    
    log_success "Backup directory created: $BACKUP_DIR/$BACKUP_NAME"
}

backup_database() {
    log_info "Backing up PostgreSQL database..."
    
    local db_backup_file="$BACKUP_DIR/$BACKUP_NAME/database.sql"
    local db_backup_compressed="$BACKUP_DIR/$BACKUP_NAME/database.sql.gz"
    
    # Create database backup
    docker-compose -f "$PROJECT_DIR/docker-compose.production.yml" exec -T db \
        pg_dump -U postgres -h localhost launchpadder > "$db_backup_file"
    
    # Compress the backup
    gzip "$db_backup_file"
    
    # Verify backup
    if [[ -f "$db_backup_compressed" ]]; then
        local backup_size=$(du -h "$db_backup_compressed" | cut -f1)
        log_success "Database backup completed: $backup_size"
    else
        log_error "Database backup failed"
        exit 1
    fi
}

backup_redis() {
    log_info "Backing up Redis data..."
    
    local redis_backup_dir="$BACKUP_DIR/$BACKUP_NAME/redis"
    mkdir -p "$redis_backup_dir"
    
    # Create Redis backup
    docker-compose -f "$PROJECT_DIR/docker-compose.production.yml" exec -T redis \
        redis-cli --rdb /data/dump.rdb
    
    # Copy Redis data
    docker cp $(docker-compose -f "$PROJECT_DIR/docker-compose.production.yml" ps -q redis):/data/dump.rdb \
        "$redis_backup_dir/dump.rdb"
    
    if [[ -f "$redis_backup_dir/dump.rdb" ]]; then
        local backup_size=$(du -h "$redis_backup_dir/dump.rdb" | cut -f1)
        log_success "Redis backup completed: $backup_size"
    else
        log_warning "Redis backup may have failed"
    fi
}

backup_uploads() {
    log_info "Backing up uploaded files..."
    
    local uploads_backup_dir="$BACKUP_DIR/$BACKUP_NAME/uploads"
    local uploads_source="$PROJECT_DIR/docker/volumes/uploads"
    
    if [[ -d "$uploads_source" ]]; then
        mkdir -p "$uploads_backup_dir"
        cp -r "$uploads_source"/* "$uploads_backup_dir/" 2>/dev/null || true
        
        if [[ -n "$(ls -A "$uploads_backup_dir" 2>/dev/null)" ]]; then
            local backup_size=$(du -sh "$uploads_backup_dir" | cut -f1)
            log_success "Uploads backup completed: $backup_size"
        else
            log_info "No uploads to backup"
        fi
    else
        log_info "Uploads directory not found, skipping..."
    fi
}

backup_ssl_certificates() {
    log_info "Backing up SSL certificates..."
    
    local ssl_backup_dir="$BACKUP_DIR/$BACKUP_NAME/ssl"
    local ssl_source="$PROJECT_DIR/docker/ssl"
    
    if [[ -d "$ssl_source" ]]; then
        mkdir -p "$ssl_backup_dir"
        cp -r "$ssl_source"/* "$ssl_backup_dir/" 2>/dev/null || true
        
        if [[ -n "$(ls -A "$ssl_backup_dir" 2>/dev/null)" ]]; then
            log_success "SSL certificates backup completed"
        else
            log_info "No SSL certificates to backup"
        fi
    else
        log_info "SSL directory not found, skipping..."
    fi
}

backup_configuration() {
    log_info "Backing up configuration files..."
    
    local config_backup_dir="$BACKUP_DIR/$BACKUP_NAME/config"
    mkdir -p "$config_backup_dir"
    
    # Backup environment files (excluding sensitive data)
    if [[ -f "$PROJECT_DIR/.env.production" ]]; then
        # Create sanitized version of env file
        grep -v -E "(PASSWORD|SECRET|KEY)" "$PROJECT_DIR/.env.production" > "$config_backup_dir/env.production.sanitized" || true
    fi
    
    # Backup Docker configurations
    cp "$PROJECT_DIR/docker-compose.production.yml" "$config_backup_dir/" 2>/dev/null || true
    cp "$PROJECT_DIR/Dockerfile.production" "$config_backup_dir/" 2>/dev/null || true
    
    # Backup Nginx configuration
    if [[ -d "$PROJECT_DIR/docker/nginx" ]]; then
        cp -r "$PROJECT_DIR/docker/nginx" "$config_backup_dir/" 2>/dev/null || true
    fi
    
    # Backup monitoring configuration
    if [[ -d "$PROJECT_DIR/docker/prometheus" ]]; then
        cp -r "$PROJECT_DIR/docker/prometheus" "$config_backup_dir/" 2>/dev/null || true
    fi
    
    log_success "Configuration backup completed"
}

create_backup_manifest() {
    log_info "Creating backup manifest..."
    
    local manifest_file="$BACKUP_DIR/$BACKUP_NAME/manifest.json"
    
    cat > "$manifest_file" << EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$TIMESTAMP",
  "date": "$(date -Iseconds)",
  "version": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "environment": "production",
  "components": {
    "database": $([ -f "$BACKUP_DIR/$BACKUP_NAME/database.sql.gz" ] && echo "true" || echo "false"),
    "redis": $([ -f "$BACKUP_DIR/$BACKUP_NAME/redis/dump.rdb" ] && echo "true" || echo "false"),
    "uploads": $([ -d "$BACKUP_DIR/$BACKUP_NAME/uploads" ] && echo "true" || echo "false"),
    "ssl": $([ -d "$BACKUP_DIR/$BACKUP_NAME/ssl" ] && echo "true" || echo "false"),
    "config": $([ -d "$BACKUP_DIR/$BACKUP_NAME/config" ] && echo "true" || echo "false")
  },
  "backup_size": "$(du -sh "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)",
  "retention_until": "$(date -d "+$BACKUP_RETENTION_DAYS days" -Iseconds)"
}
EOF
    
    log_success "Backup manifest created"
}

compress_backup() {
    log_info "Compressing backup archive..."
    
    cd "$BACKUP_DIR"
    tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
    
    if [[ -f "$BACKUP_NAME.tar.gz" ]]; then
        local compressed_size=$(du -h "$BACKUP_NAME.tar.gz" | cut -f1)
        log_success "Backup compressed: $compressed_size"
        
        # Remove uncompressed directory
        rm -rf "$BACKUP_NAME"
    else
        log_error "Backup compression failed"
        exit 1
    fi
}

upload_to_s3() {
    if [[ -z "$S3_BUCKET" ]]; then
        log_info "S3 backup not configured, skipping upload"
        return 0
    fi
    
    log_info "Uploading backup to S3..."
    
    local backup_file="$BACKUP_DIR/$BACKUP_NAME.tar.gz"
    local s3_key="backups/$(date +%Y/%m/%d)/$BACKUP_NAME.tar.gz"
    
    if aws s3 cp "$backup_file" "s3://$S3_BUCKET/$s3_key" --region "$AWS_REGION"; then
        log_success "Backup uploaded to S3: s3://$S3_BUCKET/$s3_key"
    else
        log_error "S3 upload failed"
        return 1
    fi
}

cleanup_old_backups() {
    log_info "Cleaning up old backups..."
    
    # Remove local backups older than retention period
    find "$BACKUP_DIR" -name "launchpadder_backup_*.tar.gz" -mtime +$BACKUP_RETENTION_DAYS -delete 2>/dev/null || true
    
    # Clean up S3 backups if configured
    if [[ -n "$S3_BUCKET" ]]; then
        local cutoff_date=$(date -d "-$BACKUP_RETENTION_DAYS days" +%Y-%m-%d)
        aws s3 ls "s3://$S3_BUCKET/backups/" --recursive | \
        awk '$1 < "'$cutoff_date'" {print $4}' | \
        while read -r key; do
            aws s3 rm "s3://$S3_BUCKET/$key" --region "$AWS_REGION" || true
        done
    fi
    
    log_success "Old backups cleaned up"
}

verify_backup() {
    log_info "Verifying backup integrity..."
    
    local backup_file="$BACKUP_DIR/$BACKUP_NAME.tar.gz"
    
    # Test archive integrity
    if tar -tzf "$backup_file" >/dev/null 2>&1; then
        log_success "Backup archive integrity verified"
    else
        log_error "Backup archive is corrupted"
        exit 1
    fi
    
    # Check minimum size (should be at least 1MB)
    local backup_size_bytes=$(stat -c%s "$backup_file")
    if [[ $backup_size_bytes -gt 1048576 ]]; then
        log_success "Backup size check passed"
    else
        log_warning "Backup size is suspiciously small: $(du -h "$backup_file" | cut -f1)"
    fi
}

send_notification() {
    local status="$1"
    local message="$2"
    
    # Send Slack notification if webhook is configured
    if [[ -n "${SLACK_WEBHOOK:-}" ]]; then
        local color="good"
        [[ "$status" == "error" ]] && color="danger"
        [[ "$status" == "warning" ]] && color="warning"
        
        curl -X POST "$SLACK_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"LaunchPadder Backup $status\",
                    \"text\": \"$message\",
                    \"fields\": [{
                        \"title\": \"Backup Name\",
                        \"value\": \"$BACKUP_NAME\",
                        \"short\": true
                    }, {
                        \"title\": \"Timestamp\",
                        \"value\": \"$(date -Iseconds)\",
                        \"short\": true
                    }]
                }]
            }" 2>/dev/null || true
    fi
}

show_usage() {
    echo "Production Backup Script for LaunchPadder"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -d, --dir DIR           Backup directory (default: ./backups)"
    echo "  -r, --retention DAYS    Retention period in days (default: 30)"
    echo "  -s, --s3-bucket BUCKET  S3 bucket for remote backup"
    echo "  -n, --no-compress       Skip compression"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  BACKUP_DIR              Backup directory"
    echo "  BACKUP_RETENTION_DAYS   Retention period"
    echo "  BACKUP_S3_BUCKET        S3 bucket name"
    echo "  AWS_REGION              AWS region"
    echo "  SLACK_WEBHOOK           Slack webhook URL for notifications"
}

# Parse command line arguments
COMPRESS_BACKUP=true

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        -r|--retention)
            BACKUP_RETENTION_DAYS="$2"
            shift 2
            ;;
        -s|--s3-bucket)
            S3_BUCKET="$2"
            shift 2
            ;;
        -n|--no-compress)
            COMPRESS_BACKUP=false
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main backup function
main() {
    echo ""
    log_info "🗄️  LaunchPadder Production Backup"
    log_info "Backup name: $BACKUP_NAME"
    log_info "Backup directory: $BACKUP_DIR"
    log_info "Retention: $BACKUP_RETENTION_DAYS days"
    echo ""
    
    # Set error trap
    trap 'send_notification "error" "Backup failed with error"; exit 1' ERR
    
    local start_time=$(date +%s)
    
    check_dependencies
    create_backup_directory
    backup_database
    backup_redis
    backup_uploads
    backup_ssl_certificates
    backup_configuration
    create_backup_manifest
    
    if [[ "$COMPRESS_BACKUP" == "true" ]]; then
        compress_backup
        verify_backup
    fi
    
    upload_to_s3
    cleanup_old_backups
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local backup_size=$(du -h "$BACKUP_DIR/$BACKUP_NAME"* | tail -1 | cut -f1)
    
    log_success "🎉 Backup completed successfully!"
    echo ""
    log_info "Backup Details:"
    echo "  📁 Location: $BACKUP_DIR/$BACKUP_NAME*"
    echo "  📊 Size: $backup_size"
    echo "  ⏱️  Duration: ${duration}s"
    echo "  🗓️  Retention: $(date -d "+$BACKUP_RETENTION_DAYS days" +"%Y-%m-%d")"
    
    send_notification "success" "Backup completed successfully. Size: $backup_size, Duration: ${duration}s"
}

main "$@"