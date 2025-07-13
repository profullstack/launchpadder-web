#!/bin/bash

# LaunchPadder Docker Deployment Script
# This script automates the setup and deployment of LaunchPadder with self-hosted Supabase

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
ENV_FILE="$PROJECT_DIR/.env"
ENV_EXAMPLE="$PROJECT_DIR/.env.example"

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
    log_info "Checking dependencies..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_warning "pnpm is not installed. Installing pnpm..."
        npm install -g pnpm
    fi
    
    # Check OpenSSL
    if ! command -v openssl &> /dev/null; then
        log_error "OpenSSL is not installed. Please install OpenSSL first."
        exit 1
    fi
    
    log_success "All dependencies are available"
}

generate_jwt_keys() {
    log_info "Generating JWT keys..."
    
    # Generate JWT secret
    JWT_SECRET=$(openssl rand -base64 32)
    
    # Generate anon key (valid for 10 years)
    ANON_PAYLOAD='{"role":"anon","iss":"supabase","iat":1640995200,"exp":1956441600}'
    ANON_KEY=$(echo -n "$ANON_PAYLOAD" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64 | tr -d '\n')
    
    # Generate service role key (valid for 10 years)
    SERVICE_PAYLOAD='{"role":"service_role","iss":"supabase","iat":1640995200,"exp":1956441600}'
    SERVICE_ROLE_KEY=$(echo -n "$SERVICE_PAYLOAD" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64 | tr -d '\n')
    
    log_success "JWT keys generated successfully"
}

create_env_file() {
    log_info "Creating environment file..."
    
    if [[ -f "$ENV_FILE" ]]; then
        log_warning "Environment file already exists. Creating backup..."
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Copy example file
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    
    # Generate secure passwords
    POSTGRES_PASSWORD=$(openssl rand -base64 32)
    DASHBOARD_PASSWORD=$(openssl rand -base64 16)
    
    # Update environment file with generated values
    sed -i.bak \
        -e "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" \
        -e "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" \
        -e "s/ANON_KEY=.*/ANON_KEY=$ANON_KEY/" \
        -e "s/SERVICE_ROLE_KEY=.*/SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY/" \
        -e "s/DASHBOARD_PASSWORD=.*/DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD/" \
        "$ENV_FILE"
    
    # Remove backup file
    rm "$ENV_FILE.bak"
    
    log_success "Environment file created with secure defaults"
    log_warning "Please update the following in $ENV_FILE:"
    echo "  - SMTP_* variables for email functionality"
    echo "  - OPENAI_API_KEY for AI features"
    echo "  - STRIPE_* variables for payments (optional)"
    echo "  - COINGECKO_API_KEY for crypto payments (optional)"
}

setup_directories() {
    log_info "Setting up directories..."
    
    # Create necessary directories
    mkdir -p "$PROJECT_DIR/docker/volumes/storage"
    mkdir -p "$PROJECT_DIR/docker/volumes/logs"
    
    # Set permissions
    chmod 755 "$PROJECT_DIR/docker/volumes/storage"
    chmod 755 "$PROJECT_DIR/docker/volumes/logs"
    
    log_success "Directories created successfully"
}

install_dependencies() {
    log_info "Installing Node.js dependencies..."
    
    cd "$PROJECT_DIR"
    pnpm install
    
    log_success "Dependencies installed successfully"
}

start_services() {
    log_info "Starting Docker services..."
    
    cd "$PROJECT_DIR"
    
    # Pull latest images
    docker-compose pull
    
    # Start services
    docker-compose up -d
    
    log_success "Docker services started successfully"
}

wait_for_services() {
    log_info "Waiting for services to be ready..."
    
    # Wait for database
    log_info "Waiting for database..."
    timeout=60
    while ! docker-compose exec -T db pg_isready -U postgres &> /dev/null; do
        sleep 2
        timeout=$((timeout - 2))
        if [[ $timeout -le 0 ]]; then
            log_error "Database failed to start within 60 seconds"
            exit 1
        fi
    done
    
    # Wait for Kong
    log_info "Waiting for API gateway..."
    timeout=60
    while ! curl -s http://localhost:8000/health &> /dev/null; do
        sleep 2
        timeout=$((timeout - 2))
        if [[ $timeout -le 0 ]]; then
            log_error "API gateway failed to start within 60 seconds"
            exit 1
        fi
    done
    
    log_success "All services are ready"
}

