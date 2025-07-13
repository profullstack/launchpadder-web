#!/bin/bash

# LaunchPadder - Dedicated Server Deployment Script
# This script deploys the application to a dedicated server with nginx proxy

set -euo pipefail

# Configuration
APP_NAME="launchpadder"
APP_PORT="${APP_PORT:-3000}"
APP_USER="${APP_USER:-launchpadder}"
APP_DIR="${APP_DIR:-/opt/launchpadder}"
NODE_ENV="${NODE_ENV:-production}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/launchpadder}"

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

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $NODE_VERSION -lt 20 ]]; then
        log_error "Node.js version 20 or higher is required (current: $(node --version))"
        exit 1
    fi
    
    # Check if pnpm is installed
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed. Install with: npm install -g pnpm"
        exit 1
    fi
    
    # Check if pm2 is installed
    if ! command -v pm2 &> /dev/null; then
        log_warning "pm2 is not installed. Installing..."
        npm install -g pm2
    fi
    
    log_success "Prerequisites check passed"
}

# Create backup
create_backup() {
    log_info "Creating backup..."
    
    if [[ -d "$APP_DIR" ]]; then
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"
        
        mkdir -p "$BACKUP_DIR"
        cp -r "$APP_DIR" "$BACKUP_PATH"
        
        # Keep only last 5 backups
        cd "$BACKUP_DIR"
        ls -t | tail -n +6 | xargs -r rm -rf
        
        log_success "Backup created at $BACKUP_PATH"
    else
        log_info "No existing installation found, skipping backup"
    fi
}

# Setup application directory
setup_app_directory() {
    log_info "Setting up application directory..."
    
    # Create app directory if it doesn't exist
    sudo mkdir -p "$APP_DIR"
    sudo chown "$USER:$USER" "$APP_DIR"
    
    # Create logs directory
    mkdir -p "$APP_DIR/logs"
    
    log_success "Application directory setup complete"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    cd "$APP_DIR"
    
    # Install Node.js dependencies
    pnpm install --frozen-lockfile --prod
    
    # Build the application
    pnpm run build
    
    log_success "Dependencies installed and application built"
}

# Setup environment
setup_environment() {
    log_info "Setting up environment..."
    
    cd "$APP_DIR"
    
    # Copy environment file if it doesn't exist
    if [[ ! -f ".env.production" ]]; then
        if [[ -f ".env.production.example" ]]; then
            cp .env.production.example .env.production
            log_warning "Created .env.production from example. Please update with your values."
        else
            log_error ".env.production.example not found"
            exit 1
        fi
    fi
    
    # Set environment variables
    export NODE_ENV="$NODE_ENV"
    export PORT="$APP_PORT"
    
    log_success "Environment setup complete"
}

# Setup PM2 ecosystem
setup_pm2() {
    log_info "Setting up PM2 configuration..."
    
    cd "$APP_DIR"
    
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: './build/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: $APP_PORT
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: $APP_PORT
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000
  }]
};
EOF
    
    log_success "PM2 configuration created"
}

# Deploy application
deploy_application() {
    log_info "Deploying application..."
    
    cd "$APP_DIR"
    
    # Stop existing application
    if pm2 list | grep -q "$APP_NAME"; then
        log_info "Stopping existing application..."
        pm2 stop "$APP_NAME"
        pm2 delete "$APP_NAME"
    fi
    
    # Start application with PM2
    pm2 start ecosystem.config.js --env production
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    pm2 startup systemd -u "$USER" --hp "$HOME" || true
    
    log_success "Application deployed and started"
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    # Wait for application to start
    sleep 10
    
    # Check if application is responding
    if curl -f "http://localhost:$APP_PORT/api/health" > /dev/null 2>&1; then
        log_success "Health check passed - application is running"
    else
        log_error "Health check failed - application may not be running properly"
        pm2 logs "$APP_NAME" --lines 20
        exit 1
    fi
}

# Setup nginx configuration
setup_nginx_config() {
    log_info "Setting up nginx configuration..."
    
    NGINX_CONFIG="/etc/nginx/sites-available/$APP_NAME"
    DOMAIN="${DOMAIN:-localhost}"
    
    sudo tee "$NGINX_CONFIG" > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=login:10m rate=1r/s;
    
    # Main application
    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # API rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Auth endpoints with stricter rate limiting
    location ~ ^/api/(auth|login|register) {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://localhost:$APP_PORT;
    }
    
    # Health check endpoint
    location /api/health {
        access_log off;
        proxy_pass http://localhost:$APP_PORT;
    }
}
EOF
    
    # Enable the site
    sudo ln -sf "$NGINX_CONFIG" "/etc/nginx/sites-enabled/$APP_NAME"
    
    # Test nginx configuration
    if sudo nginx -t; then
        sudo systemctl reload nginx
        log_success "Nginx configuration updated and reloaded"
    else
        log_error "Nginx configuration test failed"
        exit 1
    fi
}

# Main deployment function
main() {
    log_info "Starting LaunchPadder deployment..."
    
    check_root
    check_prerequisites
    create_backup
    setup_app_directory
    install_dependencies
    setup_environment
    setup_pm2
    deploy_application
    health_check
    
    # Setup nginx if requested
    if [[ "${SETUP_NGINX:-}" == "true" ]]; then
        setup_nginx_config
    fi
    
    log_success "Deployment completed successfully!"
    log_info "Application is running on http://localhost:$APP_PORT"
    log_info "PM2 status: pm2 status"
    log_info "Application logs: pm2 logs $APP_NAME"
    
    if [[ "${SETUP_NGINX:-}" == "true" ]]; then
        log_info "Nginx configuration created for domain: ${DOMAIN:-localhost}"
        log_info "Don't forget to setup SSL with certbot if needed"
    fi
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "LaunchPadder Deployment Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Environment Variables:"
        echo "  APP_PORT=3000          Application port (default: 3000)"
        echo "  APP_USER=launchpadder  Application user (default: launchpadder)"
        echo "  APP_DIR=/opt/launchpadder  Application directory"
        echo "  NODE_ENV=production    Node environment"
        echo "  DOMAIN=localhost       Domain name for nginx"
        echo "  SETUP_NGINX=true       Setup nginx configuration"
        echo ""
        echo "Examples:"
        echo "  $0                     # Basic deployment"
        echo "  DOMAIN=example.com SETUP_NGINX=true $0  # With nginx setup"
        echo "  APP_PORT=4000 $0       # Custom port"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac