#!/bin/bash

# LaunchPadder Production Deployment Script
# Comprehensive production deployment with zero-downtime rolling updates

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
COMPOSE_FILE="$PROJECT_DIR/docker-compose.production.yml"
ENV_FILE="$PROJECT_DIR/.env.production"
BACKUP_BEFORE_DEPLOY="${BACKUP_BEFORE_DEPLOY:-true}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-120}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-true}"

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

check_prerequisites() {
    log_info "Checking deployment prerequisites..."
    
    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root"
        exit 1
    fi
    
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
    
    # Check if in correct directory
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_error "Production compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    # Check environment file
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Production environment file not found: $ENV_FILE"
        log_info "Please copy .env.production.example to .env.production and configure it"
        exit 1
    fi
    
    # Check SSL certificates
    if [[ ! -f "$PROJECT_DIR/docker/ssl/launchpadder.crt" ]]; then
        log_warning "SSL certificates not found. Run ./scripts/setup-ssl.sh first"
    fi
    
    log_success "Prerequisites check completed"
}

validate_environment() {
    log_info "Validating environment configuration..."
    
    # Source environment file
    set -a
    source "$ENV_FILE"
    set +a
    
    # Check required variables
    local required_vars=(
        "SITE_URL"
        "POSTGRES_PASSWORD"
        "JWT_SECRET"
        "ANON_KEY"
        "SERVICE_ROLE_KEY"
    )
    
    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        printf '%s\n' "${missing_vars[@]}"
        exit 1
    fi
    
    # Validate URL format
    if [[ ! "$SITE_URL" =~ ^https?:// ]]; then
        log_error "SITE_URL must include protocol (http:// or https://)"
        exit 1
    fi
    
    # Check JWT secret length
    if [[ ${#JWT_SECRET} -lt 32 ]]; then
        log_error "JWT_SECRET must be at least 32 characters long"
        exit 1
    fi
    
    log_success "Environment validation completed"
}

create_backup() {
    if [[ "$BACKUP_BEFORE_DEPLOY" != "true" ]]; then
        log_info "Backup before deploy is disabled, skipping..."
        return 0
    fi
    
    log_info "Creating pre-deployment backup..."
    
    if [[ -f "$PROJECT_DIR/scripts/backup-production.sh" ]]; then
        "$PROJECT_DIR/scripts/backup-production.sh" --dir "$PROJECT_DIR/backups/pre-deploy"
        log_success "Pre-deployment backup created"
    else
        log_warning "Backup script not found, skipping backup"
    fi
}

pull_latest_images() {
    log_info "Pulling latest Docker images..."
    
    docker-compose -f "$COMPOSE_FILE" pull
    
    log_success "Docker images updated"
}

run_database_migrations() {
    log_info "Running database migrations..."
    
    # Ensure database is running
    docker-compose -f "$COMPOSE_FILE" up -d db
    
    # Wait for database to be ready
    local timeout=60
    while ! docker-compose -f "$COMPOSE_FILE" exec -T db pg_isready -U postgres &> /dev/null; do
        sleep 2
        timeout=$((timeout - 2))
        if [[ $timeout -le 0 ]]; then
            log_error "Database failed to start within 60 seconds"
            exit 1
        fi
    done
    
    # Run migrations
    if command -v pnpm &> /dev/null; then
        pnpm run db:migrate
    else
        npm run db:migrate
    fi
    
    log_success "Database migrations completed"
}

health_check() {
    local service="$1"
    local url="$2"
    local timeout="${3:-60}"
    
    log_info "Performing health check for $service..."
    
    local count=0
    while [[ $count -lt $timeout ]]; do
        if curl -f -s "$url" > /dev/null 2>&1; then
            log_success "$service health check passed"
            return 0
        fi
        
        sleep 2
        count=$((count + 2))
        
        if [[ $((count % 20)) -eq 0 ]]; then
            log_info "Still waiting for $service to be healthy... (${count}s/${timeout}s)"
        fi
    done
    
    log_error "$service health check failed after ${timeout}s"
    return 1
}

deploy_with_zero_downtime() {
    log_info "Starting zero-downtime deployment..."
    
    # Get current running instances
    local running_instances=($(docker-compose -f "$COMPOSE_FILE" ps -q web-1 web-2 2>/dev/null || true))
    
    if [[ ${#running_instances[@]} -eq 0 ]]; then
        log_info "No running instances found, performing initial deployment..."
        docker-compose -f "$COMPOSE_FILE" up -d
        
        # Wait for services to be healthy
        sleep 30
        health_check "web-1" "http://localhost:3000/api/health" "$HEALTH_CHECK_TIMEOUT"
        health_check "web-2" "http://localhost:3000/api/health" "$HEALTH_CHECK_TIMEOUT"
        
        return 0
    fi
    
    log_info "Performing rolling update..."
    
    # Update web-1 first
    log_info "Updating web-1..."
    docker-compose -f "$COMPOSE_FILE" up -d --no-deps web-1
    
    # Wait for web-1 to be healthy
    sleep 30
    if ! health_check "web-1" "http://localhost:3000/api/health" "$HEALTH_CHECK_TIMEOUT"; then
        log_error "web-1 failed health check during deployment"
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            rollback_deployment
        fi
        exit 1
    fi
    
    # Update web-2
    log_info "Updating web-2..."
    docker-compose -f "$COMPOSE_FILE" up -d --no-deps web-2
    
    # Wait for web-2 to be healthy
    sleep 30
    if ! health_check "web-2" "http://localhost:3000/api/health" "$HEALTH_CHECK_TIMEOUT"; then
        log_error "web-2 failed health check during deployment"
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            rollback_deployment
        fi
        exit 1
    fi
    
    # Update other services
    log_info "Updating supporting services..."
    docker-compose -f "$COMPOSE_FILE" up -d
    
    log_success "Zero-downtime deployment completed"
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check all services are running
    local failed_services=()
    local services=("nginx" "web-1" "web-2" "db" "redis" "kong")
    
    for service in "${services[@]}"; do
        if ! docker-compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up"; then
            failed_services+=("$service")
        fi
    done
    
    if [[ ${#failed_services[@]} -gt 0 ]]; then
        log_error "The following services are not running:"
        printf '%s\n' "${failed_services[@]}"
        return 1
    fi
    
    # Test external access
    local site_url=$(grep "^SITE_URL=" "$ENV_FILE" | cut -d'=' -f2)
    if [[ -n "$site_url" ]]; then
        if ! health_check "external-access" "$site_url/api/health" 30; then
            log_error "External health check failed"
            return 1
        fi
    fi
    
    # Test load balancing
    log_info "Testing load balancing..."
    local instance_ids=()
    for i in {1..10}; do
        local response=$(curl -s "$site_url/api/health" 2>/dev/null || echo '{}')
        local instance_id=$(echo "$response" | jq -r '.system.instanceId // "unknown"' 2>/dev/null || echo "unknown")
        instance_ids+=("$instance_id")
    done
    
    local unique_instances=($(printf '%s\n' "${instance_ids[@]}" | sort -u))
    if [[ ${#unique_instances[@]} -gt 1 ]]; then
        log_success "Load balancing is working (instances: ${unique_instances[*]})"
    else
        log_warning "Load balancing may not be working properly"
    fi
    
    log_success "Deployment verification completed"
}

rollback_deployment() {
    log_warning "Rolling back deployment..."
    
    # Find the most recent backup
    local backup_dir="$PROJECT_DIR/backups/pre-deploy"
    local latest_backup=$(find "$backup_dir" -name "launchpadder_backup_*.tar.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    
    if [[ -n "$latest_backup" && -f "$latest_backup" ]]; then
        log_info "Restoring from backup: $latest_backup"
        
        # Stop current services
        docker-compose -f "$COMPOSE_FILE" down
        
        # Restore backup (if restore script exists)
        if [[ -f "$PROJECT_DIR/scripts/restore-production.sh" ]]; then
            "$PROJECT_DIR/scripts/restore-production.sh" "$latest_backup"
        else
            log_error "Restore script not found, manual rollback required"
            exit 1
        fi
        
        # Restart services
        docker-compose -f "$COMPOSE_FILE" up -d
        
        log_success "Rollback completed"
    else
        log_error "No backup found for rollback, manual intervention required"
        exit 1
    fi
}

cleanup_old_images() {
    log_info "Cleaning up old Docker images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old images (keep last 3 versions)
    docker images --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}\t{{.ID}}" | \
    grep "launchpadder" | \
    tail -n +4 | \
    awk '{print $3}' | \
    xargs -r docker rmi 2>/dev/null || true
    
    log_success "Docker cleanup completed"
}

send_deployment_notification() {
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
                    \"title\": \"LaunchPadder Production Deployment\",
                    \"text\": \"$message\",
                    \"fields\": [{
                        \"title\": \"Environment\",
                        \"value\": \"Production\",
                        \"short\": true
                    }, {
                        \"title\": \"Timestamp\",
                        \"value\": \"$(date -Iseconds)\",
                        \"short\": true
                    }, {
                        \"title\": \"Version\",
                        \"value\": \"$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')\",
                        \"short\": true
                    }]
                }]
            }" 2>/dev/null || true
    fi
}

show_deployment_summary() {
    echo ""
    log_success "🚀 LaunchPadder Production Deployment Completed!"
    echo ""
    
    local site_url=$(grep "^SITE_URL=" "$ENV_FILE" | cut -d'=' -f2)
    
    echo "📊 Deployment Summary:"
    echo "  🌐 Application URL: $site_url"
    echo "  📈 Monitoring: $site_url/grafana/"
    echo "  🔍 Metrics: $site_url/prometheus/"
    echo "  ❤️  Health Check: $site_url/api/health"
    echo ""
    
    echo "🔧 Management Commands:"
    echo "  📋 View logs: docker-compose -f docker-compose.production.yml logs -f"
    echo "  🔄 Restart: docker-compose -f docker-compose.production.yml restart"
    echo "  🛑 Stop: docker-compose -f docker-compose.production.yml down"
    echo "  💾 Backup: ./scripts/backup-production.sh"
    echo ""
    
    echo "📱 Service Status:"
    docker-compose -f "$COMPOSE_FILE" ps
}

show_usage() {
    echo "LaunchPadder Production Deployment Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --no-backup         Skip pre-deployment backup"
    echo "  --no-rollback       Disable automatic rollback on failure"
    echo "  --timeout SECONDS   Health check timeout (default: 120)"
    echo "  --force             Skip confirmation prompts"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  BACKUP_BEFORE_DEPLOY    Create backup before deployment (default: true)"
    echo "  HEALTH_CHECK_TIMEOUT    Health check timeout in seconds (default: 120)"
    echo "  ROLLBACK_ON_FAILURE     Enable automatic rollback (default: true)"
    echo "  SLACK_WEBHOOK           Slack webhook URL for notifications"
}

# Parse command line arguments
FORCE_DEPLOY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-backup)
            BACKUP_BEFORE_DEPLOY=false
            shift
            ;;
        --no-rollback)
            ROLLBACK_ON_FAILURE=false
            shift
            ;;
        --timeout)
            HEALTH_CHECK_TIMEOUT="$2"
            shift 2
            ;;
        --force)
            FORCE_DEPLOY=true
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

# Main deployment function
main() {
    echo ""
    log_info "🚀 LaunchPadder Production Deployment"
    echo ""
    
    # Confirmation prompt
    if [[ "$FORCE_DEPLOY" != "true" ]]; then
        echo "This will deploy LaunchPadder to production."
        echo "Current git commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
        echo ""
        read -p "Are you sure you want to continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi
    
    # Set error trap
    trap 'send_deployment_notification "error" "Deployment failed with error"; exit 1' ERR
    
    local start_time=$(date +%s)
    
    # Deployment steps
    check_prerequisites
    validate_environment
    create_backup
    pull_latest_images
    run_database_migrations
    deploy_with_zero_downtime
    verify_deployment
    cleanup_old_images
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    show_deployment_summary
    
    send_deployment_notification "success" "Deployment completed successfully in ${duration}s"
    
    log_success "🎉 Production deployment completed in ${duration}s!"
}

main "$@"