run_migrations() {
    log_info "Running database migrations..."
    
    cd "$PROJECT_DIR"
    
    # Run migrations
    pnpm run db:migrate
    
    log_success "Database migrations completed successfully"
}

show_status() {
    log_info "Deployment Status:"
    echo ""
    
    # Show service status
    docker-compose ps
    echo ""
    
    # Show access URLs
    log_success "LaunchPadder is now running!"
    echo ""
    echo "Access URLs:"
    echo "  🚀 LaunchPadder Web:    http://localhost:3000"
    echo "  🎛️  Supabase Studio:    http://localhost:3001"
    echo "  🔌 API Gateway:        http://localhost:8000"
    echo "  📊 Vector Logs:        http://localhost:9001"
    echo ""
    echo "Credentials:"
    echo "  📧 Dashboard User:     admin"
    echo "  🔑 Dashboard Pass:     $(grep DASHBOARD_PASSWORD "$ENV_FILE" | cut -d'=' -f2)"
    echo ""
    echo "Next Steps:"
    echo "  1. Update email settings in .env file"
    echo "  2. Add your OpenAI API key to .env file"
    echo "  3. Configure payment providers (optional)"
    echo "  4. Visit http://localhost:3000 to start using LaunchPadder"
    echo ""
    echo "Management Commands:"
    echo "  📋 View logs:          docker-compose logs -f"
    echo "  🔄 Restart services:   docker-compose restart"
    echo "  🛑 Stop services:      docker-compose down"
    echo "  💾 Backup database:    docker-compose exec -T db pg_dump -U postgres launchpadder > backup.sql"
}

cleanup_on_error() {
    log_error "Deployment failed. Cleaning up..."
    docker-compose down 2>/dev/null || true
    exit 1
}

# Main deployment function
main() {
    echo ""
    log_info "🚀 LaunchPadder Docker Deployment Script"
    echo ""
    
    # Set error trap
    trap cleanup_on_error ERR
    
    # Run deployment steps
    check_dependencies
    generate_jwt_keys
    create_env_file
    setup_directories
    install_dependencies
    start_services
    wait_for_services
    run_migrations
    show_status
    
    log_success "🎉 LaunchPadder deployment completed successfully!"
}

# Parse command line arguments
case "${1:-}" in
    "start")
        log_info "Starting LaunchPadder services..."
        cd "$PROJECT_DIR"
        docker-compose up -d
        log_success "Services started"
        ;;
    "stop")
        log_info "Stopping LaunchPadder services..."
        cd "$PROJECT_DIR"
        docker-compose down
        log_success "Services stopped"
        ;;
    "restart")
        log_info "Restarting LaunchPadder services..."
        cd "$PROJECT_DIR"
        docker-compose restart
        log_success "Services restarted"
        ;;
    "logs")
        cd "$PROJECT_DIR"
        docker-compose logs -f
        ;;
    "status")
        cd "$PROJECT_DIR"
        docker-compose ps
        ;;
    "backup")
        log_info "Creating database backup..."
        cd "$PROJECT_DIR"
        BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
        docker-compose exec -T db pg_dump -U postgres launchpadder > "$BACKUP_FILE"
        log_success "Database backup created: $BACKUP_FILE"
        ;;
    "update")
        log_info "Updating LaunchPadder..."
        cd "$PROJECT_DIR"
        git pull
        pnpm install
        docker-compose pull
        docker-compose up -d --build
        pnpm run db:migrate
        log_success "LaunchPadder updated successfully"
        ;;
    "help"|"-h"|"--help")
        echo "LaunchPadder Docker Deployment Script"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  (no command)  - Full deployment setup"
        echo "  start         - Start services"
        echo "  stop          - Stop services"
        echo "  restart       - Restart services"
        echo "  logs          - View logs"
        echo "  status        - Show service status"
        echo "  backup        - Create database backup"
        echo "  update        - Update LaunchPadder"
        echo "  help          - Show this help"
        ;;
    "")
        main
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac